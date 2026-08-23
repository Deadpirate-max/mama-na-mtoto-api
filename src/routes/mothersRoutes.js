const express = require("express");
const { validate } = require("../middleware/validate");
const {
  createMother,
  getMotherByPhone,
  updateMother,
  uploadProfilePhoto,
} = require("../controllers/mothersController");
const { updateVisit } = require("../controllers/visitsController");
const { updateLabResult } = require("../controllers/labsController");
const { updateVaccination } = require("../controllers/vaccinationsController");

const router = express.Router();

// ── Validation schema for POST /mothers ───────────────────────────────────────
// FIX 1: Removed password — OTP + PIN only, no passwords
// FIX 2: gravida and para changed from number to string (they hold "G1P0", "P0")
// FIX 3: Added all fields the app sends so validation does not block them
const createMotherSchema = {
  // Required
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  name: { required: true, type: "string" },

  // Personal — all optional
  age: { type: "number", min: 10, max: 60 },
  id_number: { type: "string" },
  county: { type: "string" },

  // Pregnancy — optional
  weeks_pregnant: { type: "number", min: 0, max: 42 },
  weeksPregnantAtRegistration: { type: "number", min: 0, max: 42 },
  registration_date: { type: "string" },
  edd: { type: "string" },
  lmp_date: { type: "string" },

  // FIX 2: These are strings like "G1P0" and "P0" — NOT numbers
  gravida: { type: "string" },
  para: { type: "string" },

  // Care team — optional
  nurse_name: { type: "string" },
  nurse_phone: { type: "string" },
  facility_name: { type: "string" },
  facility_code: { type: "string" },

  // Partner — optional
  partner_name: { type: "string" },
  partner_age: { type: "number" },
  partner_phone: { type: "string" },

  // Other — optional
  conditions: { type: "string" }, // JSON stringified array e.g. '["Diabetes"]'
  profile_photo: { type: "string" },
  blood_group: { type: "string" },
  address: { type: "string" },
  emergency_contact: { type: "string" },
};

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/", validate(createMotherSchema), createMother);
router.get("/:phone", getMotherByPhone);
router.put("/:phone", updateMother);
router.patch("/:phone/visits/:number", updateVisit);
router.patch("/:phone/labs/:id", updateLabResult);
router.patch("/:phone/vaccinations/:id", updateVaccination);
router.post("/upload-photo", uploadProfilePhoto);

// FIX 4: Removed duplicate router.put("/:phone") that was registering updateMother twice

module.exports = router;
