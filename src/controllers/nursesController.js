const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { encrypt, decrypt, hashForSearch } = require("../utils/encryption");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError, errorCodes } = require("../utils/ApiError");

// ── 1. Login ────────────────────────────────────────────────────────────────
const nurseLogin = asyncHandler(async (req, res) => {
  const { phone, pin } = req.body;
  const phoneHash = hashForSearch(phone.trim());

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

  // Decrypt PII for the dashboard response
  const safeNurse = {
    id: nurse.id,
    name: decrypt(nurse.name),
    phone: decrypt(nurse.phone),
    facility: nurse.facility_code,
    role: nurse.role,
  };

  const token = jwt.sign(
    { nurseId: nurse.id, role: nurse.role, facility_code: nurse.facility_code },
    process.env.JWT_SECRET,
    { expiresIn: "12h" },
  );

  res.json({ success: true, data: { token, user: safeNurse } });
});

// ── 2. Super Admin Creates Account (Pilot Method) ───────────────────────────
const createNurse = asyncHandler(async (req, res) => {
  const { fullName, phone, email, kncNumber, facilityCode, role } = req.body;

  const phoneHash = hashForSearch(phone.trim());

  // Default PIN is 1234 (they should change this later, or you can randomize it)
  const salt = await bcrypt.genSalt(10);
  const defaultPinHash = await bcrypt.hash("1234", salt);

  await pool.query(
    `INSERT INTO nurses (
      name, phone, phone_hash, email, knc_number, facility_code, role, pin_hash, pin_set, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 'active')`,
    [
      encrypt(fullName),
      encrypt(phone),
      phoneHash,
      email,
      kncNumber,
      facilityCode,
      role || "nurse",
      defaultPinHash,
    ],
  );

  res
    .status(201)
    .json({ success: true, message: "Nurse created. Default PIN is 1234." });
});

// ── 3. Invite Nurse (Scale Method) ──────────────────────────────────────────
const inviteNurse = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const facilityCode = req.nurse.facility_code; // NOIC's facility

  // Generate a secure random token for the invite link
  const inviteToken = require("crypto").randomBytes(32).toString("hex");

  await pool.query(
    `INSERT INTO nurses (
      phone, phone_hash, facility_code, status, invitation_token
    ) VALUES ($1, $2, $3, 'pending', $4)`,
    [encrypt(phone), hashForSearch(phone), facilityCode, inviteToken],
  );

  // TODO: Send SMS to nurse with link: https://dashboard.mamanamtoto.com/register/${inviteToken}
  res.json({ success: true, message: "Invitation sent" });
});

// ── 4. Register from Invitation (Public Route) ──────────────────────────────
const registerFromInvitation = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { fullName, nationalId, kncNumber, email, pin } = req.body;

  const { rows } = await pool.query(
    "SELECT * FROM nurses WHERE invitation_token = $1 AND status = 'pending'",
    [token],
  );

  if (rows.length === 0)
    throw new ApiError(
      400,
      "Invalid or expired invitation",
      errorCodes.BAD_REQUEST,
    );

  const nurse = rows[0];

  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(pin.toString(), salt);

  // Update the pending record with their details
  await pool.query(
    `UPDATE nurses SET 
      full_name = $1, national_id = $2, knc_number = $3, email = $4, 
      pin_hash = $5, pin_set = TRUE, name_hash = $6, id_hash = $7
     WHERE id = $8`,
    [
      encrypt(fullName),
      encrypt(nationalId),
      kncNumber,
      email,
      pinHash,
      hashForSearch(fullName.trim().toLowerCase()),
      hashForSearch(nationalId),
      nurse.id,
    ],
  );

  res.json({
    success: true,
    message: "Registration submitted. Awaiting Facility Admin approval.",
  });
});

// ── 5. Approve Nurse ────────────────────────────────────────────────────────
const approveNurse = asyncHandler(async (req, res) => {
  const { nurseId } = req.params;

  await pool.query(
    "UPDATE nurses SET status = 'active', invitation_token = NULL WHERE id = $1",
    [nurseId],
  );

  // TODO: Send SMS "Your account is now active"
  res.json({ success: true, message: "Nurse activated successfully" });
});

module.exports = {
  nurseLogin,
  createNurse,
  inviteNurse,
  registerFromInvitation,
  approveNurse,
};
