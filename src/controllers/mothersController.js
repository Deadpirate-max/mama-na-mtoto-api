const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Normalize Kenyan phone ─────────────────────────────────────────────────────
const normalizePhone = (phone) => {
  if (!phone) return phone;
  let p = phone
    .toString()
    .trim()
    .replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("0")) p = "+254" + p.substring(1);
  else if (p.startsWith("254") && !p.startsWith("+254")) p = "+" + p;
  else if (!p.startsWith("+")) p = "+" + p;
  return p;
};

// ── Create Mother (Onboarding) ────────────────────────────────────────────────
exports.createMother = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    age,
    weeks_pregnant,
    weeksPregnantAtRegistration,
    county,
    id_number,
    nurse_name,
    nurse_phone,
    facility_name,
    facility_code,
    partner_name,
    partner_age,
    partner_phone,
    profile_photo,
    conditions,
    registration_date,
    edd,
    lmp_date,
    // FIX 1: gravida and para are TEXT in DB — never treat as integer
    gravida,
    para,
    blood_group,
    address,
    emergency_contact,
  } = req.body;

  const normalizedPhone = normalizePhone(phone);

  // Determine weeks pregnant from either field name
  const weeks =
    parseInt(weeks_pregnant || weeksPregnantAtRegistration || 0) || 0;

  // FIX 1: Ensure gravida and para are always strings
  const gravidaStr = (gravida || "G1P0").toString().trim();
  const paraStr = (para || "P0").toString().trim();

  // FIX 2: Handle conditions as JSON array
  let conditionsJson = "[]";
  if (Array.isArray(conditions)) {
    conditionsJson = JSON.stringify(conditions);
  } else if (typeof conditions === "string") {
    conditionsJson = conditions;
  }

  // FIX 3: ON CONFLICT — if same phone registers again, update instead of crash
  const result = await pool.query(
    `INSERT INTO mothers (
      name, phone, age, weeks_pregnant_at_registration, county, id_number,
      nurse_name, nurse_phone, facility_name, facility_code,
      partner_name, partner_age, partner_phone,
      profile_photo_url, conditions, registration_date, edd,
      lmp_date, gravida, para, blood_group, address, emergency_contact,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3::int, $4::int, $5, $6,
      $7, $8, $9, $10,
      $11, $12::int, $13,
      $14, $15::jsonb, $16, $17,
      $18, $19, $20, $21, $22, $23,
      NOW(), NOW()
    )
    ON CONFLICT (phone)
    DO UPDATE SET
      name                          = EXCLUDED.name,
      age                           = EXCLUDED.age,
      weeks_pregnant_at_registration = EXCLUDED.weeks_pregnant_at_registration,
      county                        = EXCLUDED.county,
      id_number                     = EXCLUDED.id_number,
      nurse_name                    = EXCLUDED.nurse_name,
      nurse_phone                   = EXCLUDED.nurse_phone,
      facility_name                 = EXCLUDED.facility_name,
      facility_code                 = EXCLUDED.facility_code,
      partner_name                  = EXCLUDED.partner_name,
      partner_phone                 = EXCLUDED.partner_phone,
      conditions                    = EXCLUDED.conditions,
      edd                           = EXCLUDED.edd,
      gravida                       = EXCLUDED.gravida,
      para                          = EXCLUDED.para,
      updated_at                    = NOW()
    RETURNING id, phone`,
    [
      name || "",
      normalizedPhone,
      age ? parseInt(age) : null,
      weeks ? parseInt(weeks) : null,
      county || "",
      id_number || "",
      nurse_name || "",
      nurse_phone || "",
      facility_name || "",
      facility_code || "",
      partner_name || "",
      partner_age ? parseInt(partner_age) : null,
      partner_phone || "",
      profile_photo || null,
      conditionsJson,
      registration_date || new Date().toISOString(),
      edd || null,
      lmp_date || null,
      gravidaStr, // TEXT — never integer
      paraStr, // TEXT — never integer
      blood_group || null,
      address || null,
      emergency_contact || null,
    ],
  );

  console.log(`✅ Mother created/updated: ${normalizedPhone}`);

  res.status(201).json({
    success: true,
    data: {
      id: result.rows[0].id,
      phone: result.rows[0].phone,
    },
  });
});

// ── Update Mother (Profile Sync) ──────────────────────────────────────────────
exports.updateMother = async (req, res) => {
  const { phone } = req.params;
  const normalizedPhone = normalizePhone(phone);
  const updates = req.body;

  const allowedFields = [
    "name",
    "age",
    "id_number",
    "county",
    "profile_photo_url",
    "weeks_pregnant_at_registration",
    "registration_date",
    "edd",
    "gravida",
    "para",
    "conditions",
    "nurse_name",
    "nurse_phone",
    "facility_name",
    "facility_code",
    "partner_name",
    "partner_age",
    "partner_phone",
    "pin_hash",
    "pin_set",
  ];

  const filteredUpdates = {};
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      // 🛡️ If the value is an array (like conditions), stringify it!
      if (Array.isArray(updates[key])) {
        filteredUpdates[key] = JSON.stringify(updates[key]);
      } else {
        filteredUpdates[key] = updates[key];
      }
    }
  }

  const keys = Object.keys(filteredUpdates);
  if (keys.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "No valid fields to update" });
  }

  const setClause = keys
    .map((key, i) => {
      if (
        ["age", "weeks_pregnant_at_registration", "partner_age"].includes(key)
      ) {
        return `"${key}" = $${i + 1}::int`;
      }
      if (key === "pin_set") {
        return `"${key}" = $${i + 1}::boolean`;
      }
      if (key === "conditions") {
        return `"${key}" = $${i + 1}::jsonb`;
      }
      return `"${key}" = $${i + 1}`;
    })
    .join(", ");

  const values = keys.map((k) => filteredUpdates[k]);
  values.push(normalizedPhone);

  try {
    const query = `
      UPDATE mothers
      SET ${setClause}, updated_at = NOW()
      WHERE phone = $${keys.length + 1}
      RETURNING id, phone
    `;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Mother not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("updateMother error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Get Mother by Phone ────────────────────────────────────────────────────────
// ── Get Mother by Phone ────────────────────────────────────────────────────────
exports.getMotherByPhone = asyncHandler(async (req, res) => {
  const normalizedPhone = normalizePhone(req.params.phone);

  const { rows } = await pool.query("SELECT * FROM mothers WHERE phone = $1", [
    normalizedPhone,
  ]);

  if (rows.length === 0) {
    throw new ApiError(
      404,
      `No mother found with phone ${normalizedPhone}`,
      errorCodes.NOT_FOUND,
    );
  }

  const mother = rows[0];

  // Fetch clinical data in parallel
  const [visits, labs, vax, symptoms, alerts] = await Promise.all([
    pool.query(
      "SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM lab_results WHERE mother_id = $1 ORDER BY test_date DESC",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM vaccinations WHERE mother_id = $1 ORDER BY administration_date",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM symptom_logs WHERE mother_id = $1 ORDER BY log_date DESC",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM alerts WHERE mother_id = $1 ORDER BY created_at DESC",
      [mother.id],
    ),
  ]);

  // 🚨 FIX: Map snake_case DB columns to camelCase for React Native
  res.status(200).json({
    success: true,
    data: {
      // Identity
      name: mother.name,
      age: mother.age,
      idNumber: mother.id_number,
      phone: mother.phone,
      county: mother.county,
      profilePhoto: mother.profile_photo_url || null,

      // Pregnancy
      weeksPregnantAtRegistration: mother.weeks_pregnant_at_registration,
      registrationDate: mother.registration_date,
      edd: mother.edd,
      gravida: mother.gravida,
      para: mother.para,
      conditions: Array.isArray(mother.conditions) ? mother.conditions : [],

      // Care Team
      nurseName: mother.nurse_name,
      nursePhone: mother.nurse_phone,
      facilityName: mother.facility_name,
      facilityCode: mother.facility_code,

      // Partner
      partnerName: mother.partner_name,
      partnerAge: mother.partner_age,
      partnerPhone: mother.partner_phone,

      // Clinical (Mapped and separated)
      ancVisits: visits.rows,
      labResults: labs.rows,
      vaccinations: vax.rows,
      symptomLogs: symptoms.rows,
      alerts: alerts.rows,

      // Meta
      createdAt: mother.created_at,
      lastSyncedAt: mother.updated_at,
    },
  });
});

// ── Upload Profile Photo ───────────────────────────────────────────────────────
// FIX 3: Supabase removed from top-level import — loaded lazily
// so a missing SUPABASE_URL env var does not crash the whole controller
exports.uploadProfilePhoto = async (req, res) => {
  try {
    const supabase = require("../db/supabase");
    const { phone, base64Image } = req.body;
    const normalizedPhone = normalizePhone(phone);

    const buffer = Buffer.from(
      base64Image.replace(/^data:image\/\w+;base64,/, ""),
      "base64",
    );
    const filename = `avatars/${normalizedPhone}.jpg`;

    const { error } = await supabase.storage
      .from("profiles")
      .upload(filename, buffer, { contentType: "image/jpeg", upsert: true });

    if (error)
      return res.status(500).json({ success: false, error: error.message });

    const { data: urlData } = supabase.storage
      .from("profiles")
      .getPublicUrl(filename);

    await pool.query(
      "UPDATE mothers SET profile_photo_url = $1 WHERE phone = $2",
      [urlData.publicUrl, normalizedPhone],
    );

    res.json({ success: true, profilePhotoUrl: urlData.publicUrl });
  } catch (err) {
    console.error("uploadProfilePhoto error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = {
  createMother: exports.createMother,
  updateMother: exports.updateMother,
  getMotherByPhone: exports.getMotherByPhone,
  uploadProfilePhoto: exports.uploadProfilePhoto,
};
