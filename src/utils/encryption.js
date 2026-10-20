const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
// Convert the hex string from .env into a buffer
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");

/**
 * Encrypts a string
 * Returns format: iv:authTag:encryptedData
 */
exports.encrypt = (text) => {
  if (!text) return text;

  const iv = crypto.randomBytes(12); // 96-bit IV is standard for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Combine them so we can store it in one database column
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

/**
 * Decrypts a string
 */
exports.decrypt = (encryptedText) => {
  if (!encryptedText) return encryptedText;

  try {
    const [ivHex, authTagHex, encryptedData] = encryptedText.split(":");

    if (!ivHex || !authTagHex || !encryptedData) {
      return encryptedText; // Return as-is if it's not encrypted
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return null;
  }
};

/**
 * Creates a Blind Index for searchable encrypted fields (like phone numbers)
 * Since encrypted text changes every time, we hash it to search it.
 */
exports.hashForSearch = (text) => {
  if (!text) return text;
  return crypto.createHash("sha256").update(text).digest("hex");
};
