const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM mothers) as total_mothers,
        (SELECT COUNT(*) FROM mothers WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week,
        (SELECT COUNT(*) FROM alerts WHERE created_at > NOW() - INTERVAL '7 days') as alerts_this_week,
        (SELECT COUNT(*) FROM anc_visits) as visits_recorded,
        (SELECT COUNT(*) FROM lab_results WHERE status = 'complete') as labs_complete
    `);

    res.json({
      success: true,
      pilot_stats: stats.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;