const express = require("express");
const router = express.Router();

// 1. 👇 UPDATE THE IMPORT to use the new functions
const {
  authenticate,
  facilityIsolation,
  requireRole,
} = require("../middleware/chvAuth");
const {
  createMother,
  updateMother,
  getMotherByPhone,
  getMotherById,
  getAllMothers,
  searchMothers,
  uploadProfilePhoto,
} = require("../controllers/mothersController");

// 2. 👇 UPDATE THE ROUTE DEFINITIONS
// Use 'authenticate' instead of 'requireChvAuth'
// Add 'facilityIsolation' so nurses only see their own facility's mothers

router.get("/", authenticate, facilityIsolation, getAllMothers);

// Line 56 from your error is likely this one:
router.get("/search", authenticate, facilityIsolation, searchMothers);

router.get("/id/:id", authenticate, facilityIsolation, getMotherById);
router.get("/phone/:phone", authenticate, getMotherByPhone);
router.post("/", authenticate, createMother);
router.put("/:phone", authenticate, updateMother);
router.post("/upload-photo", authenticate, uploadProfilePhoto);

module.exports = router;
