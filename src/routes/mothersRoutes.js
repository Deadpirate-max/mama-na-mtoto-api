const express = require("express");
const { validate } = require("../middleware/validate");
const {
  createMother,
  getMotherByPhone,
  getMotherById,
  updateMother,
  uploadProfilePhoto,
  getAllMothers,
  searchMothers,
} = require("../controllers/mothersController");
const { requireChvAuth } = require("../middleware/chvAuth");

const router = express.Router();

// ── Validation schema ─────────────────────────────────────────────────────
const createMotherSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  name: { type: "string" },
  age: { type: "number", min: 10, max: 60 },
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
  nextAppointment: {},
};

// ── Routes ────────────────────────────────────────────────────────────────

router.get("/search", requireChvAuth, searchMothers);
router.get("/id/:id", requireChvAuth, getMotherById);
router.get("/", requireChvAuth, getAllMothers);
router.post("/", validate(createMotherSchema), createMother);
router.get("/:phone", getMotherByPhone);
router.put("/:phone", updateMother);
router.post("/upload-photo", uploadProfilePhoto);

module.exports = router;
