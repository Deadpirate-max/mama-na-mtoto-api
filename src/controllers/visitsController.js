const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

const updateVisit = asyncHandler(async (req, res) => {
  const { phone, number } = req.params;
  const visitNumber = parseInt(number, 10);

  if (isNaN(visitNumber) || visitNumber < 1) {
    throw new ApiError(400, "Visit number must be a positive integer", errorCodes.BAD_REQUEST);
  }

  const motherResult = await pool.query(`SELECT id FROM mothers WHERE phone = $1`, [phone]);
  if (motherResult.rows.length === 0) {
    throw new ApiError(404, `No mother found with phone ${phone}`, errorCodes.NOT_FOUND);
  }
  const motherId = motherResult.rows[0].id;

  const allowedFields = [
    "visit_date", "gestational_age_weeks", "blood_pressure", "weight_kg",
    "fundal_height_cm", "fetal_heart_rate", "notes", "next_visit_date",
  ];

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
  const values = [motherId, visitNumber, ...Object.values(updates)];

  const { rows } = await pool.query(
    `UPDATE anc_visits
     SET ${setClauses.join(", ")}
     WHERE mother_id = $1 AND visit_number = $2
     RETURNING *`,
    values,
  );

  if (rows.length === 0) {
    throw new ApiError(404, `Visit number ${visitNumber} not found for this mother`, errorCodes.NOT_FOUND);
  }

  res.status(200).json({ success: true, data: rows[0] });
});

module.exports = { updateVisit };
