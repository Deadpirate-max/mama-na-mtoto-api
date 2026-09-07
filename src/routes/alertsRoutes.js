const express = require("express");
const { validate } = require("../middleware/validate");
const {
  createDangerAlert,
  getAllAlerts,
} = require("../controllers/alertsController");

const router = express.Router();

const dangerAlertSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  message: { required: true, type: "string" },
  severity: { type: "string", enum: ["warning", "critical"] },
  alert_type: {
    type: "string",
    enum: ["danger_sign", "missed_visit", "abnormal_lab"],
  },
};

router.get("/", getAllAlerts); // <-- This will now find the function!
router.post("/danger", validate(dangerAlertSchema), createDangerAlert);

module.exports = router;
