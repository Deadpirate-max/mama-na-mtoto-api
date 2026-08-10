const pool = require("../db/pool");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");

const createMother = asyncHandler(async (req, res) => {
  const {
    phone, name, age, lmp_date, edd, gravida, para,
    blood_group, address, emergency_contact,
  } = req.body;

  const { rows } = await pool.query(
    `INSERT INTO mothers (phone, name, age, lmp_date, edd, gravida, para, blood_group, address, emergency_contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [phone, name, age, lmp_date, edd, gravida, para, blood_group, address, emergency_contact],
  );

  res.status(201).json({ success: true, data: rows[0] });
});

const getMotherByPhone = asyncHandler(async (req, res) => {
  const { phone } = req.params;

  const { rows } = await pool.query(
    `SELECT * FROM mothers WHERE phone = $1`,
    [phone],
  );

  if (rows.length === 0) {
    throw new ApiError(404, `No mother found with phone ${phone}`, errorCodes.NOT_FOUND);
  }

  const mother = rows[0];

  const [visits, labs, vax, symptoms, alerts] = await Promise.all([
    pool.query(`SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number`, [mother.id]),
    pool.query(`SELECT * FROM lab_results WHERE mother_id = $1 ORDER BY test_date DESC`, [mother.id]),
    pool.query(`SELECT * FROM vaccinations WHERE mother_id = $1 ORDER BY administration_date`, [mother.id]),
    pool.query(`SELECT * FROM symptom_logs WHERE mother_id = $1 ORDER BY log_date DESC`, [mother.id]),
    pool.query(`SELECT * FROM alerts WHERE mother_id = $1 ORDER BY created_at DESC`, [mother.id]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...mother,
      anc_visits: visits.rows,
      lab_results: labs.rows,
      vaccinations: vax.rows,
      symptom_logs: symptoms.rows,
      alerts: alerts.rows,
    },
  });
});

const updateMother = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const allowedFields = [
    "name", "age", "lmp_date", "edd", "gravida", "para",
    "blood_group", "address", "emergency_contact",
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

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = [phone, ...Object.values(updates)];

  const { rows } = await pool.query(
    `UPDATE mothers SET ${setClauses.join(", ")} WHERE phone = $1 RETURNING *`,
    values,
  );

  if (rows.length === 0) {
    throw new ApiError(404, `No mother found with phone ${phone}`, errorCodes.NOT_FOUND);
  }

  res.status(200).json({ success: true, data: rows[0] });
});

module.exports = { createMother, getMotherByPhone, updateMother };
