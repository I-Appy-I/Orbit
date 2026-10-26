const dns = require("node:dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

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

const PORT = process.env.PORT;
const MONGO_URL = process.env.MONGODB_URL;

const server = http.createServer(app);

const io = socketio(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  },
});

// Controllers use this instance to publish events only after their database
// transaction has completed.  Keeping the instance on the Express app also
// makes the HTTP and Socket.IO lifecycles explicit in tests.
app.set("io", io);
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
