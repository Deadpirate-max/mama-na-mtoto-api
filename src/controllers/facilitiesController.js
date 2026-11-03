const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

const getFacilities = asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT * FROM facilities ORDER BY name ASC");
  res.json({ success: true, data: result.rows });
});

const createFacility = asyncHandler(async (req, res) => {
  const { code, name, county, level } = req.body;
  await pool.query(
    "INSERT INTO facilities (code, name, county, level) VALUES ($1, $2, $3, $4)",
    [code, name, county, level || 4],
  );
  res.status(201).json({ success: true, message: "Facility created" });
});

module.exports = { getFacilities, createFacility };
