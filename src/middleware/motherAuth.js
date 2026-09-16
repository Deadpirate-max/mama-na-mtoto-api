const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";

/**
 * Middleware: verifies the mother's JWT token.
 * Mother receives this token after OTP verification on the mobile app.
 */
exports.requireMotherAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach the mother's verified phone
    req.mother = { phone: decoded.phone };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or expired token" });
  }
};
