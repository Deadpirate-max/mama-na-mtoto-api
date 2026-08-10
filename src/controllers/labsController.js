const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

const updateLabResult = asyncHandler(async (req, res) => {
  const { phone, id } = req.params;

  const motherResult = await pool.query(`SELECT id FROM mothers WHERE phone = $1`, [phone]);
  if (motherResult.rows.length === 0) {
    throw new ApiError(404, `No mother found with phone ${phone}`, errorCodes.NOT_FOUND);
  }
  const motherId = motherResult.rows[0].id;

  const allowedFields = ["test_type", "test_date", "result", "normal_range", "status", "notes"];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields to update", errorCodes.BAD_REQUEST);
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`);
  const values = [motherId, id, ...Object.values(updates)];

  const { rows } = await pool.query(
    `UPDATE lab_results
     SET ${setClauses.join(", ")}
     WHERE mother_id = $1 AND id = $2
     RETURNING *`,
    values,
  );

  if (rows.length === 0) {
    throw new ApiError(404, `Lab result ${id} not found for this mother`, errorCodes.NOT_FOUND);
  }

  res.status(200).json({ success: true, data: rows[0] });
});

module.exports = { updateLabResult };
