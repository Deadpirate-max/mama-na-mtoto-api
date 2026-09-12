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
// ── Create Mother (Onboarding) ────────────────────────────────────────────────
// ── Create Mother (Onboarding + Dashboard) ────────────────────────────────
// ── Create Mother (Onboarding + Dashboard) ────────────────────────────────
exports.createMother = asyncHandler(async (req, res) => {
  const {
    // Dashboard field names
    nationalId,
    village,
    parity,
    lmp,

    // Backend / mobile app field names
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
    gravida,
    para,
    blood_group,
    address,
    emergency_contact,
  } = req.body;

  // 🛡️ Map dashboard fields → backend fields (with fallbacks)
  const mappedName = name || "Unknown Mother";
  const mappedCounty = county || "N/A";
  const mappedIdNumber = id_number || nationalId || "";
  const mappedAddress = address || village || "";
  const mappedLmp = lmp_date || lmp || null;
  const nurseNameFinal = nurse_name || "";
  const nursePhoneFinal = nurse_phone || "";
  const facilityNameFinal = facility_name || "";
  const facilityCodeFinal = facility_code || "";

  const normalizedPhone = normalizePhone(phone);

  // 🛡️ Coerce gravida / para / parity to strings in the correct format
  const gravidaRaw = String(gravida ?? "1").replace(/\D/g, "") || "1";
  const paraRaw = String(para ?? parity ?? "0").replace(/\D/g, "") || "0";
  const gravidaStr = `G${gravidaRaw}P${paraRaw}`;
  const paraStr = `P${paraRaw}`;

  // 🛡️ Auto-compute weeks_pregnant from LMP if not provided
  let computedWeeks =
    parseInt(weeks_pregnant || weeksPregnantAtRegistration || 0) || 0;
  if (!computedWeeks && mappedLmp) {
    const lmpDate = new Date(mappedLmp);
    const today = new Date();
    const diffDays = Math.floor(
      (today.getTime() - lmpDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    computedWeeks = Math.max(0, Math.min(42, Math.floor(diffDays / 7)));
  }

  // 🛡️ Handle conditions as JSON array
  let conditionsJson = "[]";
  if (Array.isArray(conditions)) {
    conditionsJson = JSON.stringify(conditions);
  } else if (typeof conditions === "string") {
    conditionsJson = conditions;
  }

  // 🛡️ Compute EDD if missing
  let computedEdd = edd || null;
  if (!computedEdd && mappedLmp) {
    const lmpDate = new Date(mappedLmp);
    lmpDate.setDate(lmpDate.getDate() + 280);
    computedEdd = lmpDate.toISOString().split("T")[0];
  }

  // 🚀 INSERT with all mapped variables
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
      name                           = EXCLUDED.name,
      age                            = EXCLUDED.age,
      weeks_pregnant_at_registration = EXCLUDED.weeks_pregnant_at_registration,
      county                         = EXCLUDED.county,
      id_number                      = EXCLUDED.id_number,
      nurse_name                     = EXCLUDED.nurse_name,
      nurse_phone                    = EXCLUDED.nurse_phone,
      facility_name                  = EXCLUDED.facility_name,
      facility_code                  = EXCLUDED.facility_code,
      partner_name                   = EXCLUDED.partner_name,
      partner_phone                  = EXCLUDED.partner_phone,
      conditions                     = EXCLUDED.conditions,
      edd                            = EXCLUDED.edd,
      gravida                        = EXCLUDED.gravida,
      para                           = EXCLUDED.para,
      updated_at                     = NOW()
    RETURNING id, phone, name, nurse_name, facility_name`,
    [
      mappedName, // $1
      normalizedPhone, // $2
      age ? parseInt(age) : null, // $3
      computedWeeks, // $4
      mappedCounty, // $5
      mappedIdNumber, // $6
      nurseNameFinal, // $7
      nursePhoneFinal, // $8
      facilityNameFinal, // $9
      facilityCodeFinal, // $10
      partner_name || "", // $11
      partner_age ? parseInt(partner_age) : null, // $12
      partner_phone || "", // $13
      profile_photo || null, // $14
      conditionsJson, // $15
      registration_date || new Date().toISOString(), // $16
      computedEdd, // $17
      mappedLmp, // $18
      gravidaStr, // $19
      paraStr, // $20
      blood_group || null, // $21
      mappedAddress, // $22
      emergency_contact || null, // $23
    ],
  );

  console.log(
    `✅ Mother created/updated: ${normalizedPhone} (nurse: ${nurseNameFinal})`,
  );

  // 🚀 Return in the shape the dashboard expects
  res.status(201).json({
    success: true,
    data: {
      mother: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        phone: result.rows[0].phone,
        registrationCode: "N/A",
        edd: computedEdd,
        gravida: gravidaStr,
        parity: paraStr,
        riskLevel: "low",
        village: mappedAddress,
        lmp: mappedLmp,
        age: age ? parseInt(age) : 0,
        createdAt: new Date().toISOString(),
      },
      smsSent: false,
    },
  });
});

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

exports.getAllMothers = asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM mothers ORDER BY created_at DESC",
    );
    // Map to camelCase if needed (like you did in getMotherByPhone)
    const mothers = result.rows.map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      age: m.age,
      idNumber: m.id_number,
      county: m.county,
      weeksPregnantAtRegistration: m.weeks_pregnant_at_registration,
      edd: m.edd,
      nurseName: m.nurse_name,
      facilityName: m.facility_name,
    }));
    res.status(200).json({ success: true, data: mothers });
  } catch (error) {
    console.error("Error fetching all mothers:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Search Mothers (For CHV Dashboard) ─────────────────────────────────────
exports.searchMothers = asyncHandler(async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      // Empty query → return all mothers (recent first)
      const result = await pool.query(
        "SELECT * FROM mothers ORDER BY created_at DESC LIMIT 50",
      );
      return res.status(200).json({ success: true, data: result.rows });
    }

    // Search by name OR phone (case-insensitive)
    const result = await pool.query(
      `SELECT * FROM mothers 
       WHERE name ILIKE $1 OR phone ILIKE $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [`%${q}%`],
    );

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("searchMothers error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = {
  createMother: exports.createMother,
  updateMother: exports.updateMother,
  getMotherByPhone: exports.getMotherByPhone,
  uploadProfilePhoto: exports.uploadProfilePhoto,
  getAllMothers: exports.getAllMothers,
  searchMothers: exports.searchMothers, // <-- ADD THIS
};
