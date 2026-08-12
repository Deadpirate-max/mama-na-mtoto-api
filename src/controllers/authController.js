const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { generateOtp } = require("../utils/otp");

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || "5", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

// ── Request OTP (with password verification) ──
const requestOtp = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !PHONE_PATTERN.test(phone)) {
    throw new ApiError(422, "A valid phone number is required", errorCodes.VALIDATION_ERROR, [
      { field: "phone", message: "Phone must be in international format" },
    ]);
  }

  // 1. Fetch mother by phone
  const result = await pool.query("SELECT id, password_hash FROM mothers WHERE phone = $1", [phone]);

  if (result.rows.length === 0) {
    throw new ApiError(404, "Mother not found. Please register first.", errorCodes.NOT_FOUND);
  }

  const mother = result.rows[0];

  // 2. Verify password (if a password_hash exists)
  if (mother.password_hash) {
    const valid = await bcrypt.compare(password, mother.password_hash);
    if (!valid) {
      throw new ApiError(401, "Invalid password", errorCodes.UNAUTHORIZED);
    }
  }

  // 3. Generate OTP using your utility
  const otpCode = generateOtp(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // 4. Save OTP to otp_codes table
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [phone, otpCode, expiresAt]
  );

  // 5. (Optional) Send OTP via Africa's Talking SMS here

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
  });
});

// ── Verify OTP (existing logic) ──
const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !PHONE_PATTERN.test(phone)) {
    throw new ApiError(422, "A valid phone number is required", errorCodes.VALIDATION_ERROR, [
      { field: "phone", message: "Phone must be in international format" },
    ]);
  }

  if (!code) {
    throw new ApiError(422, "OTP code is required", errorCodes.VALIDATION_ERROR, [
      { field: "code", message: "Code is required" },
    ]);
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

  if (otp.code !== code) {
    await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [otp.id]);
    const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    throw new ApiError(401, `Invalid OTP code. ${remaining} attempt(s) remaining.`, errorCodes.UNAUTHORIZED);
  }

  await pool.query("UPDATE otp_codes SET verified = true WHERE id = $1", [otp.id]);

  res.status(200).json({
    success: true,
    data: {
      message: "OTP verified successfully",
      phone,
      verified: true,
    },
  });
});

module.exports = { requestOtp, verifyOtp };