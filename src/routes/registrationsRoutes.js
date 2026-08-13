const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Helper: generate 8-character alphanumeric code (e.g., MNM-K7X2)
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET /api/registrations/:code
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  const result = await pool.query(
    `SELECT * FROM registration_codes
     WHERE code = $1 AND used = FALSE AND expires_at > NOW()`,
    [code]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Invalid or expired registration code'
    });
  }
  res.json({ success: true, data: result.rows[0] });
});

// POST /api/registrations/:code/use
router.post('/:code/use', async (req, res) => {
  const { code } = req.params;
  await pool.query(
    `UPDATE registration_codes SET used = TRUE, used_at = NOW() WHERE code = $1`,
    [code]
  );
  res.json({ success: true });
});

// POST /api/registrations (nurse generates a new code)
router.post('/', async (req, res) => {
  try {
    const { motherPhone, motherName, weeksPregnant, chvPhone, facilityName, facilityCode } = req.body;

    // Find the CHV/nurse by phone
    const userResult = await pool.query(
      `SELECT id FROM users WHERE phone = $1 AND role IN ('chv', 'nurse')`,
      [chvPhone]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'CHV/nurse not found'
      });
    }
    const chvId = userResult.rows[0].id;

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO registration_codes
       (code, mother_phone, mother_name, weeks_pregnant, chv_id, facility_name, facility_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [code, motherPhone, motherName, weeksPregnant, chvId, facilityName, facilityCode, expiresAt]
    );

    res.json({
      success: true,
      code,
      expiresAt
    });

  } catch (error) {
    console.error('💥 Registration Route Crash:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
});

module.exports = router;