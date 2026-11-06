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
    const decoded = jwt.verify(token, JWT_SECRET);
    const nurseId = decoded.nurseId || decoded.id;

    const { rows } = await pool.query(
      "SELECT id, role, facility_code, status FROM nurses WHERE id = $1",
      [nurseId],
    );

    if (rows.length === 0) {
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

exports.requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.nurse || !allowedRoles.includes(req.nurse.role)) {
      return res
        .status(403)
        .json({ success: false, error: "Permission denied" });
    }
    next();
  };
};

exports.facilityIsolation = (req, res, next) => {
  if (!req.nurse) return next();
  if (req.nurse.role !== "super_admin") {
    req.facilityFilter = req.nurse.facility;
  }
  next();
};
