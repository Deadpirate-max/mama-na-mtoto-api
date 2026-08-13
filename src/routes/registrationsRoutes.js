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
    // ✨ THIS WILL FINALLY SHOW THE ERROR ON RAILWAY AND IN YOUR CURL RESPONSE ✨
    console.error('💥 Registration Route Crash:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
});