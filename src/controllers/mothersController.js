const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Normalize Kenyan phone ─────────────────────────────────────────────────
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
// ── Generate 8-character registration code ─────────────────────────────────
const generateRegistrationCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// ── Create Mother (Onboarding + Dashboard) ─────────────────────────────────
const createMother = asyncHandler(async (req, res) => {
  const {
    nationalId,
    village,
    parity,
    lmp,
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

  const gravidaRaw = String(gravida ?? "1").replace(/\D/g, "") || "1";
  const paraRaw = String(para ?? parity ?? "0").replace(/\D/g, "") || "0";
  const gravidaStr = `G${gravidaRaw}P${paraRaw}`;
  const paraStr = `P${paraRaw}`;

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

  let conditionsJson = "[]";
  if (Array.isArray(conditions)) conditionsJson = JSON.stringify(conditions);
  else if (typeof conditions === "string") conditionsJson = conditions;

  let computedEdd = edd || null;
  if (!computedEdd && mappedLmp) {
    const lmpDate = new Date(mappedLmp);
    lmpDate.setDate(lmpDate.getDate() + 280);
    computedEdd = lmpDate.toISOString().split("T")[0];
  }

  // 🚀 STEP 1: Insert the mother
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
      mappedName,
      normalizedPhone,
      age ? parseInt(age) : null,
      computedWeeks,
      mappedCounty,
      mappedIdNumber,
      nurseNameFinal,
      nursePhoneFinal,
      facilityNameFinal,
      facilityCodeFinal,
      partner_name || "",
      partner_age ? parseInt(partner_age) : null,
      partner_phone || "",
      profile_photo || null,
      conditionsJson,
      registration_date || new Date().toISOString(),
      computedEdd,
      mappedLmp,
      gravidaStr,
      paraStr,
      blood_group || null,
      mappedAddress,
      emergency_contact || null,
    ],
  );

  const motherId = result.rows[0].id;

  // 🚀 STEP 2: Generate and save a registration code
  const regCode = generateRegistrationCode();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  await pool.query(
    `INSERT INTO registration_codes 
     (code, mother_phone, mother_name, weeks_pregnant, nurse_id, 
      facility_name, facility_code, expires_at, used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
     ON CONFLICT (code) DO NOTHING`,
    [
      regCode,
      normalizedPhone,
      mappedName,
      computedWeeks,
      null, // nurse_id — fill if you have it from req.chv
      facilityNameFinal,
      facilityCodeFinal,
      expiresAt,
    ],
  );

  console.log(
    `✅ Mother created/updated: ${normalizedPhone} (code: ${regCode})`,
  );

  // 🚀 STEP 3: Return the code in the response
  res.status(201).json({
    success: true,
    data: {
      mother: {
        id: motherId,
        name: result.rows[0].name,
        phone: result.rows[0].phone,
        registrationCode: regCode,
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

// ── Update Mother ──────────────────────────────────────────────────────────
const updateMother = async (req, res) => {
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
      filteredUpdates[key] = Array.isArray(updates[key])
        ? JSON.stringify(updates[key])
        : updates[key];
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
      if (key === "pin_set") return `"${key}" = $${i + 1}::boolean`;
      if (key === "conditions") return `"${key}" = $${i + 1}::jsonb`;
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Get Mother (by UUID or phone) ──────────────────────────────────────────
const getMother = asyncHandler(async (req, res) => {
  const raw = req.params.id;
  const isUuid = UUID_RE.test(raw);
  const value = isUuid ? raw : normalizePhone(raw);

  const { rows } = await pool.query(
    isUuid
      ? "SELECT * FROM mothers WHERE id = $1"
      : "SELECT * FROM mothers WHERE phone = $1",
    [value],
  );

  if (rows.length === 0) {
    throw new ApiError(
      404,
      `No mother found with ${isUuid ? "id" : "phone"} ${value}`,
      errorCodes.NOT_FOUND,
    );
  }
  const m = rows[0];

  // Optional: latest registration code + next appointment
  const [{ rows: codeRows }, { rows: nextRows }] = await Promise.all([
    pool.query(
      `SELECT code FROM registration_codes
       WHERE mother_phone = $1
       ORDER BY expires_at DESC LIMIT 1`,
      [m.phone],
    ),
    pool.query(
      `SELECT next_appointment FROM anc_visits
       WHERE mother_id = $1 AND next_appointment > NOW()
       ORDER BY next_appointment ASC LIMIT 1`,
      [m.id],
    ),
  ]);

  res.status(200).json({
    success: true,
    data: {
      id: m.id,
      name: m.name,
      phone: m.phone,
      registrationCode: codeRows[0]?.code ?? null,
      age: m.age,
      nationalId: m.id_number ?? "",
      village: m.address ?? m.county ?? "",
      lmp: m.lmp_date,
      edd: m.edd,
      gravida: m.gravida,
      parity: m.para,
      riskLevel: "low", // plug in real logic later
      nextAppointment: nextRows[0]?.next_appointment ?? null,
      createdAt: m.created_at,
      nurse_name: m.nurse_name,
      nurse_phone: m.nurse_phone,
      facility_name: m.facility_name,
      facility_code: m.facility_code,
    },
  });
});

// ── Sub-route: ANC visits ──────────────────────────────────────────────────
const getAncVisits = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number",
    [req.params.id],
  );
  res.status(200).json({
    success: true,
    data: rows.map((v) => ({
      id: v.id,
      motherId: v.mother_id,
      visitDate: v.visit_date,
      gestationWeeks: v.gestation_weeks,
      bpSystolic: v.bp_systolic,
      bpDiastolic: v.bp_diastolic,
      weightKg: v.weight_kg,
      fundalHeightCm: v.fundal_height_cm,
      fetalHeartRate: v.fetal_heart_rate,
      urineProtein: v.urine_protein,
      urineGlucose: v.urine_glucose,
      notes: v.notes,
      nextAppointment: v.next_appointment,
      flags: v.flags ?? [],
    })),
  });
});

// ── Sub-route: lab results ─────────────────────────────────────────────────
const getLabResults = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM lab_results WHERE mother_id = $1 ORDER BY test_date DESC",
    [req.params.id],
  );
  res.status(200).json({
    success: true,
    data: rows.map((l) => ({
      id: l.id,
      motherId: l.mother_id,
      testDate: l.test_date,
      bloodGroup: l.blood_group,
      hb: l.hb,
      hivStatus: l.hiv_status,
      urinalysis: l.urinalysis,
      bloodSugar: l.blood_sugar,
      syphilis: l.syphilis,
      flags: l.flags ?? [],
    })),
  });
});

// ── Sub-route: vaccinations ────────────────────────────────────────────────
const getVaccinations = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM vaccinations WHERE mother_id = $1 ORDER BY administration_date",
    [req.params.id],
  );
  res.status(200).json({
    success: true,
    data: rows.map((v) => ({
      id: v.id,
      motherId: v.mother_id,
      vaccine: v.vaccine,
      dose: v.dose,
      givenDate: v.administration_date,
      batchNumber: v.batch_number,
      administeredBy: v.administered_by,
      nextDueDate: v.next_due_date,
    })),
  });
});

// ── Get All Mothers (filtered by nurse) ────────────────────────────────────
const getAllMothers = asyncHandler(async (req, res) => {
  const nursePhone = req.chv?.phone;
  let query = "SELECT * FROM mothers";
  const params = [];

  if (nursePhone) {
    query += " WHERE nurse_phone = $1";
    params.push(nursePhone);
  }
  query += " ORDER BY created_at DESC";

  const result = await pool.query(query, params);

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
    nursePhone: m.nurse_phone,
    facilityName: m.facility_name,
    facilityCode: m.facility_code,
    createdAt: m.created_at,
  }));

  res.status(200).json({ success: true, data: mothers });
});

// ── Search Mothers (filtered by nurse) ─────────────────────────────────────
const searchMothers = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const nursePhone = req.chv?.phone;

  let query = "SELECT * FROM mothers";
  const params = [];
  const conditions = [];

  // 🛡️ MULTI-TENANT FILTER
  if (nursePhone) {
    conditions.push(`nurse_phone = $${params.length + 1}`);
    params.push(nursePhone);
  }

  // 🛡️ SEARCH with phone normalization
  if (q) {
    // Normalize query to handle 0795..., 254795..., +254795...
    const digitsOnly = q.replace(/\D/g, "");
    let normalized = q;

    if (digitsOnly.length >= 9) {
      // Looks like a phone number
      if (digitsOnly.startsWith("0")) {
        normalized = "+254" + digitsOnly.substring(1);
      } else if (digitsOnly.startsWith("254")) {
        normalized = "+" + digitsOnly;
      } else if (/^[17]\d{8}$/.test(digitsOnly)) {
        normalized = "+254" + digitsOnly;
      }
    }

    // Match either name OR phone (using normalized phone)
    conditions.push(
      `(name ILIKE $${params.length + 1} OR phone ILIKE $${params.length + 1} OR phone ILIKE $${params.length + 2})`,
    );
    params.push(`%${q}%`); // Raw search (for names)
    params.push(`%${normalized}%`); // Normalized (for phones)
  }

  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC LIMIT 50";

  const result = await pool.query(query, params);

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
    nursePhone: m.nurse_phone,
    facilityName: m.facility_name,
  }));

  res.status(200).json({ success: true, data: mothers });
});
// ── Upload Profile Photo ───────────────────────────────────────────────────
const uploadProfilePhoto = async (req, res) => {
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

// ── Export ALL functions ───────────────────────────────────────────────────
module.exports = {
  createMother,
  updateMother,
  getMother,
  getAncVisits,
  getLabResults,
  getVaccinations,
  getAllMothers,
  searchMothers,
  uploadProfilePhoto,
};
