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

// ── MOBILE APP ROUTES (Mother Auth) ────────────────────────────────────────
router.post("/", createMother);
router.post("/upload-photo", uploadProfilePhoto);
router.get("/phone/:phone", requireMotherAuth, getMotherByPhone);
router.put("/:phone", requireMotherAuth, updateMother);
router.delete("/:phone/partner", requireMotherAuth, removePartner); // 👈 Fixes the crash

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
router.put("/:phone/photo", requireMotherAuth, updatePhoto);

module.exports = router;
