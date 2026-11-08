require("dotenv").config();
const { encrypt, hashForSearch } = require("./src/utils/encryption");

const phone = "+254712345673"; // Penina's phone number
const phoneHash = hashForSearch(phone);

const partnerName = "John Doe";
const partnerPhone = "+254711111111";

const encryptedPartnerName = encrypt(partnerName);
const encryptedPartnerPhone = encrypt(partnerPhone);

console.log("\n--- COPY THIS SQL AND RUN IT IN PGADMIN ---\n");
console.log(`
UPDATE mothers 
SET 
  partner_name = '${encryptedPartnerName}', 
  partner_phone = '${encryptedPartnerPhone}', 
  lmp_date = '2026-10-10', 
  edd = '2027-07-17',
  weeks_pregnant_at_registration = 4,
  updated_at = NOW()
WHERE phone_hash = '${phoneHash}';
`);
console.log("\n-------------------------------------------\n");
