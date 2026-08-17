const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { validate } = require('../middleware/validate');
const { generateCode } = require('../utils/codeGenerator'); 

router.post('/:nurseId/generate-code', async (req, res) => {
  const { nurseId } = req.params;
  const { motherPhone, motherName, weeksPregnant } = req.body;

  const nurseResult = await pool.query('SELECT name, facility_name, facility_code FROM nurses WHERE id = $1', [nurseId]);
  if (nurseResult.rows.length === 0) return res.status(404).json({ error: 'Nurse not found' });

  const nurse = nurseResult.rows[0];
  const code = generateCode(); // e.g., 8-character alphanumeric
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO registration_codes (code, mother_phone, mother_name, weeks_pregnant, nurse_id, facility_name, facility_code, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [code, motherPhone, motherName, weeksPregnant, nurseId, nurse.facility_name, nurse.facility_code, expiresAt]
  );

  res.json({ success: true, code, expiresAt });
});

module.exports = router;