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
} = require("../controllers/mothersController");

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

// ── MOBILE APP ROUTES (Mother Auth) ────────────────────────────────────────
router.post("/", createMother);
router.post("/upload-photo", uploadProfilePhoto);
router.get("/phone/:phone", requireMotherAuth, getMotherByPhone);
router.put("/:phone", requireMotherAuth, updateMother);
router.put("/:phone/photo", requireMotherAuth, updatePhoto);
router.delete("/:phone/partner", requireMotherAuth, removePartner);
router.put("/:phone/push-token", requireMotherAuth, savePushToken);

module.exports = router;
