const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  requestOtp,
  verifyOtp,
  setPin,
  verifyPin,
  recoverAccount,
  confirmRecovery,
} = require("../controllers/authController");

const router = express.Router();

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many OTP requests. Please try again later.",
    },
  },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many verification attempts. Please try again later.",
    },
  },
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  // For now, return a placeholder nurse (since JWT is not fully wired yet)
  // Later, you can decode the token and fetch the nurse from the DB.
  res.json({
    success: true,
    data: {
      id: "chv_1",
      name: "Grace Muthoni",
      phone: "+254722987654",
      facility: "Kiambu County Referral Hospital",
      role: "nurse",
    },
  });
});
router.post("/otp/request", otpRequestLimiter, requestOtp);
router.post("/otp/verify", otpVerifyLimiter, verifyOtp);
router.post("/set-pin", setPin);
router.post("/verify-pin", verifyPin);
router.post("/recover", recoverAccount);
router.post("/recover/confirm", confirmRecovery);

module.exports = router;
