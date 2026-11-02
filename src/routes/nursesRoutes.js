const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/chvAuth"); // or auth.js
const {
  nurseLogin,
  createNurse,
  inviteNurse,
  registerFromInvitation,
  approveNurse,
  getNursesByFacility, // 👈 Import the correct name
} = require("../controllers/nursesController");

// Public
router.post("/login", nurseLogin);
router.post("/register/:token", registerFromInvitation);

// Super Admin Only
router.post("/create", authenticate, requireRole(["super_admin"]), createNurse);

// Facility Admin & Super Admin
router.post(
  "/invite",
  authenticate,
  requireRole(["super_admin", "facility_admin"]),
  inviteNurse,
);
router.post(
  "/:nurseId/approve",
  authenticate,
  requireRole(["super_admin", "facility_admin"]),
  approveNurse,
);

// 👇 This is the route your React app is calling
router.get(
  "/facility/:facilityCode",
  authenticate,
  requireRole(["super_admin", "facility_admin"]),
  getNursesByFacility,
);

module.exports = router;
