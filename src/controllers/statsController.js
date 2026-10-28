const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

const getStats = asyncHandler(async (req, res) => {
  // req.facilityFilter is set by the facilityIsolation middleware in chvAuth.js
  const facilityFilter = req.facilityFilter;

  let motherQuery = "SELECT COUNT(*) FROM mothers WHERE 1=1";
  let visitQuery =
    "SELECT COUNT(*) FROM anc_visits a JOIN mothers m ON a.mother_id = m.id WHERE 1=1";
  let alertQuery =
    "SELECT COUNT(*) FROM alerts a JOIN mothers m ON a.mother_id = m.id WHERE a.status = 'open'";

  const params = [];

  // 👇 Apply strict facility isolation
  if (facilityFilter) {
    motherQuery += " AND facility_code = $1";
    visitQuery += " AND m.facility_code = $1";
    alertQuery += " AND m.facility_code = $1";
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
      // Add any other stats you need here (e.g., appointmentsToday, highRiskMothers)
      appointmentsToday: 0,
      highRiskMothers: 0,
      vaccinationsThisMonth: 0,
    },
  });
});

module.exports = { getStats };
