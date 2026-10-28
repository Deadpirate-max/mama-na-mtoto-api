const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, error: "No token provided" });
    }

    const token = authHeader.substring(7);

    // 1. Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("❌ JWT Verify failed:", err.message);
      return res
        .status(401)
        .json({ success: false, error: "Invalid or expired token (JWT)" });
    }

    // 2. Find the ID in the payload (handles both 'id' and 'nurseId')
    const nurseId = decoded.nurseId || decoded.id;

    if (!nurseId) {
      console.error("❌ Token payload missing id/nurseId:", decoded);
      return res
        .status(401)
        .json({ success: false, error: "Token missing user ID" });
    }

    // 3. Fetch live status from DB
    const { rows } = await pool.query(
      "SELECT id, role, facility_code, status FROM nurses WHERE id = $1",
      [nurseId],
    );

    if (rows.length === 0) {
      console.error(`❌ No nurse found in DB for ID: ${nurseId}`);
      return res
        .status(401)
        .json({ success: false, error: "User no longer exists" });
    }

    const nurse = rows[0];

    if (nurse.status !== "active") {
      return res
        .status(403)
        .json({ success: false, error: "Account is not active" });
    }

    // 4. Attach to request
    req.nurse = {
      id: nurse.id,
      role: nurse.role,
      facility: nurse.facility_code,
    };

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error during auth" });
  }
};

// 2. Role-Based Access Control
exports.requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.nurse || !allowedRoles.includes(req.nurse.role)) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to perform this action",
      });
    }
    next();
  };
};

// 3. Facility Data Isolation
exports.facilityIsolation = (req, res, next) => {
  if (!req.nurse) return next();

  // Super admins see everything. Everyone else is locked to their facility.
  if (req.nurse.role !== "super_admin") {
    req.facilityFilter = req.nurse.facility;
  }
  next();
};
