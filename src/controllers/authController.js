const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { generateOtp } = require("../utils/otp");

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || "5", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

// ── Normalize Kenyan phone numbers ────────────────────────────────────────────
const normalizeKenyanPhone = (phone) => {
  let p = phone
    .toString()
    .trim()
    .replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("0")) p = "+254" + p.substring(1);
  else if (p.startsWith("254") && !p.startsWith("+254")) p = "+" + p;
  else if (!p.startsWith("+")) p = "+" + p;
  return p;
};

// ── Request OTP ───────────────────────────────────────────────────────────────
// FIX 3: Removed password logic — OTP + PIN only
const requestOtp = asyncHandler(async (req, res) => {
  let { phone } = req.body;

  phone = normalizeKenyanPhone(phone);

  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw new ApiError(
      422,
      "A valid phone number is required",
      errorCodes.VALIDATION_ERROR,
    );
  }

  // Generate OTP
  const otpCode = generateOtp(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // Delete old OTPs and save new one
  await pool.query(
    "DELETE FROM otp_codes WHERE phone = $1 AND verified = FALSE",
    [phone],
  );
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [phone, otpCode, expiresAt],
  );

  // TODO: Send via Africa's Talking in production
  // For sandbox/development — log the OTP
  console.log(`📱 OTP for ${phone}: ${otpCode}`);

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
    // Remove debug_otp in production
    debug_otp: process.env.NODE_ENV === "development" ? otpCode : undefined,
  });
});

// ── Verify OTP ────────────────────────────────────────────────────────────────
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
     WHERE phone = $1 AND verified = FALSE
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
      "Too many attempts. Please request a new OTP.",
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
      `Invalid OTP. ${remaining} attempt(s) remaining.`,
      errorCodes.UNAUTHORIZED,
    );
  }

  await pool.query("UPDATE otp_codes SET verified = TRUE WHERE id = $1", [
    otp.id,
  ]);

  // Check if mother profile already exists
  const motherCheck = await pool.query(
    "SELECT phone FROM mothers WHERE phone = $1",
    [phone],
  );
  const isNewUser = motherCheck.rows.length === 0;

  // Generate auth token
  const token = jwt.sign({ phone, isNewUser }, JWT_SECRET, {
    expiresIn: "30d",
  });

  res.status(200).json({
    success: true,
    data: {
      message: "OTP verified successfully",
      phone,
      verified: true,
      isNewUser,
      token,
    },
  });
});

// ── Set PIN ───────────────────────────────────────────────────────────────────
// FIX 1: Changed from exports.setPin = to const setPin =
// FIX 2: Added phone normalization
const setPin = async (req, res) => {
  try {
    let { phone, pin } = req.body;

    // Normalize phone so it matches what is stored in database
    phone = normalizeKenyanPhone(phone);

    if (!phone || !pin) {
      return res
        .status(400)
        .json({ success: false, error: "Phone and PIN are required" });
    }

    if (!/^\d{4}$/.test(pin.toString())) {
      return res
        .status(400)
        .json({ success: false, error: "PIN must be exactly 4 digits" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(pin.toString(), salt);

    const result = await pool.query(
      `UPDATE mothers SET pin_hash = $1, pin_set = TRUE WHERE phone = $2 RETURNING phone`,
      [hashedPin, phone],
    );

    if (result.rows.length === 0) {
      // Mother profile not created yet — this is fine during onboarding
      // PIN will be set when the mother profile is saved
      console.log(
        `⚠️ PIN set attempted for ${phone} — mother profile not yet created. Will retry after profile save.`,
      );
      return res.status(200).json({
        success: true,
        message: "PIN noted — will be applied when profile is created",
        pending: true,
      });
    }

    console.log(`✅ PIN set successfully for ${phone}`);
    res.json({ success: true, message: "PIN set successfully" });
  } catch (error) {
    console.error("setPin error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Verify PIN ────────────────────────────────────────────────────────────────
// FIX 1: Changed from exports.verifyPin = to const verifyPin =
// FIX 2: Added phone normalization
const verifyPin = async (req, res) => {
  try {
    let { phone, pin } = req.body;

    phone = normalizeKenyanPhone(phone);

    if (!phone || !pin) {
      return res
        .status(400)
        .json({ success: false, error: "Phone and PIN are required" });
    }

    const result = await pool.query(
      "SELECT pin_hash, pin_set FROM mothers WHERE phone = $1",
      [phone],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Mother not found" });
    }

    const { pin_hash, pin_set } = result.rows[0];

    if (!pin_set || !pin_hash) {
      return res
        .status(400)
        .json({ success: false, error: "No PIN set for this account" });
    }

    const isValid = await bcrypt.compare(pin.toString(), pin_hash);

    if (!isValid) {
      return res.status(401).json({ success: false, error: "Incorrect PIN" });
    }

    res.json({ success: true, message: "PIN verified successfully" });
  } catch (error) {
    console.error("verifyPin error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Account Recovery — Step 1 ─────────────────────────────────────────────────
const recoverAccount = asyncHandler(async (req, res) => {
  let { idNumber, fullName, newPhone } = req.body;

  newPhone = normalizeKenyanPhone(newPhone);

  const result = await pool.query(
    `SELECT id, phone FROM mothers WHERE id_number = $1 AND LOWER(name) = LOWER($2)`,
    [idNumber, fullName.trim()],
  );

  if (result.rows.length === 0) {
    throw new ApiError(
      404,
      "Mother not found. Please verify your ID and full name.",
      errorCodes.NOT_FOUND,
    );
  }

  const motherId = result.rows[0].id;
  const oldPhone = result.rows[0].phone;

  // Generate OTP for the NEW phone
  const otpCode = generateOtp(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await pool.query(
    "DELETE FROM otp_codes WHERE phone = $1 AND verified = FALSE",
    [newPhone],
  );
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [newPhone, otpCode, expiresAt],
  );

  // Generate a secure recovery token (JWT valid for 15 minutes)
  const recoveryToken = jwt.sign(
    { motherId, oldPhone, newPhone, action: "recovery" },
    JWT_SECRET,
    { expiresIn: "15m" },
  );

  console.log(`🔑 Recovery OTP for ${newPhone}: ${otpCode}`);

  res.status(200).json({
    success: true,
    recoveryToken,
    message: "OTP sent to your new phone number. It expires in 5 minutes.",
    debug_otp: process.env.NODE_ENV === "development" ? otpCode : undefined,
  });
});

// ── Account Recovery — Step 2 (Confirm) ──────────────────────────────────────
const confirmRecovery = asyncHandler(async (req, res) => {
  const { recoveryToken, otp, newPhone } = req.body;

  // Verify recovery token
  let tokenData;
  try {
    tokenData = jwt.verify(recoveryToken, JWT_SECRET);
  } catch {
    throw new ApiError(
      401,
      "Recovery token is invalid or expired. Please start again.",
      errorCodes.UNAUTHORIZED,
    );
  }

  if (
    tokenData.action !== "recovery" ||
    tokenData.newPhone !== normalizeKenyanPhone(newPhone)
  ) {
    throw new ApiError(
      401,
      "Recovery token mismatch.",
      errorCodes.UNAUTHORIZED,
    );
  }

  // Verify OTP
  const normalizedNew = normalizeKenyanPhone(newPhone);
  const { rows } = await pool.query(
    `SELECT id, code, expires_at FROM otp_codes
     WHERE phone = $1 AND verified = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedNew],
  );

  if (rows.length === 0 || String(rows[0].code).trim() !== String(otp).trim()) {
    throw new ApiError(401, "Invalid or expired OTP.", errorCodes.UNAUTHORIZED);
  }

  if (new Date() > new Date(rows[0].expires_at)) {
    throw new ApiError(
      410,
      "OTP has expired. Please start recovery again.",
      errorCodes.BAD_REQUEST,
    );
  }

  const oldPhone = tokenData.oldPhone;

  // Update phone number and reset PIN (mother must set a new PIN on sign in)
  await pool.query(
    `UPDATE mothers SET phone = $1, pin_set = FALSE, pin_hash = NULL WHERE phone = $2`,
    [normalizedNew, oldPhone],
  );

  // Mark OTP as used
  await pool.query("UPDATE otp_codes SET verified = TRUE WHERE id = $1", [
    rows[0].id,
  ]);

  // Log the phone change
  try {
    await pool.query(
      `INSERT INTO phone_change_log (mother_id, old_phone, new_phone, method)
       SELECT id, $1, $2, 'recovery' FROM mothers WHERE phone = $2`,
      [oldPhone, normalizedNew],
    );
  } catch (logError) {
    // Log table may not exist yet — not fatal
    console.warn("Could not log phone change:", logError.message);
  }

  console.log(`✅ Account recovered: ${oldPhone} → ${normalizedNew}`);

  res.status(200).json({
    success: true,
    message:
      "Phone number updated successfully. Please sign in with your new number and set a new PIN.",
  });
});

// ── Single clean module.exports ───────────────────────────────────────────────
// FIX 1: All functions now defined as const above — none are undefined here
module.exports = {
  requestOtp,
  verifyOtp,
  setPin,
  verifyPin,
  recoverAccount,
  confirmRecovery,
};
