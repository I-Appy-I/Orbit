const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = function () {};
  buffer.SlowBuffer.prototype = Buffer.prototype;
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");

const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messagesRoute");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static images
app.use("/images", express.static(path.join(__dirname, "images")));

// Routes
app.use("/api/auth", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: `Not Found - ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File size exceeds allowed limit" });
    }
    return res.status(400).json({ message: err.message });
  }

  const statusCode =
    err.status ||
    err.statusCode ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  return res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    status: false,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

module.exports = app;
