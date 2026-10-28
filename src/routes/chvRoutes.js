const express = require("express");
const router = express.Router();
const { authenticate, facilityIsolation } = require("../middleware/chvAuth");
const { getStats } = require("../controllers/statsController");
const { nurseLogin } = require("../controllers/nursesController");

// ── Login (Public) ─────────────────────────────────────────────────────────
// Uses the AES-256 blind index lookup (phone_hash)
router.post("/login", nurseLogin);

// ── Stats (Protected + Facility Isolated) ──────────────────────────────────
router.get("/stats", authenticate, facilityIsolation, getStats);

module.exports = router;
