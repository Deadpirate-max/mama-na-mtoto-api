function calculateRisk(profile) {
  const factors = [];
  let score = 0;

  const add = (factor, points, category, recommendation) => {
    factors.push({ factor, points, category, recommendation });
    score += points;
  };

  // Personal
  const age = profile.age ?? 0;
  if (age > 0 && age < 18)
    add(
      "Teen pregnancy (under 18)",
      20,
      "personal",
      "Refer to specialized teen antenatal care. Monitor for preeclampsia and low birth weight.",
    );
  else if (age > 35)
    add(
      "Advanced maternal age (over 35)",
      10,
      "personal",
      "Increased monitoring for chromosomal abnormalities and hypertension.",
    );

  // Conditions
  const conditions = profile.conditions || [];
  if (conditions.some((c) => c.toLowerCase().includes("hypertension")))
    add(
      "Pre-existing hypertension",
      25,
      "personal",
      "Monitor BP at every visit. Antihypertensives if BP >= 140/90.",
    );
  if (conditions.some((c) => c.toLowerCase().includes("diabetes")))
    add(
      "Pre-existing diabetes",
      25,
      "personal",
      "Monitor blood sugar. Adjust diet and medication.",
    );
  if (conditions.some((c) => c.toLowerCase().includes("anemia")))
    add(
      "Pre-existing anemia",
      10,
      "personal",
      "Ensure iron compliance. Recheck Hb monthly.",
    );

  // Labs
  const hb = (profile.lab_results || profile.labResults || []).find(
    (l) => l.id === "haemoglobin",
  );
  if (hb?.value) {
    const hbVal = parseFloat(hb.value);
    if (hbVal < 7.0)
      add(
        `Severe anaemia (Hb ${hbVal})`,
        35,
        "labs",
        "URGENT: Refer to hospital. Transfusion may be required.",
      );
    else if (hbVal < 9.0)
      add(
        `Moderate anaemia (Hb ${hbVal})`,
        20,
        "labs",
        "Increase iron to 120mg. Recheck in 4 weeks.",
      );
    else if (hbVal < 11.0)
      add(
        `Mild anaemia (Hb ${hbVal})`,
        10,
        "labs",
        "Ensure daily iron 60mg. Dietary counselling.",
      );
  }

  const hiv = (profile.lab_results || []).find((l) => l.id === "hiv");
  if (hiv?.value === "Reactive")
    add("HIV Reactive", 20, "labs", "Initiate PMTCT protocol immediately.");

  const bs = (profile.lab_results || []).find((l) => l.id === "blood_sugar");
  if (bs?.value) {
    const bsVal = parseFloat(bs.value);
    if (bsVal > 11.0)
      add(
        `High blood sugar (${bsVal})`,
        25,
        "labs",
        "Probable gestational diabetes. GTT required.",
      );
    else if (bsVal > 7.8)
      add(
        `Elevated blood sugar (${bsVal})`,
        15,
        "labs",
        "Screen for gestational diabetes.",
      );
  }

  // Vitals (last visit)
  const visits = (profile.anc_visits || profile.ancVisits || []).filter(
    (v) => v.attended,
  );
  visits.forEach((visit) => {
    const sys = visit.bp_systolic ?? visit.bpSystolic ?? 0;
    const dia = visit.bp_diastolic ?? visit.bpDiastolic ?? 0;
    if (sys >= 160 || dia >= 110)
      add(
        `Severe hypertension at Visit ${visit.visit_number}`,
        35,
        "vitals",
        "EMERGENCY: Admit immediately. MgSO4 prophylaxis.",
      );
    else if (sys >= 140 || dia >= 90)
      add(
        `Elevated BP at Visit ${visit.visit_number}`,
        20,
        "vitals",
        "Preeclampsia risk. Recheck BP in 30 min.",
      );

    const fhr = visit.fetal_heart_rate ?? visit.fetalHeartRate ?? 0;
    if (fhr > 0 && (fhr < 110 || fhr > 160))
      add(
        `Abnormal FHR at Visit ${visit.visit_number}`,
        20,
        "vitals",
        "Foetal distress possible. CTG monitoring required.",
      );
  });

  // Recent danger signs (7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const danger = (profile.symptom_logs || []).filter(
    (l) => (l.is_danger || l.isDanger) && new Date(l.timestamp) > sevenDaysAgo,
  );
  const counts = {};
  danger.forEach((log) => {
    counts[log.symptom] = (counts[log.symptom] || 0) + 1;
  });
  Object.entries(counts).forEach(([symptom, count]) => {
    const pts = count === 1 ? 15 : count === 2 ? 25 : 35;
    add(
      `Danger sign: ${symptom} (${count}x)`,
      pts,
      "symptoms",
      "Nurse follow-up within 24 hours.",
    );
  });

  // EDD proximity
  if (profile.edd) {
    const daysToEDD = Math.ceil(
      (new Date(profile.edd).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysToEDD < 0)
      add(
        "Past estimated due date",
        30,
        "timeline",
        "URGENT: Post-dates. Refer for induction assessment.",
      );
    else if (daysToEDD <= 7)
      add(
        `Delivery imminent (${daysToEDD} days)`,
        15,
        "timeline",
        "Ensure birth plan ready. Confirm delivery facility.",
      );
  }

  // Risk level
  let level = "low";
  if (score >= 70) level = "critical";
  else if (score >= 40) level = "high";
  else if (score >= 20) level = "medium";

  const topFactors = factors
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((f) => f.factor)
    .join("; ");

  const nurseAlert = level === "critical" || level === "high";
  const alertMessage = nurseAlert
    ? `Risk elevated to ${level.toUpperCase()} (score ${score}). Key: ${topFactors}.`
    : "";

  const summary =
    level === "critical"
      ? "CRITICAL RISK — Immediate medical attention required"
      : level === "high"
        ? "HIGH RISK — Close monitoring and nurse follow-up essential"
        : level === "medium"
          ? "MEDIUM RISK — Enhanced monitoring recommended"
          : "LOW RISK — Standard antenatal care protocol";

  return { level, score, factors, nurseAlert, alertMessage, summary };
}

module.exports = { calculateRisk };
