const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Get all lab results for a mother ───────────────────────────────────────
exports.getLabs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT * FROM lab_results WHERE mother_id = $1 ORDER BY test_date DESC NULLS LAST, created_at DESC",
    [id],
  );
  res.json({ success: true, data: result.rows });
});

// ── Add a lab result ───────────────────────────────────────────────────────
exports.createLab = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, value, unit, normalRange, status, testDate, recordedBy } =
    req.body;

  const result = await pool.query(
    `INSERT INTO lab_results (
      mother_id, name, value, unit, normal_range, status,
      test_date, recorded_by, recorded_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING *`,
    [
      id,
      name || "Lab test",
      value || "",
      unit || "",
      normalRange || "",
      status || "complete",
      testDate || new Date().toISOString(),
      recordedBy || "Nurse",
    ],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

// ── Update a lab result ────────────────────────────────────────────────────
exports.updateLabResult = asyncHandler(async (req, res) => {
  const { id, labId } = req.params;
  const updates = req.body;
  const allowed = ["value", "status", "unit", "normal_range", "recorded_by"];
  const keys = Object.keys(updates).filter((k) => allowed.includes(k));
  if (keys.length === 0) {
    return res.status(400).json({ success: false, error: "No valid fields" });
  }
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
  const values = keys.map((k) => updates[k]);
  values.push(labId);

  const result = await pool.query(
    `UPDATE lab_results SET ${setClause}, recorded_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values,
  );
  res.json({ success: true, data: result.rows[0] });
});
