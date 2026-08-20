const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const supabase = require("../db/supabase");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Create Mother (Onboarding) ────────────────────────────────────────────────
// Merged: Accepts both clinical fields and onboarding fields
exports.createMother = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    age,
    weeks_pregnant, // From frontend Onboarding
    weeksPregnantAtRegistration, // From backend POST /mothers fallback
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
    // Clinical fields
    lmp_date,
    gravida,
    para,
    blood_group,
    address,
    emergency_contact,
  } = req.body;

  // Determine weeks_pregnant correctly
  const weeks = weeks_pregnant || weeksPregnantAtRegistration || 0;

  const result = await pool.query(
    `INSERT INTO mothers (
      name, phone, age, weeks_pregnant_at_registration, county, id_number,
      nurse_name, nurse_phone, facility_name, facility_code,
      partner_name, partner_age, partner_phone,
      profile_photo_url, conditions, registration_date, edd,
      lmp_date, gravida, para, blood_group, address, emergency_contact
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    RETURNING id`,
    [
      name,
      phone,
      age,
      weeks,
      county,
      id_number,
      nurse_name,
      nurse_phone,
      facility_name,
      facility_code,
      partner_name,
      partner_age,
      partner_phone,
      profile_photo || null,
      conditions || [],
      registration_date || new Date().toISOString(),
      edd || null,
      lmp_date || null,
      gravida || "G0P0",
      para || "P0",
      blood_group || null,
      address || null,
      emergency_contact || null,
    ],
  );

  res.status(201).json({ success: true, data: { id: result.rows[0].id } });
});

// ── Update Mother (Profile Sync) ──────────────────────────────────────────────
// FIX: Explicit type casting to avoid PostgreSQL "22P02" error
exports.updateMother = async (req, res) => {
  const { phone } = req.params;
  const updates = req.body;

  // List of fields the frontend sends (matching the data types in your DB)
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
    "password_hash",
  ];

  const filteredUpdates = {};
  for (const key of allowedFields) {
    if (updates.hasOwnProperty(key)) {
      filteredUpdates[key] = updates[key];
    }
  }

  const keys = Object.keys(filteredUpdates);
  if (keys.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "No valid fields to update" });
  }

  // Build SET clause with explicit type casting to avoid 22P02
  const setClause = keys
    .map((key, i) => {
      if (
        ["age", "weeks_pregnant_at_registration", "partner_age"].includes(key)
      ) {
        return `"${key}" = $${i + 1}::int`; // Force integer type
      }
      if (key === "pin_set") {
        return `"${key}" = $${i + 1}::boolean`; // Force boolean type
      }
      if (["conditions"].includes(key)) {
        return `"${key}" = $${i + 1}::jsonb`; // Force JSONB for arrays
      }
      return `"${key}" = $${i + 1}`;
    })
    .join(", ");

  const values = keys.map((key) => filteredUpdates[key]);
  values.push(phone);

  try {
    const query = `UPDATE mothers SET ${setClause}, updated_at = NOW() WHERE phone = $${keys.length + 1} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Mother not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error updating mother:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Get Mother by Phone ────────────────────────────────────────────────────────
const getMotherByPhone = asyncHandler(async (req, res) => {
  const { phone } = req.params;

  const { rows } = await pool.query(`SELECT * FROM mothers WHERE phone = $1`, [
    phone,
  ]);

  if (rows.length === 0) {
    throw new ApiError(
      404,
      `No mother found with phone ${phone}`,
      errorCodes.NOT_FOUND,
    );
  }

  const mother = rows[0];

  // Fetch associated clinical data
  const [visits, labs, vax, symptoms, alerts] = await Promise.all([
    pool.query(
      `SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number`,
      [mother.id],
    ),
    pool.query(
      `SELECT * FROM lab_results WHERE mother_id = $1 ORDER BY test_date DESC`,
      [mother.id],
    ),
    pool.query(
      `SELECT * FROM vaccinations WHERE mother_id = $1 ORDER BY administration_date`,
      [mother.id],
    ),
    pool.query(
      `SELECT * FROM symptom_logs WHERE mother_id = $1 ORDER BY log_date DESC`,
      [mother.id],
    ),
    pool.query(
      `SELECT * FROM alerts WHERE mother_id = $1 ORDER BY created_at DESC`,
      [mother.id],
    ),
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...mother,
      anc_visits: visits.rows,
      lab_results: labs.rows,
      vaccinations: vax.rows,
      symptom_logs: symptoms.rows,
      alerts: alerts.rows,
    },
  });
});

// ── Upload Profile Photo (Supabase) ────────────────────────────────────────────
exports.uploadProfilePhoto = async (req, res) => {
  const { phone, base64Image } = req.body;
  const buffer = Buffer.from(
    base64Image.replace(/^data:image\/\w+;base64,/, ""),
    "base64",
  );
  const filename = `avatars/${phone}.jpg`;

  const { data, error } = await supabase.storage
    .from("profiles")
    .upload(filename, buffer, { contentType: "image/jpeg", upsert: true });

  if (error) return res.status(500).json({ error: error.message });

  const { data: urlData } = supabase.storage
    .from("profiles")
    .getPublicUrl(filename);

  // Save the public URL to PostgreSQL
  await pool.query(
    "UPDATE mothers SET profile_photo_url = $1 WHERE phone = $2",
    [urlData.publicUrl, phone],
  );

  res.json({ success: true, profilePhotoUrl: urlData.publicUrl });
};

// ── Export Controllers ─────────────────────────────────────────────────────────
module.exports = {
  createMother: exports.createMother,
  updateMother: exports.updateMother,
  getMotherByPhone,
  uploadProfilePhoto: exports.uploadProfilePhoto,
};
