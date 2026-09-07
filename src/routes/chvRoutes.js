const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

// GET /api/chv/stats
router.get("/stats", async (req, res) => {
  try {
    const [mothers, alerts, anc] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM mothers"),
      pool.query("SELECT COUNT(*) FROM alerts WHERE status = 'open'"),
      pool.query(
        "SELECT COUNT(*) FROM anc_visits WHERE visit_date >= date_trunc('month', now())",
      ),
    ]);

    res.json({
      success: true,
      data: {
        mothersRegistered: parseInt(mothers.rows[0].count),
        openAlerts: parseInt(alerts.rows[0].count),
        ancVisitsThisMonth: parseInt(anc.rows[0].count),
        appointmentsToday: 0, // optional – you can compute if you have nextAppointment
        highRiskMothers: 0, // optional – compute from risk_level
        vaccinationsThisMonth: 0, // optional – compute from vaccinations
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/chv/login
router.post("/login", async (req, res) => {
  const { phone, pin } = req.body;

  // Basic validation
  if (!phone || !pin) {
    return res
      .status(400)
      .json({ success: false, error: "Phone and PIN required" });
  }

  // Look up the nurse in your nurses table
  const result = await pool.query("SELECT * FROM nurses WHERE phone = $1", [
    phone,
  ]);
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: "Nurse not found" });
  }

  const nurse = result.rows[0];

  // For now, accept any 4-digit PIN (later, verify against a hash)
  // If you have a pin_hash column, use bcrypt.compare here.
  // We'll just generate a token.

  const token = jwt.sign(
    {
      id: nurse.id,
      name: nurse.name,
      facility: nurse.facility_name,
      role: "nurse",
    },
    process.env.JWT_SECRET || "mama_na_mtoto_secret_2026",
    { expiresIn: "30d" },
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: nurse.id,
        name: nurse.name,
        phone: nurse.phone,
        facility: nurse.facility_name,
        role: "nurse",
      },
    },
  });
});

module.exports = router;
