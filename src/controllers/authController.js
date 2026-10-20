const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { generateOtp } = require("../utils/otp");
const { hashForSearch } = require("../utils/encryption"); // 👈 IMPORT HASH

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || "5", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

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

  const otpCode = generateOtp(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await pool.query(
    "DELETE FROM otp_codes WHERE phone = $1 AND verified = FALSE",
    [phone],
  );
  await pool.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
    [phone, otpCode, expiresAt],
  );

  console.log(`📱 OTP for ${phone}: ${otpCode}`);

  res.status(200).json({
    success: true,
    message: "OTP sent successfully",
    debug_otp: process.env.NODE_ENV === "development" ? otpCode : undefined,
  });
});

// ── Verify OTP ────────────────────────────────────────────────────────────────
const verifyOtp = asyncHandler(async (req, res) => {
  let { phone, code } = req.body;
  phone = normalizeKenyanPhone(phone);

  const { rows } = await pool.query(
    `SELECT id, code, expires_at, verified, attempts
     FROM otp_codes WHERE phone = $1 AND verified = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );

  if (rows.length === 0)
    throw new ApiError(404, "No active OTP found.", errorCodes.NOT_FOUND);
  const otp = rows[0];

  if (new Date() > new Date(otp.expires_at))
    throw new ApiError(410, "OTP expired.", errorCodes.BAD_REQUEST);
  if (otp.attempts >= OTP_MAX_ATTEMPTS)
    throw new ApiError(429, "Too many attempts.", errorCodes.TOO_MANY_REQUESTS);

  if (String(otp.code).trim() !== String(code).trim()) {
    await pool.query(
      "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1",
      [otp.id],
    );
    throw new ApiError(401, "Invalid OTP", errorCodes.UNAUTHORIZED);
  }

  await pool.query("UPDATE otp_codes SET verified = TRUE WHERE id = $1", [
    otp.id,
  ]);

  // 👇 CHECK IF MOTHER EXISTS USING PHONE HASH
  const phoneHash = hashForSearch(phone);
  const motherCheck = await pool.query(
    "SELECT id FROM mothers WHERE phone_hash = $1",
    [phoneHash],
  );
  const isNewUser = motherCheck.rows.length === 0;

  const token = jwt.sign({ phone, isNewUser }, JWT_SECRET, {
    expiresIn: "30d",
  });

  res.status(200).json({
    success: true,
    data: { message: "OTP verified", phone, verified: true, isNewUser, token },
  });
});

// ── Set PIN ───────────────────────────────────────────────────────────────────
const setPin = async (req, res) => {
  try {
    let { phone, pin } = req.body;
    phone = normalizeKenyanPhone(phone);

    if (!/^\d{4}$/.test(pin.toString()))
      return res
        .status(400)
        .json({ success: false, error: "PIN must be 4 digits" });

    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(pin.toString(), salt);
    const phoneHash = hashForSearch(phone);

    // 👇 UPDATE USING PHONE HASH
    const result = await pool.query(
      `UPDATE mothers SET pin_hash = $1, pin_set = TRUE WHERE phone_hash = $2 RETURNING phone`,
      [hashedPin, phoneHash],
    );

    if (result.rows.length === 0) {
      return res
        .status(200)
        .json({
          success: true,
          message: "PIN noted — will be applied when profile is created",
          pending: true,
        });
    }

    res.json({ success: true, message: "PIN set successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Verify PIN ────────────────────────────────────────────────────────────────
const verifyPin = async (req, res) => {
  try {
    let { phone, pin } = req.body;
    phone = normalizeKenyanPhone(phone);
    const phoneHash = hashForSearch(phone);

    // 👇 SELECT USING PHONE HASH
    const result = await pool.query(
      "SELECT pin_hash, pin_set FROM mothers WHERE phone_hash = $1",
      [phoneHash],
    );

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "Mother not found" });
    const { pin_hash, pin_set } = result.rows[0];

    if (!pin_set || !pin_hash)
      return res.status(400).json({ success: false, error: "No PIN set" });

    const isValid = await bcrypt.compare(pin.toString(), pin_hash);
    if (!isValid)
      return res.status(401).json({ success: false, error: "Incorrect PIN" });

    res.json({ success: true, message: "PIN verified successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Account Recovery Step 1 ───────────────────────────────────────────────────
const recoverAccount = asyncHandler(async (req, res) => {
  let { idNumber, fullName, newPhone } = req.body;
  newPhone = normalizeKenyanPhone(newPhone);

  // 👇 SEARCH USING ID HASH AND NAME HASH
  const idHash = hashForSearch(idNumber);
  const nameHash = hashForSearch(fullName.trim().toLowerCase());

  const result = await pool.query(
    `SELECT id, phone FROM mothers WHERE id_number_hash = $1 AND name_hash = $2`,
    [idHash, nameHash],
  );

  if (result.rows.length === 0)
    throw new ApiError(404, "Mother not found.", errorCodes.NOT_FOUND);

  const motherId = result.rows[0].id;
  const oldPhone = result.rows[0].phone;

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

  const recoveryToken = jwt.sign(
    { motherId, oldPhone, newPhone, action: "recovery" },
    JWT_SECRET,
    { expiresIn: "15m" },
  );

  res
    .status(200)
    .json({ success: true, recoveryToken, message: "OTP sent to new number." });
});

// ── Account Recovery Step 2 ───────────────────────────────────────────────────
const confirmRecovery = asyncHandler(async (req, res) => {
  const { recoveryToken, otp, newPhone, newPin } = req.body;

  let tokenData;
  try {
    tokenData = jwt.verify(recoveryToken, JWT_SECRET);
  } catch {
    throw new ApiError(401, "Recovery token invalid.", errorCodes.UNAUTHORIZED);
  }

  const normalizedNew = normalizeKenyanPhone(newPhone);
  if (tokenData.action !== "recovery" || tokenData.newPhone !== normalizedNew)
    throw new ApiError(401, "Token mismatch.", errorCodes.UNAUTHORIZED);

  const { rows } = await pool.query(
    `SELECT id, code, expires_at FROM otp_codes WHERE phone = $1 AND verified = FALSE ORDER BY created_at DESC LIMIT 1`,
    [normalizedNew],
  );

  if (rows.length === 0 || String(rows[0].code).trim() !== String(otp).trim())
    throw new ApiError(401, "Invalid OTP.", errorCodes.UNAUTHORIZED);
  if (new Date() > new Date(rows[0].expires_at))
    throw new ApiError(410, "OTP expired.", errorCodes.BAD_REQUEST);

  const oldPhone = tokenData.oldPhone;
  let hashedPin = null;
  let pinSet = false;

  if (newPin && /^\d{4}$/.test(String(newPin))) {
    const salt = await bcrypt.genSalt(10);
    hashedPin = await bcrypt.hash(String(newPin), salt);
    pinSet = true;
  }

  const oldPhoneHash = hashForSearch(oldPhone);
  const newPhoneHash = hashForSearch(normalizedNew);

  // 👇 UPDATE PHONE, ENCRYPT NEW PHONE, UPDATE HASH
  const { encrypt } = require("../utils/encryption");
  await pool.query(
    `UPDATE mothers SET phone = $1, phone_hash = $2, pin_hash = $3, pin_set = $4 WHERE phone_hash = $5`,
    [encrypt(normalizedNew), newPhoneHash, hashedPin, pinSet, oldPhoneHash],
  );

  await pool.query("UPDATE otp_codes SET verified = TRUE WHERE id = $1", [
    rows[0].id,
  ]);

  res
    .status(200)
    .json({ success: true, message: "Phone updated. Please sign in." });
});

module.exports = {
  requestOtp,
  verifyOtp,
  setPin,
  verifyPin,
  recoverAccount,
  confirmRecovery,
};
