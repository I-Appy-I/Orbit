const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = function () {};
  buffer.SlowBuffer.prototype = Buffer.prototype;
}

require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const socketio = require("socket.io");
const app = require("./app");
const { initializeSocket } = require("./socket");

const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/chat";

const server = http.createServer(app);

const io = socketio(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  },
});

initializeSocket(io);

let isShuttingDown = false;

async function start() {
  try {
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

  // Close HTTP server to stop accepting new requests
  server.close(() => {
    console.log("HTTP server closed.");
  });

  // Close Socket.IO server
  io.close(() => {
    console.log("Socket.IO server closed.");
  });

  // Close MongoDB connection
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