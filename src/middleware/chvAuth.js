const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

// ❌ REMOVE the fallback secret. Fail loudly if unset.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set — refusing to start");
}
const JWT_SECRET = process.env.JWT_SECRET;

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
    const nurseId = decoded.nurseId || decoded.id || decoded.sub; // accept all conventions

    if (!nurseId) {
      return res
        .status(401)
        .json({ success: false, error: "Token missing nurse id" });
    }

    const { rows } = await pool.query(
      "SELECT id, name, phone, role, facility_code, status FROM nurses WHERE id = $1",
      [nurseId],
    );

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, error: "User no longer exists" });
    }

    const nurse = rows[0];
    if (String(nurse.status).toLowerCase() !== "active") {
      return res
        .status(403)
        .json({ success: false, error: "Account is not active" });
    }

    // ✅ Expose BOTH shapes so any controller written against the old auth.js keeps working
    req.nurse = {
      id: nurse.id,
      name: nurse.name,
      phone: nurse.phone,
      role: nurse.role,
      facility: nurse.facility_code,
      facility_code: nurse.facility_code, // alias for compat
    };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
  }
};

exports.requireRole = (allowedRoles) => (req, res, next) => {
  if (!req.nurse || !allowedRoles.includes(req.nurse.role)) {
    return res.status(403).json({ success: false, error: "Permission denied" });
  }
  next();
};

exports.facilityIsolation = (req, res, next) => {
  if (!req.nurse) return next();
  if (req.nurse.role !== "super_admin") {
    req.facilityFilter = req.nurse.facility_code;
  }
  next();
};
