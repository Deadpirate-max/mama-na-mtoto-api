const express = require("express");
const router = express.Router();

// Middleware
const {
  authenticate: chvAuth,
  facilityIsolation,
} = require("../middleware/chvAuth");
const { requireMotherAuth } = require("../middleware/motherAuth");

// Controllers
const {
  createMother,
  updateMother,
  getMotherByPhone,
  getMotherById,
  getAllMothers,
  searchMothers,
  uploadProfilePhoto,
  resolveConflict,
  updatePhoto,
  removePartner,
  savePushToken,
} = require("../controllers/mothersController");

const visitsController = require("../controllers/visitsController");
const labsController = require("../controllers/labsController");
const vaccinationsController = require("../controllers/vaccinationsController");

// ── DASHBOARD ROUTES (CHV/Nurse Auth) ──────────────────────────────────────
router.get("/", chvAuth, facilityIsolation, getAllMothers);
router.get("/search", chvAuth, facilityIsolation, searchMothers);
router.get("/id/:id", chvAuth, facilityIsolation, getMotherById);
router.patch(
  "/:phone/conflicts/:field",
  chvAuth,
  facilityIsolation,
  resolveConflict,
);

// ── ANC VISITS ─────────────────────────────────────────────────────────────
router.get(
  "/:id/visits",
  chvAuth,
  facilityIsolation,
  visitsController.getVisits,
);
router.post(
  "/:id/visits",
  chvAuth,
  facilityIsolation,
  visitsController.createVisit,
);

// ── LABS ───────────────────────────────────────────────────────────────────
router.get("/:id/labs", chvAuth, facilityIsolation, labsController.getLabs);
router.post("/:id/labs", chvAuth, facilityIsolation, labsController.createLab);

// ── VACCINATIONS ───────────────────────────────────────────────────────────
router.get(
  "/:id/vaccinations",
  chvAuth,
  facilityIsolation,
  vaccinationsController.getVaccinations,
);
router.post(
  "/:id/vaccinations",
  chvAuth,
  facilityIsolation,
  vaccinationsController.createVaccination,
);

// ── MOBILE APP ROUTES (Mother Auth) ────────────────────────────────────────
router.post("/", createMother);
router.post("/upload-photo", uploadProfilePhoto);
router.get("/phone/:phone", requireMotherAuth, getMotherByPhone);
router.put("/:phone", requireMotherAuth, updateMother);
router.put("/:phone/photo", requireMotherAuth, updatePhoto);
router.delete("/:phone/partner", requireMotherAuth, removePartner);
router.put("/:phone/push-token", requireMotherAuth, savePushToken);
module.exports = router;
