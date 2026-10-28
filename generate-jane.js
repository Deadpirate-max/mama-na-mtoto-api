require("dotenv").config();
const { encrypt, hashForSearch } = require("./src/utils/encryption");
const bcrypt = require("bcryptjs");

async function generateNurse() {
  const phone = "+254799999999"; // The phone number Jane will use to log in
  const pin = "1234"; // The PIN Jane will use

  // 1. Encrypt the phone for storage and generate the blind index
  const encryptedPhone = encrypt(phone);
  const phoneHash = hashForSearch(phone);

  // 2. Hash the PIN
  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(pin, salt);

  console.log("\n--- COPY THE SQL BELOW AND RUN IT IN PGADMIN ---\n");
  // Changed full_name to name
  console.log(`INSERT INTO nurses (name, phone, phone_hash, pin_hash, role, facility_code, status) 
VALUES ('Nurse Jane', '${encryptedPhone}', '${phoneHash}', '${pinHash}', 'nurse', 'MNH-001', 'active');`);
  console.log("\n------------------------------------------------\n");
}

generateNurse();
