const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch from DB to ensure account hasn't been suspended since token was issued
    const { rows } = await pool.query(
      "SELECT id, role, facility_code, status FROM nurses WHERE id = $1",
      [decoded.nurseId],
    );

    if (!rows[0] || rows[0].status !== "active") {
      return res
        .status(401)
        .json({ success: false, error: "Account not active or suspended" });
    }

    req.nurse = rows[0];
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.nurse.role)) {
    return res.status(403).json({
      success: false,
      error: "You do not have permission to perform this action",
    });
  }
  next();
};

// Data isolation — nurses only see their own facility
const facilityIsolation = (req, res, next) => {
  if (req.nurse.role !== "super_admin") {
    req.facilityFilter = req.nurse.facility_code;
  }
  next();
};

module.exports = { authenticate, requireRole, facilityIsolation };
