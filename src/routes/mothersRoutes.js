const express = require("express");
const { validate } = require("../middleware/validate");
const {
  createMother,
  getMotherByPhone,
  updateMother,
  uploadProfilePhoto,
  getAllMothers,
  searchMothers,
} = require("../controllers/mothersController");
const { updateVisit } = require("../controllers/visitsController");
const { updateLabResult } = require("../controllers/labsController");
const { updateVaccination } = require("../controllers/vaccinationsController");

const router = express.Router();

// ── Validation schema for POST /mothers ───────────────────────────────────────
const createMotherSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  name: { type: "string" },
  age: { type: "number", min: 10, max: 60 },

  // Accept both snake_case and camelCase
  id_number: { type: "string" },
  nationalId: { type: "string" },
  county: { type: "string" },
  village: { type: "string" },
  address: { type: "string" },

  weeks_pregnant: { type: "number", min: 0, max: 42 },
  weeksPregnantAtRegistration: { type: "number", min: 0, max: 42 },
  registration_date: { type: "string" },
  edd: { type: "string" },
  lmp_date: { type: "string" },
  lmp: { type: "string" },

  // Accept any type — coerce in controller
  gravida: {},
  para: {},
  parity: {},

  nurse_name: { type: "string" },
  nurse_phone: { type: "string" },
  facility_name: { type: "string" },
  facility_code: { type: "string" },

  partner_name: { type: "string" },
  partner_age: { type: "number" },
  partner_phone: { type: "string" },

  conditions: {},
  profile_photo: { type: "string" },
  blood_group: { type: "string" },
  emergency_contact: { type: "string" },

  // Dashboard extras
  nextAppointment: {},
};

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/", validate(createMotherSchema), createMother);
router.get("/", getAllMothers);
router.get("/search", searchMothers);
router.get("/:phone", getMotherByPhone);
router.put("/:phone", updateMother);
router.patch("/:phone/visits/:number", updateVisit);
router.patch("/:phone/labs/:id", updateLabResult);
router.patch("/:phone/vaccinations/:id", updateVaccination);
router.post("/upload-photo", uploadProfilePhoto);

module.exports = router;
