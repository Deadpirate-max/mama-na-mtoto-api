const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/chvAuth");
const {
  nurseLogin,
  createNurse,
  inviteNurse,
  registerFromInvitation,
  getNursesByFacility,
} = require("../controllers/nursesController");

// Public
router.post("/login", nurseLogin);
router.post("/register/:token", registerFromInvitation);

// Protected (Super Admin & Facility Admin)
router.post(
  "/create",
  authenticate,
  requireRole(["super_admin", "facility_admin"]),
  createNurse,
);
router.post(
  "/invite",
  authenticate,
  requireRole(["super_admin", "facility_admin"]),
  inviteNurse,
);
router.get(
  "/facility/:facilityCode",
  authenticate,
  requireRole(["super_admin", "facility_admin"]),
  getNursesByFacility,
);
// Protected (Any logged-in nurse/admin)
router.post("/change-pin", authenticate, changePin);

module.exports = router;
