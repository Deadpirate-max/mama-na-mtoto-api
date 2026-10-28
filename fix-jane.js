require("dotenv").config();
const { encrypt, hashForSearch } = require("./src/utils/encryption");

const phone = "+254799999999";
const phoneHash = hashForSearch(phone);
const encryptedName = encrypt("Jane");

console.log("\n--- COPY THIS SQL AND RUN IT IN PGADMIN ---\n");
console.log(
  `UPDATE nurses SET name = '${encryptedName}' WHERE phone_hash = '${phoneHash}';`,
);
console.log("\n-------------------------------------------\n");
