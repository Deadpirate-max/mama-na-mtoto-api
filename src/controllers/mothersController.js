const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { calculateRisk } = require("../utils/riskEngine");
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption");
const { mergeProfile } = require("../utils/mergeProfile"); // 👈 ONLY ONE IMPORT HERE

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
    subCounty: mother.sub_county,
    village: mother.village || mother.address,
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
    nurseEntered: mother.nurse_entered || {},
    motherEntered: mother.mother_entered || {},
    fieldConflicts: mother.field_conflicts || {},
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
    registration_code,
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
    sub_county,
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

  const normalizedPhone = normalizePhone(phone);

  // 👇 1. FIND THE NURSE ID (Fixes Care Team N/A)
  let finalNurseId = req.nurse?.id || null;
  if (!finalNurseId && nurse_phone) {
    const normalizedNursePhone = normalizePhone(nurse_phone);
    const nurseRes = await pool.query(
      "SELECT id FROM nurses WHERE phone_hash = $1",
      [hashForSearch(normalizedNursePhone)],
    );
    if (nurseRes.rows.length > 0) finalNurseId = nurseRes.rows[0].id;
  }

  // 2. Get Nurse Data from the Code (if verifying)
  let nurseData = {};
  let finalFacilityCode = req.nurse?.facility || facility_code || "";
  let finalFacilityName = facility_name || "";

  if (registration_code) {
    const { rows } = await pool.query(
      "SELECT * FROM registration_codes WHERE code = $1",
      [registration_code.trim().toUpperCase()],
    );
    if (rows[0]) {
      const r = rows[0];
      if (!finalNurseId) finalNurseId = r.nurse_id;
      if (!finalFacilityCode) finalFacilityCode = r.facility_code;
      if (!finalFacilityName) finalFacilityName = r.facility_name;

      nurseData = {
        name: r.mother_name ? decrypt(r.mother_name) : "",
        id_number: r.id_number ? decrypt(r.id_number) : "",
        county: r.county,
        sub_county: r.sub_county,
        village: r.village,
        partner_name: r.partner_name ? decrypt(r.partner_name) : "",
        partner_phone: r.partner_phone ? decrypt(r.partner_phone) : "",
      };
    }
  }

  // 3. Merge (on plain text)
  const motherData = {
    name,
    id_number,
    county,
    sub_county,
    village,
    partner_name,
    partner_phone,
  };
  const { merged, conflicts, nurseEntered, motherEntered } = mergeProfile(
    nurseData,
    motherData,
  );

  // 4. Encrypt
  const encryptedName = encrypt(merged.name || "Unknown Mother");
  const encryptedPhone = encrypt(normalizedPhone);
  const encryptedIdNumber = encrypt(merged.id_number || "");
  const encryptedPartnerName = merged.partner_name
    ? encrypt(merged.partner_name)
    : "";
  const encryptedPartnerPhone = merged.partner_phone
    ? encrypt(merged.partner_phone)
    : "";

  let conditionsJson = Array.isArray(conditions)
    ? JSON.stringify(conditions)
    : conditions || "[]";
  let computedWeeks =
    parseInt(weeks_pregnant || weeksPregnantAtRegistration || 0) || 0;

  // 5. Insert / Update Mother
  const result = await pool.query(
    `INSERT INTO mothers (
      name, phone, phone_hash, name_hash, id_number_hash, county, 
      sub_county, village, id_number, partner_name, partner_phone,
      nurse_entered, mother_entered, field_conflicts,
      facility_name, facility_code, age, weeks_pregnant_at_registration,
      registration_date, edd, lmp_date, gravida, para, blood_group, address, conditions,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
      $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17::int, $18::int,
      $19, $20, $21, $22, $23, $24, $25, $26::jsonb, NOW(), NOW()
    )
    ON CONFLICT (phone_hash) DO UPDATE SET
      name           = EXCLUDED.name,
      facility_name  = EXCLUDED.facility_name,
      facility_code  = EXCLUDED.facility_code,
      updated_at     = NOW()
    RETURNING id, phone, name`,
    [
      encryptedName,
      encryptedPhone,
      hashForSearch(normalizedPhone),
      hashForSearch(merged.name.toLowerCase()),
      hashForSearch(merged.id_number),
      merged.county,
      merged.sub_county,
      merged.village,
      encryptedIdNumber,
      encryptedPartnerName,
      encryptedPartnerPhone,
      JSON.stringify(nurseEntered),
      JSON.stringify(motherEntered),
      JSON.stringify(conflicts),
      finalFacilityName,
      finalFacilityCode,
      age ? parseInt(age) : null,
      computedWeeks,
      registration_date || new Date().toISOString(),
      edd || null,
      lmp_date,
      gravida,
      para,
      blood_group || null,
      merged.village,
      conditionsJson,
    ],
  );

  const motherId = result.rows[0].id;

  // 👇 6. Generate Code and SAVE THE NURSE ID
  const regCode = generateRegistrationCode();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  if (!registration_code) {
    await pool.query(
      `INSERT INTO registration_codes 
       (code, mother_phone, mother_name, weeks_pregnant, nurse_id, facility_name, facility_code, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)`,
      [
        regCode,
        normalizedPhone,
        merged.name,
        computedWeeks,
        finalNurseId,
        finalFacilityName,
        finalFacilityCode,
        expiresAt,
      ],
    );
  } else {
    await pool.query(
      "UPDATE registration_codes SET used = TRUE WHERE code = $1",
      [registration_code.trim().toUpperCase()],
    );
  }

  res
    .status(201)
    .json({
      success: true,
      data: {
        mother: {
          id: motherId,
          name: merged.name,
          phone: normalizedPhone,
          registrationCode: regCode,
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
    "sub_county",
    "village",
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

// ── Resolve Field Conflict ────────────────────────────────────────────────
const resolveConflict = asyncHandler(async (req, res) => {
  const { phone, field } = req.params;
  const { choose, value } = req.body;
  const allowed = [
    "county",
    "sub_county",
    "village",
    "partner_name",
    "partner_phone",
  ];

  if (!allowed.includes(field)) throw new ApiError(400, "Field not resolvable");

  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);

  const { rows } = await pool.query(
    "SELECT field_conflicts FROM mothers WHERE phone_hash = $1",
    [phoneHash],
  );
  const c = rows[0]?.field_conflicts?.[field];
  if (!c) throw new ApiError(404, "No conflict on this field");

  const final =
    choose === "nurse" ? c.nurse : choose === "mother" ? c.mother : value;

  let finalValue = final;
  if (["partner_name", "partner_phone"].includes(field))
    finalValue = encrypt(final);

  await pool.query(
    `UPDATE mothers SET "${field}" = $1, field_conflicts = field_conflicts - $2 WHERE phone_hash = $3`,
    [finalValue, field, phoneHash],
  );
  res.json({ success: true });
});

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

  const motherFacility = (rows[0].facility_code || "").trim().toUpperCase();
  const nurseFacility = (req.facilityFilter || "").trim().toUpperCase();

  if (req.facilityFilter && motherFacility !== nurseFacility) {
    throw new ApiError(
      403,
      "Unauthorized to view this patient",
      errorCodes.FORBIDDEN,
    );
  }

  const data = await buildMotherResponse(rows[0]);
  res.status(200).json({ success: true, data });
});

// ── Get All Mothers ───────────────────────────────────────────────────────
const getAllMothers = asyncHandler(async (req, res) => {
  let query = "SELECT * FROM mothers WHERE 1=1";
  const params = [];

  if (req.facilityFilter) {
    query += " AND UPPER(TRIM(facility_code)) = UPPER(TRIM($1))";
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

// ── Search Mothers ─────────────────────────────────────────────────────────
const searchMothers = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  let query = "SELECT * FROM mothers WHERE 1=1";
  const params = [];
  const conditions = [];

  if (req.facilityFilter) {
    conditions.push(
      `UPPER(TRIM(facility_code)) = UPPER(TRIM($${params.length + 1}))`,
    );
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
  resolveConflict,
};
