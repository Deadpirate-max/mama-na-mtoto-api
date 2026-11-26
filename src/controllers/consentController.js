const pool = require("../db/pool");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError, errorCodes } = require("../utils/ApiError");
const { hashForSearch } = require("../utils/encryption");

const PURPOSES = ["core", "ai_chat", "voice", "support_alerts"];
// Must match CONSENT_VERSION in the app. Bump both when the meaning of a text changes.
const CURRENT_VERSION = process.env.CONSENT_VERSION || "2026-11-v1";

async function insertConsent(req, purpose, granted, version, language) {
  await pool.query(
    `INSERT INTO consents (mother_ref, purpose, granted, version, language, app_user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      hashForSearch(req.mother.phone),
      purpose,
      granted,
      version,
      ["en", "sw"].includes(language) ? language : null,
      String(req.get("user-agent") || "").slice(0, 200),
      req.ip,
    ],
  );
}

// POST /api/consents   { purpose, granted, version, language }
exports.recordConsent = asyncHandler(async (req, res) => {
  if (!req.mother?.phone)
    throw new ApiError(401, "Authentication required", errorCodes.UNAUTHORIZED);
  const { purpose, granted, version, language } = req.body;

  if (!PURPOSES.includes(purpose))
    throw new ApiError(
      422,
      "Unknown consent purpose",
      errorCodes.VALIDATION_ERROR,
    );
  if (typeof granted !== "boolean")
    throw new ApiError(
      422,
      "granted must be true or false",
      errorCodes.VALIDATION_ERROR,
    );
  if (version !== CURRENT_VERSION) {
    throw new ApiError(
      409,
      "The consent wording has been updated. Please update the app.",
      "CONSENT_VERSION_MISMATCH",
    );
  }

  await insertConsent(req, purpose, granted, version, language);
  // Voice depends on the assistant. Withdrawing the assistant withdraws voice too.
  if (purpose === "ai_chat" && granted === false)
    await insertConsent(req, "voice", false, version, language);

  res.json({ success: true });
});

// GET /api/consents  ->  { core: { granted, version, at }, ai_chat: {...}, ... }
exports.getConsents = asyncHandler(async (req, res) => {
  if (!req.mother?.phone)
    throw new ApiError(401, "Authentication required", errorCodes.UNAUTHORIZED);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (purpose) purpose, granted, version, created_at
       FROM consents WHERE mother_ref = $1
      ORDER BY purpose, created_at DESC, id DESC`,
    [hashForSearch(req.mother.phone)],
  );
  const data = {};
  rows.forEach((r) => {
    data[r.purpose] = {
      granted: r.granted,
      version: r.version,
      at: r.created_at,
    };
  });
  res.json({ success: true, data });
});

// Use on routes that must not run without consent. The server enforces it, not just the app.
//   router.post("/message",    authenticateMother, requireConsent("ai_chat"), chat.sendChatMessage);
//   router.post("/transcribe", authenticateMother, requireConsent("voice"), requireConsent("ai_chat"), ...chat.transcribeVoice);
exports.requireConsent = (purpose) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.mother?.phone)
      throw new ApiError(
        401,
        "Authentication required",
        errorCodes.UNAUTHORIZED,
      );
    const { rows } = await pool.query(
      `SELECT granted, version FROM consents
        WHERE mother_ref = $1 AND purpose = $2
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [hashForSearch(req.mother.phone), purpose],
    );
    const c = rows[0];
    if (!c || !c.granted || c.version !== CURRENT_VERSION) {
      throw new ApiError(
        403,
        `Consent required: ${purpose}`,
        "CONSENT_REQUIRED",
      );
    }
    next();
  });

// Helper for the alert service: only text a support person if the mother agreed.
exports.hasConsent = async (phone, purpose) => {
  const { rows } = await pool.query(
    `SELECT granted, version FROM consents
      WHERE mother_ref = $1 AND purpose = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [hashForSearch(phone), purpose],
  );
  return !!rows[0] && rows[0].granted && rows[0].version === CURRENT_VERSION;
};
