const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");
const mothersRoutes = require("./routes/mothersRoutes");
const alertsRoutes = require("./routes/alertsRoutes");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests from this IP. Please try again later.",
    },
  },
});
app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, data: { status: "healthy", service: "Mama na Mtoto+ API" } });
});

app.use("/auth", authRoutes);
app.use("/mothers", mothersRoutes);
app.use("/alerts", alertsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

// Root route — simple health check
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: "Mama na Mtoto+ API is running and connected to the DB!" 
  });
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: { 
      code: "NOT_FOUND", 
      message: "Route not found" 
    } 
  });
});
