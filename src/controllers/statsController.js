const getStats = asyncHandler(async (req, res) => {
  // 👇 Apply the filter if it exists
  const facilityCode = req.facilityFilter;

  let motherQuery = "SELECT COUNT(*) FROM mothers";
  let visitQuery = "SELECT COUNT(*) FROM anc_visits";
  let alertQuery = "SELECT COUNT(*) FROM alerts WHERE status = 'open'";

  const params = [];

  if (facilityCode) {
    // Assuming you have a facility_code column on these tables
    // You might need to JOIN if anc_visits doesn't have facility_code directly
    motherQuery += " WHERE facility_code = $1";
    alertQuery += " AND facility_code = $1";
    visitQuery +=
      " JOIN mothers ON anc_visits.mother_id = mothers.id WHERE mothers.facility_code = $1";
    params.push(facilityCode);
  }

  const [mothersRes, visitsRes, alertsRes] = await Promise.all([
    pool.query(motherQuery, params),
    pool.query(visitQuery, params),
    pool.query(alertQuery, params),
  ]);

  res.json({
    success: true,
    data: {
      mothersRegistered: parseInt(mothersRes.rows[0].count),
      ancVisitsThisMonth: parseInt(visitsRes.rows[0].count),
      openAlerts: parseInt(alertsRes.rows[0].count),
      // ...
    },
  });
});
