const express = require("express");
const { validate } = require("../middleware/validate");
const {
  createMother,
  getMotherByPhone,
  updateMother,
  uploadProfilePhoto,
  getAllMothers,
} = require("../controllers/mothersController");
const { updateVisit } = require("../controllers/visitsController");
const { updateLabResult } = require("../controllers/labsController");
const { updateVaccination } = require("../controllers/vaccinationsController");

const router = express.Router();

// ── Validation schema for POST /mothers ───────────────────────────────────────
// (Updated: name is now optional, added nationalId, village, parity, lmp mapping)
const createMotherSchema = {
  // Required
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  name: { type: "string" }, // Changed to optional

  // Personal — all optional
  age: { type: "number", min: 10, max: 60 },
  id_number: { type: "string" },
  nationalId: { type: "string" }, // Dashboard sends this
  county: { type: "string" },
  village: { type: "string" }, // Dashboard sends this
  address: { type: "string" },

  // Pregnancy — optional
  weeks_pregnant: { type: "number", min: 0, max: 42 },
  weeksPregnantAtRegistration: { type: "number", min: 0, max: 42 },
  registration_date: { type: "string" },
  edd: { type: "string" },
  lmp_date: { type: "string" },
  lmp: { type: "string" }, // Dashboard sends this

  gravida: { type: "string" },
  para: { type: "string" },
  parity: { type: "string" }, // Dashboard sends this

  nurse_name: { type: "string" },
  nurse_phone: { type: "string" },
  facility_name: { type: "string" },
  facility_code: { type: "string" },

  partner_name: { type: "string" },
  partner_age: { type: "number" },
  partner_phone: { type: "string" },

  conditions: { type: "string" },
  profile_photo: { type: "string" },
  blood_group: { type: "string" },
  emergency_contact: { type: "string" },
};

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/", validate(createMotherSchema), createMother);
router.get("/", getAllMothers); 
router.get("/:phone", getMotherByPhone);
router.put("/:phone", updateMother);
router.patch("/:phone/visits/:number", updateVisit);
router.patch("/:phone/labs/:id", updateLabResult);
router.patch("/:phone/vaccinations/:id", updateVaccination);
router.post("/upload-photo", uploadProfilePhoto);

module.exports = router;
