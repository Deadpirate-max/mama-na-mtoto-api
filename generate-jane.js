// setup-test-user.js
require("dotenv").config();
const { encrypt, hashForSearch } = require("./src/utils/encryption");

const testPhone = "+254712345678";

const encryptedPhone = encrypt(testPhone);
const phoneHash = hashForSearch(testPhone);
const encryptedName = encrypt("Test Patient");

console.log("=========================================");
console.log("COPY AND PASTE THIS SQL INTO PGADMIN:");
console.log("=========================================\n");

// 👇 Removed risk_level from the query
console.log(`
INSERT INTO mothers (
  name, 
  phone, 
  phone_hash, 
  weeks_pregnant_at_registration, 
  county,
  registration_date
) VALUES (
  '${encryptedName}', 
  '${encryptedPhone}', 
  '${phoneHash}', 
  28, 
  'Nairobi',
  NOW()
) ON CONFLICT (phone_hash) DO NOTHING;
`);

console.log("=========================================");
