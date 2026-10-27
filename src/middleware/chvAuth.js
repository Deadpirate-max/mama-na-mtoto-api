const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

// Ensure JWT_SECRET exists
const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

// 1. Authenticate & Check Live Database Status
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    // 🔐 SECURITY UPGRADE: Fetch live status from DB
    // We do not trust the token for role/facility because they might have changed
    const { rows } = await pool.query(
      "SELECT id, role, facility_code, status FROM nurses WHERE id = $1",
      [decoded.nurseId],
    );

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, error: "User no longer exists" });
    }

    const nurse = rows[0];

    // Block suspended or pending accounts immediately
    if (nurse.status !== "active") {
      return res
        .status(403)
        .json({ success: false, error: "Account is not active" });
    }

    // Attach the live DB record to req.nurse (instead of req.chv)
    req.nurse = {
      id: nurse.id,
      role: nurse.role,
      facility: nurse.facility_code,
    };

    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
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
