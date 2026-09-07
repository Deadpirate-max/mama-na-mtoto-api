const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

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

module.exports = router;
