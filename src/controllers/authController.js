const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { generateOtp } = require("../utils/otp");

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || "5", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);

// ── Normalize Kenyan phone numbers ──
const normalizeKenyanPhone = (phone) => {
  let p = phone
    .toString()
    .trim()
    .replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("0")) {
    p = "+254" + p.substring(1);
  } else if (p.startsWith("254") && !p.startsWith("+254")) {
    p = "+" + p;
  } else if (!p.startsWith("+")) {
    p = "+" + p;
  }
  return p;
};

// ── Request OTP ──
const requestOtp = asyncHandler(async (req, res) => {
  let { phone, password } = req.body;
  phone = normalizeKenyanPhone(phone);

  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw new ApiError(
      422,
      "A valid phone number is required",
      errorCodes.VALIDATION_ERROR,
    );
  }

  // 1. Fetch mother by phone
  const result = await pool.query(
    "SELECT id, password_hash FROM mothers WHERE phone = $1",
    [phone],
  );
  const mother = result.rows.length > 0 ? result.rows[0] : null;

  // 2. Verify password ONLY IF the user exists AND has a password_hash set
  if (mother && mother.password_hash) {
    if (!password) {
      throw new ApiError(
        401,
        "Password is required for this account.",
        errorCodes.UNAUTHORIZED,
      );
    }
    const valid = await bcrypt.compare(password, mother.password_hash);
    if (!valid) {
      throw new ApiError(401, "Invalid password", errorCodes.UNAUTHORIZED);
    }
  }

  // 3. Generate OTP
  const otpCode = generateOtp(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // 4. Delete old OTPs and save new one
  await pool.query("DELETE FROM otp_codes WHERE phone = $1 AND used = FALSE", [
    phone,
  ]);
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [phone, otpCode, expiresAt],
  );

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
  });
});

// ── Verify OTP ──
const verifyOtp = asyncHandler(async (req, res) => {
  let { phone, code } = req.body;
  phone = normalizeKenyanPhone(phone);

  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw new ApiError(
      422,
      "A valid phone number is required",
      errorCodes.VALIDATION_ERROR,
    );
  }
  if (!code) {
    throw new ApiError(
      422,
      "OTP code is required",
      errorCodes.VALIDATION_ERROR,
    );
  }

  const { rows } = await pool.query(
    `SELECT id, code, expires_at, verified, attempts
     FROM otp_codes
     WHERE phone = $1 AND verified = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone],
  );

  if (rows.length === 0) {
    throw new ApiError(
      404,
      "No active OTP found. Please request a new one.",
      errorCodes.NOT_FOUND,
    );
  }

  const otp = rows[0];

  if (new Date() > new Date(otp.expires_at)) {
    throw new ApiError(
      410,
      "OTP has expired. Please request a new one.",
      errorCodes.BAD_REQUEST,
    );
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(
      429,
      "Maximum verification attempts exceeded. Please request a new OTP.",
      errorCodes.TOO_MANY_REQUESTS,
    );
  }

  if (String(otp.code).trim() !== String(code).trim()) {
    await pool.query(
      "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1",
      [otp.id],
    );
    const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    throw new ApiError(
      401,
      `Invalid OTP code. ${remaining} attempt(s) remaining.`,
      errorCodes.UNAUTHORIZED,
    );
  }

  await pool.query("UPDATE otp_codes SET verified = true WHERE id = $1", [
    otp.id,
  ]);

  // Check if mother exists
  const motherCheck = await pool.query(
    "SELECT * FROM mothers WHERE phone = $1",
    [phone],
  );
  const isNewUser = motherCheck.rows.length === 0;

  res.status(200).json({
    success: true,
    data: {
      message: "OTP verified successfully",
      phone,
      verified: true,
      isNewUser,
    },
  });
});

// ── Set PIN (Uses normalizeKenyanPhone) ──
const setPin = asyncHandler(async (req, res) => {
  let { phone, pin } = req.body;
  phone = normalizeKenyanPhone(phone);

  if (!phone || !pin || pin.length !== 4) {
    throw new ApiError(
      400,
      "Invalid phone or PIN",
      errorCodes.VALIDATION_ERROR,
    );
  }

  // Hash the PIN securely
  const salt = await bcrypt.genSalt(10);
  const hashedPin = await bcrypt.hash(pin, salt);

  const result = await pool.query(
    `UPDATE mothers SET pin_hash = $1, pin_set = true WHERE phone = $2 RETURNING *`,
    [hashedPin, phone],
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, "Mother not found", errorCodes.NOT_FOUND);
  }

  res.json({ success: true, message: "PIN set successfully" });
});

// ── Verify PIN (Uses normalizeKenyanPhone) ──
const verifyPin = asyncHandler(async (req, res) => {
  let { phone, pin } = req.body;
  phone = normalizeKenyanPhone(phone);

  const result = await pool.query(
    `SELECT pin_hash FROM mothers WHERE phone = $1`,
    [phone],
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, "Mother not found", errorCodes.NOT_FOUND);
  }

  const { pin_hash } = result.rows[0];
  if (!pin_hash) {
    throw new ApiError(
      400,
      "No PIN set for this account",
      errorCodes.BAD_REQUEST,
    );
  }

  const isValid = await bcrypt.compare(pin, pin_hash);
  if (!isValid) {
    throw new ApiError(401, "Invalid PIN", errorCodes.UNAUTHORIZED);
  }

  res.json({ success: true, message: "PIN verified successfully" });
});

// ── Start Account Recovery ──
const recoverAccount = asyncHandler(async (req, res) => {
  const { idNumber, fullName, newPhone } = req.body;
  const normalizedNewPhone = normalizeKenyanPhone(newPhone);

  // 1. Find the mother using ID and Name
  const result = await pool.query(
    `SELECT id, phone FROM mothers WHERE id_number = $1 AND name = $2`,
    [idNumber, fullName],
  );

  if (result.rows.length === 0) {
    throw new ApiError(
      404,
      "Mother not found. Please verify your ID and Name.",
      errorCodes.NOT_FOUND,
    );
  }

  // 2. Generate OTP for the NEW phone number
  const otpCode = generateOtp(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await pool.query("DELETE FROM otp_codes WHERE phone = $1 AND used = FALSE", [
    normalizedNewPhone,
  ]);
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [normalizedNewPhone, otpCode, expiresAt],
  );

  res.status(200).json({
    success: true,
    message: `OTP sent to the new number provided.`,
    // In a production app, you would return a JWT here for frontend state tracking
    recoveryToken: `recovery_${normalizedNewPhone}_${Date.now()}`,
  });
});

// ── Confirm Account Recovery ──
const confirmRecovery = asyncHandler(async (req, res) => {
  const { idNumber, otp, newPhone } = req.body;
  const normalizedNewPhone = normalizeKenyanPhone(newPhone);

  // 1. Verify OTP logic (Same as verifyOtp)
  const { rows } = await pool.query(
    `SELECT id, code, expires_at, verified FROM otp_codes WHERE phone = $1 AND verified = false ORDER BY created_at DESC LIMIT 1`,
    [normalizedNewPhone],
  );

  if (rows.length === 0) {
    throw new ApiError(
      404,
      "No active OTP found. Please request a new one.",
      errorCodes.NOT_FOUND,
    );
  }
  if (new Date() > new Date(rows[0].expires_at)) {
    throw new ApiError(
      410,
      "OTP has expired. Please request a new one.",
      errorCodes.BAD_REQUEST,
    );
  }
  if (String(rows[0].code).trim() !== String(otp).trim()) {
    throw new ApiError(401, "Invalid OTP code", errorCodes.UNAUTHORIZED);
  }

  // Mark OTP as verified in DB
  await pool.query("UPDATE otp_codes SET verified = true WHERE id = $1", [
    rows[0].id,
  ]);

  // 2. Get the old phone using the ID Number
  const motherResult = await pool.query(
    "SELECT id, phone FROM mothers WHERE id_number = $1",
    [idNumber],
  );
  if (motherResult.rows.length === 0) {
    throw new ApiError(404, "Account not found.", errorCodes.NOT_FOUND);
  }

  const oldPhone = motherResult.rows[0].phone;

  // 3. Update the mother's phone in the database
  await pool.query(
    `UPDATE mothers SET phone = $1, pin_set = FALSE WHERE phone = $2`,
    [normalizedNewPhone, oldPhone],
  );

  // 4. Log the change (for audit trail)
  await pool.query(
    `INSERT INTO phone_change_log (mother_id, old_phone, new_phone, method) 
     SELECT id, $1, $2, 'recovery' FROM mothers WHERE phone = $2`,
    [oldPhone, normalizedNewPhone],
  );

  res.status(200).json({
    success: true,
    message:
      "Phone number recovered successfully. Please sign in with your new number.",
  });
});

module.exports = {
  requestOtp,
  verifyOtp,
  setPin,
  verifyPin,
  recoverAccount,
  confirmRecovery,
};
