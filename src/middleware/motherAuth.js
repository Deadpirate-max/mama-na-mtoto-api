const jwt = require("jsonwebtoken");
const { ApiError, errorCodes } = require("../utils/ApiError");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");

exports.requireMotherAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new ApiError(401, "Authentication required", errorCodes.UNAUTHORIZED),
    );
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "mama_na_mtoto_secret_2026",
    );
    req.mother = decoded;
    next();
  } catch (err) {
    return next(
      new ApiError(401, "Invalid or expired token", errorCodes.UNAUTHORIZED),
    );
  }
};
