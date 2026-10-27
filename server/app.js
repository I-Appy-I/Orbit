const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = function () {};
  buffer.SlowBuffer.prototype = Buffer.prototype;
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const multer = require("multer");
const { safeDeleteFile } = require("./middleware/uploadMiddleware");

const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messagesRoute");
const chatRoutes = require("./routes/chatRoutes");
const blockRoutes = require("./routes/blockRoutes");

const app = express();

// Trust reverse proxy (e.g. Nginx, Heroku, Render) if configured or in production
if (process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Security headers with relaxed CORP to allow avatar image embedding across origins
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Dynamic CORS whitelist
const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigins = [...new Set([...configuredOrigins, ...defaultOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, or same-origin server requests)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Body parsing with size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Static images: ONLY public profile pictures are served statically.
// Message attachments are private and served through authenticated route /api/messages/attachment/:filename.
app.use(
  "/images/profile_pictures",
  express.static(path.join(__dirname, "images/profile_pictures"))
);

// API Routes
app.use("/api/auth", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/blocks", blockRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: `Not Found - ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  // Clean up any uploaded file on request failure to prevent orphaned files
  if (req.file && req.file.path) {
    safeDeleteFile(req.file.path);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File size exceeds allowed limit", status: false });
    }
    return res.status(400).json({ message: err.message, status: false });
  }

  if (err.message && err.message.includes("CORS policy violation")) {
    return res.status(403).json({ message: "Origin not allowed by CORS", status: false });
  }

  const statusCode =
    err.status ||
    err.statusCode ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  const isProduction = process.env.NODE_ENV === "production";
  const clientMessage = isProduction && statusCode === 500
    ? "Internal Server Error"
    : err.message || "Internal Server Error";

  return res.status(statusCode).json({
    message: clientMessage,
    status: false,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

module.exports = app;
