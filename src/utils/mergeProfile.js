const TRACKED = [
  "name",
  "id_number",
  "county",
  "sub_county",
  "village",
  "partner_name",
  "partner_phone",
];

// Who wins while a mismatch is unresolved
const AUTHORITY = {
  name: "nurse",
  id_number: "nurse",
  county: "nurse",
  sub_county: "mother",
  village: "mother",
  partner_name: "mother",
  partner_phone: "mother",
};

const clean = (v) => (v == null ? "" : String(v).trim());
const norm = (v) => clean(v).toLowerCase().replace(/\s+/g, " ");

function mergeProfile(nurseData = {}, motherData = {}) {
  const merged = {},
    conflicts = {},
    nurseEntered = {},
    motherEntered = {};

  for (const f of TRACKED) {
    const n = clean(nurseData[f]);
    const m = clean(motherData[f]);

    if (n) nurseEntered[f] = n;
    if (m) motherEntered[f] = m;

    if (n && !m) merged[f] = n;
    else if (m && !n) merged[f] = m;
    else if (!n && !m) merged[f] = "";
    else if (norm(n) === norm(m))
      merged[f] = m; // match
    else {
      merged[f] = AUTHORITY[f] === "mother" ? m : n; // provisional
      conflicts[f] = { nurse: n, mother: m };
    }
  }
  return { merged, conflicts, nurseEntered, motherEntered };
}

module.exports = { mergeProfile, TRACKED };
