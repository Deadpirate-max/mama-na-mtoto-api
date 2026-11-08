const pool = require("../db/pool");
const bcrypt = require("bcryptjs");
const { hashForSearch } = require("../utils/encryption");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");

// Helper to ensure phone matches the database format
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

// ── SET PIN (Called during Onboarding) ──
const setPin = asyncHandler(async (req, res) => {
  const { phone, pin } = req.body;

  if (!pin || pin.toString().length !== 4) {
    throw new ApiError(400, "PIN must be exactly 4 digits");
  }

  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);

  // Hash the 4-digit PIN
  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(pin.toString(), salt);

  // Update the mother record
  const result = await pool.query(
    "UPDATE mothers SET pin_hash = $1, pin_set = true, updated_at = NOW() WHERE phone_hash = $2 RETURNING id",
    [pinHash, phoneHash],
  );

  if (result.rows.length === 0) {
    throw new ApiError(
      404,
      "Mother not found with this phone number. Please register first.",
    );
  }

  res.json({ success: true, message: "PIN set successfully" });
});

// ── VERIFY PIN (Called during Sign In) ──
const verifyPin = asyncHandler(async (req, res) => {
  const { phone, pin } = req.body;

  const normalizedPhone = normalizePhone(phone);
  const phoneHash = hashForSearch(normalizedPhone);

  const { rows } = await pool.query(
    "SELECT pin_hash, pin_set FROM mothers WHERE phone_hash = $1",
    [phoneHash],
  );

  if (rows.length === 0) {
    throw new ApiError(404, "Mother not found");
  }

  const mother = rows[0];

  if (!mother.pin_set || !mother.pin_hash) {
    throw new ApiError(
      400,
      "No PIN set for this account. Please complete onboarding.",
    );
  }

  const isValid = await bcrypt.compare(pin.toString(), mother.pin_hash);
  if (!isValid) {
    throw new ApiError(401, "Invalid PIN. Please try again.");
  }

  // TODO: Generate a JWT here if you want the mother to stay logged in
  res.json({ success: true, message: "PIN verified" });
});

// ── DON'T FORGET TO EXPORT THEM ──
module.exports = {
  // ... your existing exports like requestOtp, verifyOtp, etc.
  setPin,
  verifyPin,
};
