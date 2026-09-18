// Kenya MoH / WHO ANC schedule (weeks)
const ANC_WEEKS = [8, 20, 28, 36, 38, 40];

/**
 * Given a completed visit's week, returns the next scheduled week.
 * Returns null if this was the last visit.
 */
exports.getNextAncWeek = (currentWeek) => {
  for (const w of ANC_WEEKS) {
    if (w > currentWeek) return w;
  }
  return null;
};

/**
 * Given the mother's LMP date and a target week, returns the appointment date.
 */
exports.getDateForWeek = (lmpDate, week) => {
  if (!lmpDate || !week) return null;
  const lmp = new Date(lmpDate);
  lmp.setDate(lmp.getDate() + week * 7);
  return lmp.toISOString().split("T")[0];
};
