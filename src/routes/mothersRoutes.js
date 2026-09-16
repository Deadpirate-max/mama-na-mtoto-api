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
const { getVisits, createVisit } = require("../controllers/visitsController");
const { getLabs, createLab } = require("../controllers/labsController");
const {
  getVaccinations,
  createVaccination,
} = require("../controllers/vaccinationsController");
const { requireChvAuth } = require("../middleware/chvAuth");
const { requireMotherAuth } = require("../middleware/motherAuth"); // 👈 NEW

const router = express.Router();

const createMotherSchema = {
  phone: { required: true, type: "string", pattern: /^\+?[1-9]\d{7,14}$/ },
  name: { type: "string" },
  age: { type: "number" },
  id_number: { type: "string" },
  nationalId: { type: "string" },
  county: { type: "string" },
  village: { type: "string" },
  address: { type: "string" },
  weeks_pregnant: { type: "number" },
  weeksPregnantAtRegistration: { type: "number" },
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

// ── CHV Dashboard (UUID-based, CHV auth) ──────────────────────────────────
router.get("/search", requireChvAuth, searchMothers);
router.get("/id/:id", requireChvAuth, getMotherById);
router.get("/", requireChvAuth, getAllMothers);

router.get("/:id/visits", requireChvAuth, getVisits);
router.post("/:id/visits", requireChvAuth, createVisit);

router.get("/:id/labs", requireChvAuth, getLabs);
router.post("/:id/labs", requireChvAuth, createLab);

router.get("/:id/vaccinations", requireChvAuth, getVaccinations);
router.post("/:id/vaccinations", requireChvAuth, createVaccination);

// ── Mobile App (Phone-based, MOTHER auth) ────────────────────────────────
router.post("/", validate(createMotherSchema), createMother);
router.get("/:phone", requireMotherAuth, getMotherByPhone);
router.put("/:phone", requireMotherAuth, updateMother);
router.post("/upload-photo", requireMotherAuth, uploadProfilePhoto);

module.exports = router;
