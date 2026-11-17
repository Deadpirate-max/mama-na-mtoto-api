// Deterministic danger-sign detector. It runs BEFORE any language model, so a danger sign is
// never missed because a model was slow, wrong or offline. The same patterns ship in the app
// (app/redFlags.json + app/redFlags.ts) so the app can warn her even with no internet.
const data = require("./redFlags.json");

const ORDER = { none: 0, monitor: 1, call_nurse: 2, go_now: 3 };

const compiled = data.flags.map((f) => ({
  ...f,
  re: {
    en: f.en.map((p) => new RegExp(p, "i")),
    sw: f.sw.map((p) => new RegExp(p, "i")),
  },
}));

const NEG = new Set(
  [...data.negations.en, ...data.negations.sw].map((w) => w.toLowerCase()),
);

// Negation only softens lower-urgency flags ("no fever"). Danger flags always fire:
// a false alarm costs a phone call, a missed danger sign can cost a life.
function negated(text, idx) {
  const tokens = text.slice(0, idx).trim().split(" ");
  for (let i = tokens.length - 1, seen = 0; i >= 0 && seen < 4; i--, seen++) {
    const raw = tokens[i];
    if (/[,.;!?]$/.test(raw) && seen > 0) return false; // clause boundary
    const cleanToken = raw.replace(/[^\p{L}']/gu, "").toLowerCase();
    if (NEG.has(cleanToken)) return true;
  }
  return false;
}

const maxUrgency = (a, b) => (ORDER[b] > ORDER[a] ? b : a);

function detectRedFlags(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
  const byId = new Map();

  for (const f of compiled) {
    for (const lang of ["en", "sw"]) {
      for (const re of f.re[lang]) {
        const m = re.exec(t);
        if (!m) continue;
        if (f.urgency !== "go_now" && !f.crisis && negated(t, m.index))
          continue;
        if (!byId.has(f.id)) {
          byId.set(f.id, {
            id: f.id,
            urgency: f.urgency,
            topic: f.topic,
            crisis: !!f.crisis,
            lang,
            match: m[0],
          });
        }
        break;
      }
    }
  }

  const flags = [...byId.values()];
  return {
    flags,
    urgency: flags.reduce((hi, h) => maxUrgency(hi, h.urgency), "none"),
    crisis: flags.some((h) => h.crisis),
  };
}

module.exports = { detectRedFlags, maxUrgency, ORDER };
