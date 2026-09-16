const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

function validateVaccinationData({ name, givenDate }) {
  const errors = [];
  if (!name || name.trim().length === 0)
    errors.push("Vaccine name is required");
  if (givenDate) {
    const d = new Date(givenDate);
    if (isNaN(d.getTime())) errors.push("Invalid date format");
    else if (d > new Date())
      errors.push("Cannot record a future vaccination date");
  }
  return errors;
}

exports.getVaccinations = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT * FROM vaccinations WHERE mother_id = $1 ORDER BY administration_date ASC NULLS LAST, created_at ASC",
    [id],
  );
  res.json({ success: true, data: result.rows });
});

exports.createVaccination = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    targetWeekOrAge,
    dueDate,
    givenDate,
    given,
    batchNumber,
    givenBy,
  } = req.body;

  const errors = validateVaccinationData({ name, givenDate });
  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const result = await pool.query(
    `INSERT INTO vaccinations (
      mother_id, name, target_week_or_age, due_date, given_date, given,
      batch_number, given_by, administration_date, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING *`,
    [
      id,
      name,
      targetWeekOrAge || "",
      dueDate || null,
      givenDate || new Date().toISOString().split("T")[0],
      given !== undefined ? given : true,
      batchNumber || null,
      givenBy || "Nurse",
      givenDate || new Date().toISOString().split("T")[0],
    ],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateVaccination = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const allowed = ["given", "given_date", "batch_number", "given_by"];
  const keys = Object.keys(updates).filter((k) => allowed.includes(k));
  if (keys.length === 0) {
    return res.status(400).json({ success: false, error: "No valid fields" });
  }
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
  const values = keys.map((k) => updates[k]);
  values.push(id);

  const result = await pool.query(
    `UPDATE vaccinations SET ${setClause} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  res.json({ success: true, data: result.rows[0] });
});
