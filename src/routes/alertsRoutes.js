const express = require('express');
const { validate } = require("../middleware/validate");
const { createDangerAlert } = require("../controllers/alertsController");

const router = express.Router(); // Only one declaration!

const dangerAlertSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  message: { required: true, type: "string" },
  severity: { type: "string", enum: ["warning", "critical"] },
  alert_type: { type: "string", enum: ["danger_sign", "missed_visit", "abnormal_lab"] },
};

router.post("/danger", validate(dangerAlertSchema), createDangerAlert);

module.exports = router;
 // clean version – forced refresh