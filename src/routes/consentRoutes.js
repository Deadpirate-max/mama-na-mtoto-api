const express = require("express");
const router = express.Router();
const {
  recordConsent,
  getConsents,
} = require("../controllers/consentController");
const { requireMotherAuth } = require("../middleware/motherAuth");

router.get("/", requireMotherAuth, getConsents);
router.post("/", requireMotherAuth, recordConsent);

module.exports = router;
