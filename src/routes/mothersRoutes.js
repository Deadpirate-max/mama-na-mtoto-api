const express = require("express");
const router = express.Router();
const {
  authenticate: chvAuth,
  facilityIsolation,
} = require("../middleware/chvAuth");
const { requireMotherAuth } = require("../middleware/motherAuth"); // Make sure this exists!

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
// Registration is public (or uses a mother token)
router.post("/", createMother);
router.post("/upload-photo", uploadProfilePhoto);

// These routes use the Mother's token (phone-based)
router.get("/phone/:phone", requireMotherAuth, getMotherByPhone);
router.put("/:phone", requireMotherAuth, updateMother);

// ── DASHBOARD ROUTES (CHV/Nurse Auth) ──────────────────────────────────────
// These routes use the Nurse's token (nurseId-based)
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
router.delete("/:phone/partner", requireMotherAuth, removePartner);

module.exports = router;
