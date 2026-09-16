const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");

// ── Get all visits for a mother ────────────────────────────────────────────
exports.getVisits = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number ASC",
    [id],
  );
  res.json({ success: true, data: result.rows });
});

// ── Add a new visit ────────────────────────────────────────────────────────
exports.createVisit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    visitNumber,
    scheduledWeek,
    visitDate,
    attended,
    bpSystolic,
    bpDiastolic,
    weight,
    fundalHeight,
    urineProtein,
    urineGlucose,
    fetalHeartRate,
    nextAppointment,
    notes,
    recordedBy,
  } = req.body;

  const result = await pool.query(
    `INSERT INTO anc_visits (
      mother_id, visit_number, scheduled_week, visit_date, attended,
      bp_systolic, bp_diastolic, weight, fundal_height,
      urine_protein, urine_glucose, fetal_heart_rate,
      next_appointment, notes, recorded_by, recorded_at, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15, NOW(), NOW()
    ) RETURNING *`,
    [
      id,
      visitNumber || 1,
      scheduledWeek || null,
      visitDate || new Date().toISOString(),
      attended !== undefined ? attended : true,
      bpSystolic || null,
      bpDiastolic || null,
      weight || null,
      fundalHeight || null,
      urineProtein || null,
      urineGlucose || null,
      fetalHeartRate || null,
      nextAppointment || null,
      notes || "",
      recordedBy || "Nurse",
    ],
  );

  res.status(201).json({ success: true, data: result.rows[0] });
});
// Clinical validation helpers
function validateVisitData({
  bpSystolic,
  bpDiastolic,
  weight,
  fundalHeight,
  fetalHeartRate,
}) {
  const errors = [];

  if (bpSystolic !== null && bpSystolic !== undefined) {
    if (bpSystolic < 50 || bpSystolic > 250)
      errors.push("BP systolic must be 50-250 mmHg");
  }
  if (bpDiastolic !== null && bpDiastolic !== undefined) {
    if (bpDiastolic < 30 || bpDiastolic > 150)
      errors.push("BP diastolic must be 30-150 mmHg");
  }
  if (weight !== null && weight !== undefined) {
    if (weight < 30 || weight > 200) errors.push("Weight must be 30-200 kg");
  }
  if (fundalHeight !== null && fundalHeight !== undefined) {
    if (fundalHeight < 5 || fundalHeight > 50)
      errors.push("Fundal height must be 5-50 cm");
  }
  if (fetalHeartRate !== null && fetalHeartRate !== undefined) {
    if (fetalHeartRate < 60 || fetalHeartRate > 220)
      errors.push("Fetal heart rate must be 60-220 bpm");
  }
  return errors;
}

// ── Update a visit (kept for compatibility) ────────────────────────────────
exports.updateVisit = asyncHandler(async (req, res) => {
  const { id, number } = req.params;
  const updates = req.body;
  const allowed = [
    "visit_date",
    "attended",
    "bp_systolic",
    "bp_diastolic",
    "weight",
    "fundal_height",
    "urine_protein",
    "urine_glucose",
    "fetal_heart_rate",
    "next_appointment",
    "notes",
    "recorded_by",
  ];
  const keys = Object.keys(updates).filter((k) => allowed.includes(k));
  if (keys.length === 0) {
    return res.status(400).json({ success: false, error: "No valid fields" });
  }
  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
  const values = keys.map((k) => updates[k]);
  values.push(id, number);

  const result = await pool.query(
    `UPDATE anc_visits SET ${setClause}, recorded_at = NOW()
     WHERE mother_id = $${values.length - 1} AND visit_number = $${values.length}
     RETURNING *`,
    values,
  );
  res.json({ success: true, data: result.rows[0] });
});

const errors = validateVisitData({
  bpSystolic,
  bpDiastolic,
  weight,
  fundalHeight,
  fetalHeartRate,
});
if (errors.length > 0) {
  return res.status(400).json({ success: false, errors });
}
