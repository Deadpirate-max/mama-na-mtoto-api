const crypto = require("crypto");

function generateOtp(length = 6) {
  const digits = "0123456789";
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += digits[bytes[i] % 10];
  }
  return code;
}

module.exports = { generateOtp };
