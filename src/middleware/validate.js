const { ApiError, errorCodes } = require("../utils/ApiError");

const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (
        rules.required &&
        (value === undefined || value === null || value === "")
      ) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be a ${rules.type}`);
      }

      if (value !== undefined && rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} has an invalid format`);
      }

      if (value !== undefined && rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    next();
  };
};

module.exports = { validate };
