const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

const getStats = asyncHandler(async (req, res) => {
  const facilityFilter = req.facilityFilter;

  let motherQuery = "SELECT COUNT(*) FROM mothers WHERE 1=1";
  let visitQuery =
    "SELECT COUNT(*) FROM anc_visits a JOIN mothers m ON a.mother_id = m.id WHERE 1=1";
  let alertQuery =
    "SELECT COUNT(*) FROM alerts a JOIN mothers m ON a.mother_id = m.id WHERE a.status = 'open'";

  const params = [];

  if (facilityFilter) {
    // 👇 Use TRIM and UPPER here as well
    motherQuery += " AND UPPER(TRIM(facility_code)) = UPPER(TRIM($1))";
    visitQuery += " AND UPPER(TRIM(m.facility_code)) = UPPER(TRIM($1))";
    alertQuery += " AND UPPER(TRIM(m.facility_code)) = UPPER(TRIM($1))";
    params.push(facilityFilter);
  }

  const [mothersRes, visitsRes, alertsRes] = await Promise.all([
    pool.query(motherQuery, params),
    pool.query(visitQuery, params),
    pool.query(alertQuery, params),
  ]);

  res.json({
    success: true,
    data: {
      mothersRegistered: parseInt(mothersRes.rows[0].count, 10),
      ancVisitsThisMonth: parseInt(visitsRes.rows[0].count, 10),
      openAlerts: parseInt(alertsRes.rows[0].count, 10),
      appointmentsToday: 0,
      highRiskMothers: 0,
      vaccinationsThisMonth: 0,
    },
  });
});

module.exports = { getStats };
