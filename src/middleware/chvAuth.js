const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

exports.requireChvAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, error: "No token provided" });
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.chv = {
      id: decoded.id,
      name: decoded.name,
      phone: decoded.phone,
      facility: decoded.facility,
      role: decoded.role,
    };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
  }
};
