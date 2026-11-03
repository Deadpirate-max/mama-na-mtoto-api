const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

// Helper: generate 8-character alphanumeric code (e.g., 5UDNX92P)
function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET /api/registrations/:code
router.post("/", async (req, res) => {
  try {
    const {
      motherPhone,
      motherName,
      idNumber,
      weeksPregnant,
      county,
      subCounty,
      village,
      partnerName,
      partnerPhone,
      nursePhone,
      facilityName,
      facilityCode,
    } = req.body;

    const userResult = await pool.query(
      `SELECT id FROM nurses WHERE phone = $1 OR phone_hash = $2`,
      [nursePhone, require("../utils/encryption").hashForSearch(nursePhone)],
    );

    if (userResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "Nurse/CHV not found" });
    const nurseId = userResult.rows[0].id;

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 👇 Encrypt PII for the registration code
    const { encrypt } = require("../utils/encryption");

    await pool.query(
      `INSERT INTO registration_codes
       (code, mother_phone, mother_name, id_number, weeks_pregnant,
        county, sub_county, village, partner_name, partner_phone,
        nurse_id, facility_name, facility_code, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        code,
        encrypt(motherPhone),
        encrypt(motherName),
        idNumber ? encrypt(idNumber) : null,
        weeksPregnant,
        county || null,
        subCounty || null,
        village || null,
        partnerName ? encrypt(partnerName) : null,
        partnerPhone ? encrypt(partnerPhone) : null,
        nurseId,
        facilityName,
        facilityCode,
        expiresAt,
      ],
    );

    res.json({ success: true, code, expiresAt });
  } catch (error) {
    console.error("💥 Registration Route Crash:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/registrations/:code/use
router.post("/:code/use", async (req, res) => {
  const { code } = req.params;
  await pool.query(
    `UPDATE registration_codes SET used = TRUE, used_at = NOW() WHERE code = $1`,
    [code],
  );
  res.json({ success: true });
});

// POST /api/registrations (nurse generates a new code)
router.post("/", async (req, res) => {
  try {
    const {
      motherPhone,
      motherName,
      weeksPregnant,
      chvPhone,
      facilityName,
      facilityCode,
    } = req.body;

    // 👇 FIX: Query the 'nurses' table instead of 'users'
    const userResult = await pool.query(
      `SELECT id FROM nurses WHERE phone = $1 AND role IN ('chv', 'nurse')`,
      [chvPhone],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Nurse/CHV not found",
      });
    }
    const nurseId = userResult.rows[0].id;

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 👇 FIX: Use 'nurse_id' instead of 'chv_id' in the INSERT
    await pool.query(
      `INSERT INTO registration_codes
       (code, mother_phone, mother_name, weeks_pregnant, nurse_id, facility_name, facility_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        code,
        motherPhone,
        motherName,
        weeksPregnant,
        nurseId,
        facilityName,
        facilityCode,
        expiresAt,
      ],
    );

    res.json({
      success: true,
      code,
      expiresAt,
    });
  } catch (error) {
    console.error("💥 Registration Route Crash:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
});

module.exports = router;
