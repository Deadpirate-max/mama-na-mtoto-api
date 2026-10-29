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
// GET /api/registrations/:code
router.get("/:code", async (req, res) => {
  try {
    const cleanCode = (req.params.code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    // 1. Find the code
    const codeResult = await pool.query(
      `SELECT * FROM registration_codes 
       WHERE TRIM(UPPER(code)) = $1 
       AND (used = FALSE OR used IS NULL)`,
      [cleanCode],
    );

    if (codeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired registration code",
      });
    }

    const data = codeResult.rows[0];

    // 2. Safely fetch the nurse (casting IDs to text to avoid UUID vs Integer crashes)
    let nurseName = data.nurse_name || null; // Fallback to registration table if exists
    let nursePhone = data.nurse_phone || null;

    if (data.nurse_id) {
      try {
        const nurseResult = await pool.query(
          "SELECT name, phone FROM nurses WHERE id::text = $1::text",
          [String(data.nurse_id)],
        );

        if (nurseResult.rows.length > 0) {
          // Safely decrypt
          try {
            nurseName = nurseResult.rows[0].name
              ? decrypt(nurseResult.rows[0].name)
              : nurseName;
            nursePhone = nurseResult.rows[0].phone
              ? decrypt(nurseResult.rows[0].phone)
              : nursePhone;
          } catch (e) {
            console.warn("⚠️ Decryption failed, using raw nurse data");
            nurseName = nurseResult.rows[0].name;
            nursePhone = nurseResult.rows[0].phone;
          }
        }
      } catch (nurseErr) {
        console.warn(
          "⚠️ Nurse lookup skipped due to type mismatch:",
          nurseErr.message,
        );
      }
    }

    // 3. Send the response to the mobile app
    res.json({
      success: true,
      data: {
        code: data.code,
        mother_name: data.mother_name,
        weeks_pregnant: data.weeks_pregnant,
        facility_name: data.facility_name,
        facility_code: data.facility_code,
        nurse_name: nurseName,
        nurse_phone: nursePhone,
      },
    });
  } catch (error) {
    console.error("💥 Verify code endpoint crashed:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
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
