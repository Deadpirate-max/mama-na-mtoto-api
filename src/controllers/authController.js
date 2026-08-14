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
  let p = phone.toString().trim().replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('0')) {
    p = '+254' + p.substring(1);
  } else if (p.startsWith('254') && !p.startsWith('+254')) {
    p = '+' + p;
  } else if (!p.startsWith('+')) {
    p = '+' + p;
  }
  return p;
};

// ── Request OTP ──
const requestOtp = asyncHandler(async (req, res) => {
  let { phone, password } = req.body;

  // ── Normalize phone ──
  phone = normalizeKenyanPhone(phone);

  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw new ApiError(422, "A valid phone number is required", errorCodes.VALIDATION_ERROR);
  }

  // 1. Fetch mother by phone
  const result = await pool.query("SELECT id, password_hash FROM mothers WHERE phone = $1", [phone]);
  const mother = result.rows.length > 0 ? result.rows[0] : null;

  // 2. Verify password ONLY IF the user exists AND has a password_hash set
  if (mother && mother.password_hash) {
    if (!password) {
      throw new ApiError(401, "Password is required for this account.", errorCodes.UNAUTHORIZED);
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
  await pool.query("DELETE FROM otp_codes WHERE phone = $1 AND used = FALSE", [phone]);
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [phone, otpCode, expiresAt]
  );

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
  });
});

// ── Verify OTP ──
const verifyOtp = asyncHandler(async (req, res) => {
  let { phone, code } = req.body;

  // ── Normalize phone ──
  phone = normalizeKenyanPhone(phone);

  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw new ApiError(422, "A valid phone number is required", errorCodes.VALIDATION_ERROR);
  }

  if (!code) {
    throw new ApiError(422, "OTP code is required", errorCodes.VALIDATION_ERROR);
  }

  const { rows } = await pool.query(
    `SELECT id, code, expires_at, verified, attempts
     FROM otp_codes
     WHERE phone = $1 AND verified = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (rows.length === 0) {
    throw new ApiError(404, "No active OTP found. Please request a new one.", errorCodes.NOT_FOUND);
  }

  const otp = rows[0];

  if (new Date() > new Date(otp.expires_at)) {
    throw new ApiError(410, "OTP has expired. Please request a new one.", errorCodes.BAD_REQUEST);
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Maximum verification attempts exceeded. Please request a new OTP.", errorCodes.TOO_MANY_REQUESTS);
  }

  if (otp.code !== code.toString().trim()) {
    await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [otp.id]);
    const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    throw new ApiError(401, `Invalid OTP code. ${remaining} attempt(s) remaining.`, errorCodes.UNAUTHORIZED);
  }

  await pool.query("UPDATE otp_codes SET verified = true WHERE id = $1", [otp.id]);

  // Check if mother exists
  const motherCheck = await pool.query("SELECT * FROM mothers WHERE phone = $1", [phone]);
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

module.exports = { requestOtp, verifyOtp };