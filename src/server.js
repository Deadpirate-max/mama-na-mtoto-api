require("dotenv").config();

const app = require("./app");
const pool = require("./db/pool");

const PORT = parseInt(process.env.PORT || "3000", 10);

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("[DB] Connected successfully");
  } catch (err) {
    console.error("[DB] Failed to connect:", err.message);
    console.error("[DB] The API will start anyway — database calls will fail until the connection is available.");
  }

  app.listen(PORT, () => {
    console.log(`[Server] Mama na Mtoto+ API running on port ${PORT}`);
  });
}

start();
