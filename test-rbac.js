const axios = require("axios");
const jwt = require("jsonwebtoken");

// 👇 HARDCODE THE SECRET HERE (match what's in .env or the fallback)
const JWT_SECRET = process.env.JWT_SECRET || "mama_na_mtoto_secret_2026";
console.log(`🔑 chvAuth loaded | JWT_SECRET length: ${JWT_SECRET.length}`);

// Use the real nurse ID from your DB
const realNurseId = 4;

const token = jwt.sign(
  { nurseId: realNurseId, role: "nurse", facility_code: "KNH-001" },
  JWT_SECRET,
);

// The foreign mother ID
const foreignMotherId = "0b69eedb-5c56-4ab5-b552-989d644b2e20";

async function testCrossFacilityAccess() {
  console.log("=========================================");
  console.log("🔒 RBAC SECURITY TEST");
  console.log("=========================================\n");

  try {
    const res = await axios.get(
      `http://localhost:5000/api/mothers/id/${foreignMotherId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log("❌ FAIL: Security Breach!");
  } catch (err) {
    console.log("--- Debug Info ---");
    console.log("HTTP Status:", err.response?.status);
    console.log("HTTP Body:", JSON.stringify(err.response?.data));

    if (err.response?.status === 403) {
      console.log("\n✅ PASS: Access Denied (403 Forbidden).");
    } else if (err.response?.status === 401) {
      console.log(
        "\n⚠️ Still 401. Check if the server terminal shows the JWT_SECRET debug log.",
      );
    }
  }
}

testCrossFacilityAccess();
