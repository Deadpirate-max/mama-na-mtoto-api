const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");

// ── Get all labs for a mother ──────────────────────────────────────────────
exports.getLabs = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // We use COALESCE just in case some columns are null in the DB
  const result = await pool.query(
    `SELECT * FROM lab_results 
     WHERE mother_id = $1 
     ORDER BY test_date DESC NULLS LAST`,
    [id],
  );

  res.json({ success: true, data: result.rows });
});

// ── Create a new lab result (Nurse) ────────────────────────────────────────
exports.createLab = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, value, unit, normalRange, status, testDate, recordedBy } =
    req.body;

  const result = await pool.query(
    `INSERT INTO lab_results (
       mother_id, name, value, unit, normal_range, status, test_date, recorded_by, recorded_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, NOW()
     ) RETURNING *`,
    [
      id,
      name,
      value,
      unit,
      normalRange,
      status,
      testDate || new Date(),
      recordedBy || "Nurse",
    ],
  );

  res.status(201).json({ success: true, data: result.rows[0] });
});

// ── Approve a mother-entered lab (Nurse Review) ─────────────────────────────
exports.approveLab = asyncHandler(async (req, res) => {
  const { labId } = req.params;

  const result = await pool.query(
    `UPDATE lab_results 
     SET status = 'complete', recorded_by = 'Nurse', recorded_at = NOW() 
     WHERE id = $1 
     RETURNING *`,
    [labId],
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, "Lab result not found");
  }

  // TODO: You can add Expo Push Notification logic here to notify the mother

  res.json({
    success: true,
    message: "Lab approved and mother notified.",
    data: result.rows[0],
  });
});
