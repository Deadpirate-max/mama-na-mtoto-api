const { ApiError, errorCodes } = require("../utils/ApiError");

function notFound(req, _res, next) {
  next(new ApiError(404, "Route not found", errorCodes.NOT_FOUND));
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const code = err.code || errorCodes.INTERNAL_ERROR;
  const message = err.isOperational
    ? err.message
    : status >= 500
      ? "Internal server error"
      : err.message;

  if (status >= 500) {
    console.error("[ERROR]", err.stack || err.message || err);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV !== "production" && status >= 500
        ? { details: err.message }
        : {}),
    },
  });
}

module.exports = { errorHandler, notFound };
