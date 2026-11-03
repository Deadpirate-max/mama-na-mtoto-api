const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/chvAuth");
const {
  getFacilities,
  createFacility,
} = require("../controllers/facilitiesController");

// Any logged-in admin can view facilities
router.get("/", authenticate, getFacilities);

// Only Super Admin can create a new facility
router.post("/", authenticate, requireRole(["super_admin"]), createFacility);

module.exports = router;
