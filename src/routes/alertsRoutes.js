const express = require("express");
const router = express.Router();
const { validate } = require("../middleware/validate");
const { authenticate, facilityIsolation } = require("../middleware/chvAuth");
const {
  createDangerAlert,
  getAllAlerts,
  updateAlert,
  testSendSms,
} = require("../controllers/alertsController");

const dangerAlertSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  message: { required: true, type: "string" },
  severity: { type: "string", enum: ["warning", "critical"] },
  alert_type: {
    type: "string",
    enum: ["danger_sign", "missed_visit", "abnormal_lab"],
  },
};

// ── Public Routes (Mobile App / System triggers) ───────────────────────────
router.post("/danger", validate(dangerAlertSchema), createDangerAlert);
router.post("/test-sms", testSendSms);

// ── Protected Dashboard Routes (Requires Login + Facility Isolation) ───────
router.get("/", authenticate, facilityIsolation, getAllAlerts);
router.patch("/:id", authenticate, facilityIsolation, updateAlert);

module.exports = router;
