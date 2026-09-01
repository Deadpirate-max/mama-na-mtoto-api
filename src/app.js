const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./routes/authRoutes");
const mothersRoutes = require("./routes/mothersRoutes");
const alertsRoutes = require("./routes/alertsRoutes");
const nursesRoutes = require("./routes/nursesRoutes");
const registrationsRoutes = require("./routes/registrationsRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();

// ── Security & parsing (must come before routes) ──────────────────────────────
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Health checks ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Mama na Mtoto+ API is running and connected to the DB!",
  });
});

app.get("/health", (_req, res) => {
  res
    .status(200)
    .json({
      success: true,
      data: { status: "healthy", service: "Mama na Mtoto+ API" },
    });
});

// ── API Routes (all under /api prefix) ───────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/mothers", mothersRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/nurses", nursesRoutes);
app.use("/api/registrations", registrationsRoutes);
app.use("/api/admin", adminRoutes);

// ── Error handling (must be last) ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
