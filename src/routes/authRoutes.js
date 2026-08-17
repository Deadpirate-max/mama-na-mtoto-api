const express = require("express");
const rateLimit = require("express-rate-limit");
const { requestOtp, verifyOtp } = require("../controllers/authController");
const {
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

router.post("/otp/request", otpRequestLimiter, requestOtp);
router.post("/otp/verify", otpVerifyLimiter, verifyOtp);
router.post("/set-pin", setPin);
router.post("/verify-pin", verifyPin);
router.post("/recover", recoverAccount);
router.post("/recover/confirm", confirmRecovery);
router.post("/set-pin", authController.setPin); // <-- Add this
router.post("/verify-pin", authController.verifyPin);

module.exports = router;
