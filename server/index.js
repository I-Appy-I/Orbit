const path = require("path");

// 1. Load environment variables before any other imports or operations
require("dotenv").config({ path: path.join(__dirname, ".env") });

// 2. Configure DNS resolver immediately after environment loading, before any database connection
const { configureDNS, verifyMongoSrvLookup } = require("./utils/dnsConfig");
configureDNS();

// Polyfill SlowBuffer if missing in modern Node versions
const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = function () {};
  buffer.SlowBuffer.prototype = Buffer.prototype;
}

const http = require("http");
const mongoose = require("mongoose");
const socketio = require("socket.io");
const app = require("./app");
const { initializeSocket } = require("./socket");

// Suppress Mongoose strictQuery deprecation warning while preserving Mongoose 6 query filtering behavior
mongoose.set("strictQuery", true);

const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGODB_URL;

// Startup configuration validation
if (process.env.NODE_ENV !== "test") {
  if (!MONGO_URL) {
    console.error("FATAL: MONGODB_URL is not defined in the environment.");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    if (process.env.NODE_ENV === "production") {
      console.error("FATAL: JWT_SECRET must be defined and at least 16 characters in production.");
      process.exit(1);
    } else {
      console.warn("WARNING: JWT_SECRET is missing or short. Using a fallback for local development only.");
    }
  }
}

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigins = [...new Set([...configuredOrigins, ...defaultOrigins])];

const server = http.createServer(app);

const io = socketio(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation on socket connection"));
    },
    credentials: true,
  },
});

app.set("io", io);
initializeSocket(io);

let isShuttingDown = false;

async function start() {
  try {
    // Verify DNS SRV resolution diagnostic before calling Mongoose connect
    await verifyMongoSrvLookup(MONGO_URL);

    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("DB connected successfully");

    server.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    console.log("HTTP server closed.");
  });

  io.close(() => {
    console.log("Socket.IO server closed.");
  });

  try {
    await mongoose.connection.close(false);
    console.log("MongoDB connection closed.");
    process.exit(0);
  } catch (err) {
    console.error("Error closing MongoDB connection:", err.message);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

if (process.env.NODE_ENV !== "test") {
  start();
}

module.exports = { app, server, io, start, gracefulShutdown };
