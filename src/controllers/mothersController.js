const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { calculateRisk } = require("../utils/riskEngine");
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption");

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

// ── Helper: Decrypt a mother row safely ────────────────────────────────────
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

// ── Shared: Build full mother response + risk score ────────────────────────
const buildMotherResponse = async (rawMother) => {
  const mother = decryptMotherRow(rawMother);
  if (!mother) return null;

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
    id: v.id,
    visitNumber: v.visit_number,
    scheduledWeek: v.scheduled_week,
    date: v.visit_date,
    attended: v.attended,
    bpSystolic: v.bp_systolic,
    bpDiastolic: v.bp_diastolic,
    weight: v.weight,
    fundalHeight: v.fundal_height,
    urineProtein: v.urine_protein,
    urineGlucose: v.urine_glucose,
    fetalHeartRate: v.fetal_heart_rate,
    nextAppointmentDate: v.next_appointment,
    notes: v.notes,
    recordedBy: v.recorded_by,
    recordedAt: v.recorded_at,
  }));

  const labResults = labs.rows.map((l) => ({
    id: l.id,
    name: l.name,
    value: l.value,
    unit: l.unit,
    normalRange: l.normal_range,
    status: l.status,
    recordedAt: l.recorded_at,
    recordedBy: l.recorded_by,
  }));

  const vaccinations = vax.rows.map((v) => ({
    id: v.id,
    name: v.name,
    targetWeekOrAge: v.target_week_or_age,
    dueDate: v.due_date,
    givenDate: v.given_date,
    given: v.given,
    batchNumber: v.batch_number,
    givenBy: v.given_by,
  }));

  const symptomLogs = symptoms.rows.map((s) => ({
    id: s.id,
    symptom: s.symptom,
    isDanger: s.is_danger,
    subject: s.subject,
    alertFired: s.alert_fired,
    timestamp: s.log_date || s.created_at,
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

  const normalizedPhone = normalizePhone(phone);

  const phoneHash = hashForSearch(normalizedPhone);
  const nameHash = hashForSearch(mappedName.trim().toLowerCase());
  const idHash = hashForSearch(mappedIdNumber);

  const encryptedName = encrypt(mappedName);
  const encryptedPhone = encrypt(normalizedPhone);
  const encryptedIdNumber = encrypt(mappedIdNumber);
  const encryptedPartnerName = partner_name ? encrypt(partner_name) : "";
  const encryptedPartnerPhone = partner_phone ? encrypt(partner_phone) : "";

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

  const result = await pool.query(
    `INSERT INTO mothers (
      name, phone, phone_hash, name_hash, id_number_hash, age, 
      weeks_pregnant_at_registration, county, id_number,
      nurse_name, nurse_phone, facility_name, facility_code,
      partner_name, partner_age, partner_phone, profile_photo_url, conditions, 
      registration_date, edd, lmp_date, gravida, para, blood_group, address, 
      emergency_contact, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::int, $7::int, $8, $9,
      $10, $11, $12, $13, $14, $15::int, $16, $17, $18::jsonb, 
      $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()
    )
    ON CONFLICT (phone_hash) DO UPDATE SET
      name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = NOW()
    RETURNING id, phone, name`,
    [
      encryptedName,
      encryptedPhone,
      phoneHash,
      nameHash,
      idHash,
      age ? parseInt(age) : null,
      computedWeeks,
      mappedCounty,
      encryptedIdNumber,
      nurse_name || "",
      nurse_phone || "",
      facility_name || "",
      facility_code || "",
      encryptedPartnerName,
      partner_age ? parseInt(partner_age) : null,
      encryptedPartnerPhone,
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
  const regCode = generateRegistrationCode();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO registration_codes 
     (code, mother_phone, mother_name, weeks_pregnant, nurse_id, facility_name, facility_code, expires_at, used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE) ON CONFLICT (code) DO NOTHING`,
    [
      regCode,
      normalizedPhone,
      mappedName,
      computedWeeks,
      null,
      facility_name || "",
      facility_code || "",
      expiresAt,
    ],
  );

  res.status(201).json({
    success: true,
    data: {
      mother: {
        id: motherId,
        name: mappedName,
        phone: normalizedPhone,
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
  const phoneHash = hashForSearch(normalizedPhone);
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
      if (
        ["name", "id_number", "partner_name", "partner_phone"].includes(key)
      ) {
        filteredUpdates[key] = encrypt(String(updates[key]));
      } else if (key === "conditions") {
        filteredUpdates[key] = JSON.stringify(updates[key]);
      } else {
        filteredUpdates[key] = updates[key];
      }
    }
  }

  const keys = Object.keys(filteredUpdates);
  if (keys.length === 0)
    return res
      .status(400)
      .json({ success: false, error: "No valid fields to update" });

  const setClause = keys
    .map((key, i) => {
      if (
        ["age", "weeks_pregnant_at_registration", "partner_age"].includes(key)
      )
        return `"${key}" = $${i + 1}::int`;
      if (key === "pin_set") return `"${key}" = $${i + 1}::boolean`;
      if (key === "conditions") return `"${key}" = $${i + 1}::jsonb`;
      return `"${key}" = $${i + 1}`;
    })
    .join(", ");

  const values = keys.map((k) => filteredUpdates[k]);
  values.push(phoneHash);

  try {
    const query = `UPDATE mothers SET ${setClause}, updated_at = NOW() WHERE phone_hash = $${keys.length + 1} RETURNING id`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "Mother not found" });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Get Mother by Phone ───────────────────────────────────────────────────
const getMotherByPhone = asyncHandler(async (req, res) => {
  const normalizedPhone = normalizePhone(req.params.phone);
  const phoneHash = hashForSearch(normalizedPhone);

  const { rows } = await pool.query(
    "SELECT * FROM mothers WHERE phone_hash = $1",
    [phoneHash],
  );
  if (rows.length === 0)
    throw new ApiError(404, `No mother found`, errorCodes.NOT_FOUND);

  const data = await buildMotherResponse(rows[0]);
  res.status(200).json({ success: true, data });
});

// ── Get Mother by ID ───────────────────────────────────────────────────────
const getMotherById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id))
    throw new ApiError(400, "Invalid ID", errorCodes.BAD_REQUEST);

  const { rows } = await pool.query("SELECT * FROM mothers WHERE id = $1", [
    id,
  ]);
  if (rows.length === 0)
    throw new ApiError(404, `No mother found`, errorCodes.NOT_FOUND);

  // 👇 ENFORCE FACILITY ISOLATION
  if (req.facilityFilter && rows[0].facility_code !== req.facilityFilter) {
    throw new ApiError(
      403,
      "Unauthorized to view this patient",
      errorCodes.FORBIDDEN,
    );
  }

  const data = await buildMotherResponse(rows[0]);
  res.status(200).json({ success: true, data });
});

// ── Get All Mothers (Enforces Facility Isolation) ─────────────────────────
const getAllMothers = asyncHandler(async (req, res) => {
  let query = "SELECT * FROM mothers WHERE 1=1";
  const params = [];

  if (req.facilityFilter) {
    query += " AND facility_code = $1";
    params.push(req.facilityFilter);
  }

  query += " ORDER BY created_at DESC";
  const result = await pool.query(query, params);

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

// ── Search Mothers (Enforces Facility Isolation) ──────────────────────────
const searchMothers = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  let query = "SELECT * FROM mothers WHERE 1=1";
  const params = [];
  const conditions = [];

  // 👇 STRICT FACILITY ISOLATION
  if (req.facilityFilter) {
    conditions.push(`facility_code = $${params.length + 1}`);
    params.push(req.facilityFilter);
  }

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

  if (conditions.length > 0) query += " AND " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC LIMIT 50";

  const result = await pool.query(query, params);

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

// ── Upload Profile Photo ───────────────────────────────────────────────────
const uploadProfilePhoto = async (req, res) => {
  try {
    const supabase = require("../db/supabase");
    const { phone, base64Image } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const phoneHash = hashForSearch(normalizedPhone);

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
      "UPDATE mothers SET profile_photo_url = $1 WHERE phone_hash = $2",
      [urlData.publicUrl, phoneHash],
    );

    res.json({ success: true, profilePhotoUrl: urlData.publicUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  createMother,
  updateMother,
  getMotherByPhone,
  getMotherById,
  getAllMothers,
  searchMothers,
  uploadProfilePhoto,
};
