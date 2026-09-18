const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");
const { getNextAncWeek, getDateForWeek } = require("../utils/ancSchedule");

// ── 🛡️ Clinical validation ───────────────────────────────────────────────
function validateVisitData({
  bpSystolic,
  bpDiastolic,
  weight,
  fundalHeight,
  fetalHeartRate,
}) {
  const errors = [];
  if (bpSystolic != null && (bpSystolic < 50 || bpSystolic > 250))
    errors.push("BP systolic must be 50-250 mmHg");
  if (bpDiastolic != null && (bpDiastolic < 30 || bpDiastolic > 150))
    errors.push("BP diastolic must be 30-150 mmHg");
  if (weight != null && (weight < 30 || weight > 200))
    errors.push("Weight must be 30-200 kg");
  if (fundalHeight != null && (fundalHeight < 5 || fundalHeight > 50))
    errors.push("Fundal height must be 5-50 cm");
  if (fetalHeartRate != null && (fetalHeartRate < 60 || fetalHeartRate > 220))
    errors.push("Fetal heart rate must be 60-220 bpm");
  return errors;
}

// ── Get all visits for a mother ──────────────────────────────────────────
exports.getVisits = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT * FROM anc_visits WHERE mother_id = $1 ORDER BY visit_number ASC",
    [id],
  );
  res.json({ success: true, data: result.rows });
});

// ── Create a new visit (with auto-scheduled next appointment) ────────────
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

  // 🛡️ Validate
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

  // 🗓️ Auto-calculate current gestation week
  let finalWeek = scheduledWeek;
  let motherLmp = null;
  try {
    const m = await pool.query(
      "SELECT lmp_date, weeks_pregnant_at_registration, registration_date FROM mothers WHERE id = $1",
      [id],
    );
    if (m.rows.length > 0) {
      const mother = m.rows[0];
      motherLmp = mother.lmp_date;
      const visitD = visitDate ? new Date(visitDate) : new Date();

      if (!finalWeek && mother.lmp_date) {
        const lmp = new Date(mother.lmp_date);
        const diffDays = Math.floor(
          (visitD.getTime() - lmp.getTime()) / (1000 * 60 * 60 * 24),
        );
        finalWeek = Math.max(0, Math.min(42, Math.floor(diffDays / 7)));
      } else if (
        !finalWeek &&
        mother.registration_date &&
        mother.weeks_pregnant_at_registration
      ) {
        const regDate = new Date(mother.registration_date);
        const weeksSinceReg = Math.floor(
          (visitD.getTime() - regDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        finalWeek = Math.min(
          42,
          mother.weeks_pregnant_at_registration + weeksSinceReg,
        );
      }
    }
  } catch (e) {
    console.warn("Could not auto-calculate gestation week:", e.message);
  }

  // 🗓️ Auto-compute NEXT visit
  let computedNextWeek = null;
  let computedNextAppointment = nextAppointment || null;

  if (finalWeek) {
    computedNextWeek = getNextAncWeek(finalWeek);
    if (computedNextWeek && motherLmp) {
      computedNextAppointment = getDateForWeek(motherLmp, computedNextWeek);
    }
  }

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
      finalWeek || null,
      visitDate || new Date().toISOString(),
      attended !== undefined ? attended : true,
      bpSystolic || null,
      bpDiastolic || null,
      weight || null,
      fundalHeight || null,
      urineProtein || null,
      urineGlucose || null,
      fetalHeartRate || null,
      computedNextAppointment || null,
      notes || "",
      recordedBy || "Nurse",
    ],
  );

  res.status(201).json({
    success: true,
    data: {
      ...result.rows[0],
      nextAncWeek: computedNextWeek,
    },
  });
});

// ── Update a visit ───────────────────────────────────────────────────────
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
