require("dotenv").config();
const { encrypt, hashForSearch } = require("./src/utils/encryption");
const bcrypt = require("bcryptjs");

async function createSuperAdmin() {
  const phone = "+254795094349"; // YOUR PHONE NUMBER
  const pin = "3994";
  const name = "Xavier Sanya";

  console.log("\n--- RUN THIS SQL IN PGADMIN ---\n");
  console.log(`
INSERT INTO nurses (name, phone, phone_hash, pin_hash, role, status)
VALUES (
  '${encrypt(name)}', 
  '${encrypt(phone)}', 
  '${hashForSearch(phone)}', 
  '${await bcrypt.hash(pin, 10)}', 
  'super_admin', 
  'active'
);
  `);
}
createSuperAdmin();
