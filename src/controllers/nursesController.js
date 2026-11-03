const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError, errorCodes } = require("../utils/ApiError");

const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

// 👇 HELPER: Normalize phone numbers to +254...
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

// ── 1. Login (All Roles) ───────────────────────────────────────────────────
const nurseLogin = asyncHandler(async (req, res) => {
  const { phone, pin } = req.body;

  // 👇 Normalize before hashing
  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);

  const { rows } = await pool.query(
    "SELECT * FROM nurses WHERE phone_hash = $1 LIMIT 1",
    [phoneHash],
  );

  if (rows.length === 0) {
    throw new ApiError(401, "Invalid credentials", errorCodes.UNAUTHORIZED);
  }

  const nurse = rows[0];

  if (nurse.status !== "active") {
    throw new ApiError(
      403,
      "Account is pending approval or suspended",
      errorCodes.FORBIDDEN,
    );
  }

  const isValidPin = await bcrypt.compare(pin.toString(), nurse.pin_hash);
  if (!isValidPin) {
    throw new ApiError(401, "Invalid credentials", errorCodes.UNAUTHORIZED);
  }

  const safeNurse = {
    id: nurse.id,
    name: decrypt(nurse.name),
    phone: decrypt(nurse.phone),
    facility: nurse.facility_code,
    role: nurse.role,
  };

  const token = jwt.sign(
    { nurseId: nurse.id, role: nurse.role, facility_code: nurse.facility_code },
    JWT_SECRET,
    { expiresIn: "12h" },
  );

  res.json({ success: true, data: { token, user: safeNurse } });
});

// ── 2. Create Account (Super Admin or Facility Admin) ─────────────────────
const createNurse = asyncHandler(async (req, res) => {
  const { name, phone, email, facilityCode, role } = req.body;

  const assignedRole = req.nurse.role === "super_admin" ? role : "nurse";
  const assignedFacility =
    req.nurse.role === "super_admin" ? facilityCode : req.nurse.facility;

  if (!assignedFacility) {
    throw new ApiError(
      400,
      "Facility code is required",
      errorCodes.VALIDATION_ERROR,
    );
  }

  // 👇 Normalize before hashing/encrypting
  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);

  const salt = await bcrypt.genSalt(10);
  const defaultPinHash = await bcrypt.hash("1234", salt);

  await pool.query(
    `INSERT INTO nurses (
      name, phone, phone_hash, email, facility_code, role, pin_hash, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [
      encrypt(name),
      encrypt(normalizedPhone), // 👈 Save normalized
      phoneHash,
      email || null,
      assignedFacility,
      assignedRole,
      defaultPinHash,
    ],
  );

  res
    .status(201)
    .json({ success: true, message: "Account created. Default PIN is 1234." });
});

// ── 3. Invite Nurse (Facility Admin Method) ───────────────────────────────
const inviteNurse = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const facilityCode = req.nurse.facility;

  // 👇 Normalize before hashing
  const normalizedPhone = normalizePhone(phone);
  const inviteToken = require("crypto").randomBytes(32).toString("hex");

  await pool.query(
    `INSERT INTO nurses (
      phone, phone_hash, facility_code, status, invitation_token, role
    ) VALUES ($1, $2, $3, 'pending', $4, 'nurse')`,
    [
      encrypt(normalizedPhone),
      hashForSearch(normalizedPhone),
      facilityCode,
      inviteToken,
    ],
  );

  res.json({ success: true, message: "Invitation sent" });
});

// ── 4. Register from Invitation (Public Route) ────────────────────────────
const registerFromInvitation = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { name, nationalId, kncNumber, email, pin } = req.body;

  const { rows } = await pool.query(
    "SELECT * FROM nurses WHERE invitation_token = $1 AND status = 'pending'",
    [token],
  );

  if (rows.length === 0) {
    throw new ApiError(
      400,
      "Invalid or expired invitation",
      errorCodes.BAD_REQUEST,
    );
  }

  const nurse = rows[0];
  const pinHash = await bcrypt.hash(pin.toString(), 10);

  await pool.query(
    `UPDATE nurses SET 
      name = $1, knc_number = $2, email = $3, 
      pin_hash = $4, status = 'active', invitation_token = NULL
     WHERE id = $5`,
    [encrypt(name), kncNumber, email, pinHash, nurse.id],
  );

  res.json({
    success: true,
    message: "Registration complete. You can now log in.",
  });
});

// ── 5. Get Nurses by Facility (Admin View) ────────────────────────────────
const getNursesByFacility = asyncHandler(async (req, res) => {
  let facilityCode = req.nurse.facility;

  if (req.nurse.role === "super_admin" && req.params.facilityCode === "all") {
    facilityCode = null;
  } else if (req.nurse.role === "super_admin" && req.params.facilityCode) {
    facilityCode = req.params.facilityCode;
  }

  let query =
    "SELECT id, name, phone, role, status, facility_code FROM nurses WHERE 1=1";
  const params = [];

  if (facilityCode) {
    query += " AND facility_code = $1";
    params.push(facilityCode);
  }

  query += " ORDER BY created_at DESC";
  const result = await pool.query(query, params);

  const safeNurses = result.rows.map((n) => ({
    id: n.id,
    name: n.name ? decrypt(n.name) : "Pending Registration",
    phone: n.phone ? decrypt(n.phone) : "Unknown",
    role: n.role,
    status: n.status,
    facility_code: n.facility_code,
  }));

  res.json({ success: true, data: safeNurses });
});
// ── 6. Change PIN ─────────────────────────────────────────────────────────
const changePin = asyncHandler(async (req, res) => {
  const { currentPin, newPin } = req.body;
  const nurseId = req.nurse.id; // 👈 Securely grabbed from the JWT token

  if (!/^\d{4}$/.test(newPin)) {
    throw new ApiError(
      400,
      "New PIN must be exactly 4 digits",
      errorCodes.VALIDATION_ERROR,
    );
  }

  // 1. Get current PIN hash
  const { rows } = await pool.query(
    "SELECT pin_hash FROM nurses WHERE id = $1",
    [nurseId],
  );
  if (rows.length === 0) {
    throw new ApiError(404, "User not found", errorCodes.NOT_FOUND);
  }

  // 2. Verify the current PIN
  const isValid = await bcrypt.compare(currentPin.toString(), rows[0].pin_hash);
  if (!isValid) {
    throw new ApiError(401, "Incorrect current PIN", errorCodes.UNAUTHORIZED);
  }

  // 3. Hash and save the new PIN
  const salt = await bcrypt.genSalt(10);
  const newPinHash = await bcrypt.hash(newPin.toString(), salt);

  await pool.query("UPDATE nurses SET pin_hash = $1 WHERE id = $2", [
    newPinHash,
    nurseId,
  ]);

  res.json({ success: true, message: "PIN updated successfully" });
});

// ── EXPORTS (Must match imports in routes) ────────────────────────────────
module.exports = {
  nurseLogin,
  createNurse,
  changePin,
  inviteNurse,
  registerFromInvitation,
  getNursesByFacility,
};
