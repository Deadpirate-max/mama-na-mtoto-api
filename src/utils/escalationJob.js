const pool = require("../db/pool");

const escalateUnacknowledgedAlerts = async () => {
  try {
    // Find critical alerts older than 30 mins that are still open
    const { rows } = await pool.query(`
      SELECT a.id, a.symptom, m.facility_code 
      FROM alerts a
      JOIN mothers m ON a.mother_id = m.id
      WHERE a.status = 'open' 
      AND a.severity = 'critical' 
      AND a.fired_at < NOW() - INTERVAL '30 minutes'
    `);

    for (const alert of rows) {
      console.log(
        `🚨 ESCALATION: Alert ${alert.id} unacknowledged for 30 mins. Notifying Facility Admin for ${alert.facility_code}`,
      );

      // TODO: Send an SMS to the facility admin here using Africa's Talking.

      // Mark as escalated so we don't spam them every minute
      await pool.query(
        `UPDATE alerts SET outcome = 'escalated_to_admin' WHERE id = $1`,
        [alert.id],
      );
    }
  } catch (err) {
    console.error("Escalation job failed:", err);
  }
};

// Run every 5 minutes
setInterval(escalateUnacknowledgedAlerts, 5 * 60 * 1000);
