const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

const createDangerAlert = asyncHandler(async (req, res) => {
  const {
    phone, alert_type, severity, message, symptom, symptom_severity, log_symptom,
  } = req.body;

  const motherResult = await pool.query(`SELECT id FROM mothers WHERE phone = $1`, [phone]);
  if (motherResult.rows.length === 0) {
    throw new ApiError(404, `No mother found with phone ${phone}`, errorCodes.NOT_FOUND);
  }
  const motherId = motherResult.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (log_symptom && symptom) {
      await client.query(
        `INSERT INTO symptom_logs (mother_id, symptom, severity)
         VALUES ($1, $2, $3)`,
        [motherId, symptom, symptom_severity || "severe"],
      );
    }

    const { rows } = await client.query(
      `INSERT INTO alerts (mother_id, alert_type, severity, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [motherId, alert_type || "danger_sign", severity || "critical", message],
    );

    await client.query("COMMIT");
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { createDangerAlert };
