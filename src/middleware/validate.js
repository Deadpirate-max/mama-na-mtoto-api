const { ApiError, errorCodes } = require("../utils/ApiError");

function validate(schema, source = "body") {
  return (req, _res, next) => {
    const data = req[source];
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      if (rules.required && (value === undefined || value === null || value === "")) {
        errors.push({ field, message: `${field} is required` });
        continue;
      }

      if (value === undefined || value === null || value === "") continue;

      if (rules.type && typeof value !== rules.type) {
        errors.push({ field, message: `${field} must be a ${rules.type}` });
        continue;
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({
          field,
          message: `${field} must be one of: ${rules.enum.join(", ")}`,
        });
      }

      if (rules.min !== undefined && typeof value === "number" && value < rules.min) {
        errors.push({ field, message: `${field} must be >= ${rules.min}` });
      }

      if (rules.max !== undefined && typeof value === "number" && value > rules.max) {
        errors.push({ field, message: `${field} must be <= ${rules.max}` });
      }

      if (rules.pattern && !rules.pattern.test(String(value))) {
        errors.push({ field, message: `${field} format is invalid` });
      }
    }

    if (errors.length > 0) {
      return next(
        new ApiError(422, "Validation failed", errorCodes.VALIDATION_ERROR, errors),
      );
    }

    next();
  };
}

module.exports = { validate };
