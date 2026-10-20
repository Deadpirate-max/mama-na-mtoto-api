const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { calculateRisk } = require("../utils/riskEngine");
// 👇 IMPORT ENCRYPTION HELPERS
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption");

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

const generateRegistrationCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// 👇 HELPER TO DECRYPT A MOTHER ROW BEFORE RETURNING IT
const decryptMotherRow = (mother) => {
  if (!mother) return null;
  return {
    ...mother,
    name: decrypt(mother.name),
    phone: decrypt(mother.phone),
    id_number: decrypt(mother.id_number),
    partner_name: mother.partner_name ? decrypt(mother.partner_name) : null,
    partner_phone: mother.partner_phone ? decrypt(mother.partner_phone) : null,
  };
};

const buildMotherResponse = async (rawMother) => {
  const mother = decryptMotherRow(rawMother); // 👈 DECRYPT FIRST

  const [visits, labs, vax, symptoms, alerts] = await Promise.all([
    pool.query(
      "SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number ASC",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM lab_results WHERE mother_id = $1 ORDER BY test_date DESC NULLS LAST",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM vaccinations WHERE mother_id = $1 ORDER BY administration_date ASC NULLS LAST",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM symptom_logs WHERE mother_id = $1 ORDER BY log_date DESC LIMIT 20",
      [mother.id],
    ),
    pool.query(
      "SELECT * FROM alerts WHERE mother_id = $1 ORDER BY created_at DESC LIMIT 20",
      [mother.id],
    ),
  ]);

  const ancVisits = visits.rows.map((v) => ({
    /* ... existing mapping ... */
  }));
  const labResults = labs.rows.map((l) => ({
    /* ... existing mapping ... */
  }));
  const vaccinations = vax.rows.map((v) => ({
    /* ... existing mapping ... */
  }));
  const symptomLogs = symptoms.rows.map((s) => ({
    /* ... existing mapping ... */
  }));

  const motherResponse = {
    id: mother.id,
    name: mother.name,
    age: mother.age,
    idNumber: mother.id_number,
    phone: mother.phone,
    county: mother.county,
    village: mother.address,
    profilePhoto: mother.profile_photo_url || null,
    weeksPregnantAtRegistration: mother.weeks_pregnant_at_registration,
    registrationDate: mother.registration_date,
    edd: mother.edd,
    lmp: mother.lmp_date,
    gravida: mother.gravida,
    para: mother.para,
    bloodGroup: mother.blood_group,
    conditions: Array.isArray(mother.conditions) ? mother.conditions : [],
    nurseName: mother.nurse_name,
    nursePhone: mother.nurse_phone,
    facilityName: mother.facility_name,
    facilityCode: mother.facility_code,
    partnerName: mother.partner_name,
    partnerAge: mother.partner_age,
    partnerPhone: mother.partner_phone,
    pinSet: mother.pin_set,
    ancVisits,
    labResults,
    vaccinations,
    symptomLogs,
    alerts: alerts.rows,
    createdAt: mother.created_at,
    lastSyncedAt: mother.updated_at,
  };

  const risk = calculateRisk(motherResponse);
  return {
    ...motherResponse,
    riskLevel: risk.level,
    riskScore: risk.score,
    riskFactors: risk.factors,
    riskSummary: risk.summary,
    riskAlertMessage: risk.nurseAlert ? risk.alertMessage : null,
  };
};

// ── Create Mother ─────────────────────────────────────────────────────────
const createMother = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    id_number,
    partner_name,
    partner_phone /* ... other fields */,
  } = req.body;

  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);
  const nameHash = hashForSearch(name.trim().toLowerCase());
  const idHash = hashForSearch(id_number || "");

  // 👇 ENCRYPT SENSITIVE FIELDS
  const encryptedName = encrypt(name);
  const encryptedPhone = encrypt(normalizedPhone);
  const encryptedIdNumber = encrypt(id_number || "");
  const encryptedPartnerName = partner_name ? encrypt(partner_name) : "";
  const encryptedPartnerPhone = partner_phone ? encrypt(partner_phone) : "";

  // ... (keep your computedWeeks, conditionsJson, computedEdd logic here) ...

  const result = await pool.query(
    `INSERT INTO mothers (
      name, phone, phone_hash, name_hash, id_number_hash, id_number, 
      partner_name, partner_phone, /* ... other columns ... */
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, /* ... other placeholders ... */
    )
    ON CONFLICT (phone_hash) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      /* ... other fields ... */
    RETURNING id, phone, name`,
    [
      encryptedName,
      encryptedPhone,
      phoneHash,
      nameHash,
      idHash,
      encryptedIdNumber,
      encryptedPartnerName,
      encryptedPartnerPhone /* ... other values ... */,
    ],
  );

  // ... (keep registration code logic) ...

  res.status(201).json({
    success: true,
    data: {
      mother: {
        id: result.rows[0].id,
        name: name, // Return plain text to the mobile app
        phone: normalizedPhone,
        registrationCode: regCode,
        // ... other fields ...
      },
    },
  });
});

// ── Update Mother ──────────────────────────────────────────────────────────
const updateMother = async (req, res) => {
  const { phone } = req.params;
  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);
  const updates = req.body;

  const allowedFields = [
    "name",
    "age",
    "id_number",
    "county",
    "profile_photo_url",
    "partner_name",
    "partner_age",
    "partner_phone",
    "pin_hash",
    "pin_set",
  ];

  const filteredUpdates = {};
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      // 👇 ENCRYPT PII IF IT'S BEING UPDATED
      if (
        ["name", "id_number", "partner_name", "partner_phone"].includes(key)
      ) {
        filteredUpdates[key] = encrypt(String(updates[key]));
      } else {
        filteredUpdates[key] = updates[key];
      }
    }
  }

  const keys = Object.keys(filteredUpdates);
  if (keys.length === 0)
    return res.status(400).json({ success: false, error: "No valid fields" });

  const setClause = keys.map((key, i) => `"${key}" = $${i + 1}`).join(", ");
  const values = keys.map((k) => filteredUpdates[k]);
  values.push(phoneHash);

  try {
    // 👇 UPDATE BY HASH
    const query = `UPDATE mothers SET ${setClause}, updated_at = NOW() WHERE phone_hash = $${keys.length + 1} RETURNING id, phone`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "Mother not found" });

    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Get Mother by Phone ───────────────────────────────────────────────────
const getMotherByPhone = asyncHandler(async (req, res) => {
  const normalizedPhone = normalizePhone(req.params.phone);
  const phoneHash = hashForSearch(normalizedPhone);

  // 👇 SELECT BY HASH
  const { rows } = await pool.query(
    "SELECT * FROM mothers WHERE phone_hash = $1",
    [phoneHash],
  );
  if (rows.length === 0)
    throw new ApiError(404, `No mother found`, errorCodes.NOT_FOUND);

  const data = await buildMotherResponse(rows[0]);
  res.status(200).json({ success: true, data });
});

// ── Get All Mothers ───────────────────────────────────────────────────────
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

  // 👇 DECRYPT EACH ROW BEFORE SENDING
  const mothers = result.rows.map((m) => {
    const decrypted = decryptMotherRow(m);
    return {
      id: decrypted.id,
      name: decrypted.name,
      phone: decrypted.phone,
      age: decrypted.age,
      idNumber: decrypted.id_number,
      county: decrypted.county,
      weeksPregnantAtRegistration: decrypted.weeks_pregnant_at_registration,
      edd: decrypted.edd,
      nurseName: decrypted.nurse_name,
      nursePhone: decrypted.nurse_phone,
      facilityName: decrypted.facility_name,
      facilityCode: decrypted.facility_code,
      createdAt: decrypted.created_at,
    };
  });

  res.status(200).json({ success: true, data: mothers });
});

// ── Search Mothers ─────────────────────────────────────────────────────────
const searchMothers = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const nursePhone = req.chv?.phone;

  let query = "SELECT * FROM mothers";
  const params = [];
  const conditions = [];

  if (nursePhone) {
    conditions.push(`nurse_phone = $${params.length + 1}`);
    params.push(nursePhone);
  }

  // 👇 SEARCH BY PHONE HASH OR ID HASH
  if (q) {
    const digitsOnly = q.replace(/\D/g, "");
    let normalized = q;
    if (digitsOnly.length >= 9) {
      if (digitsOnly.startsWith("0"))
        normalized = "+254" + digitsOnly.substring(1);
      else if (digitsOnly.startsWith("254")) normalized = "+" + digitsOnly;
      else if (/^[17]\d{8}$/.test(digitsOnly)) normalized = "+254" + digitsOnly;
    }

    const phoneHash = hashForSearch(normalized);
    const idHash = hashForSearch(q);
    const nameHash = hashForSearch(q.toLowerCase());

    conditions.push(
      `(phone_hash = $${params.length + 1} OR id_number_hash = $${params.length + 2} OR name_hash = $${params.length + 3})`,
    );
    params.push(phoneHash, idHash, nameHash);
  }

  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC LIMIT 50";

  const result = await pool.query(query, params);

  // 👇 DECRYPT EACH RESULT
  const mothers = result.rows.map((m) => {
    const decrypted = decryptMotherRow(m);
    return {
      id: decrypted.id,
      name: decrypted.name,
      phone: decrypted.phone,
      age: decrypted.age,
      idNumber: decrypted.id_number,
      county: decrypted.county,
      weeksPregnantAtRegistration: decrypted.weeks_pregnant_at_registration,
      edd: decrypted.edd,
      nurseName: decrypted.nurse_name,
      nursePhone: decrypted.nurse_phone,
      facilityName: decrypted.facility_name,
    };
  });

  res.status(200).json({ success: true, data: mothers });
});

module.exports = {
  createMother,
  updateMother,
  getMotherByPhone,
  getMotherById,
  getAllMothers,
  searchMothers,
  uploadProfilePhoto,
};
