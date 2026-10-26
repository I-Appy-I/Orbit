const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("./model/userModel");
const Chat = require("./model/chatModel");

/**
 * Configure and initialize Socket.IO with JWT authentication,
 * room authorization, and secure message broadcasting.
 */
function initializeSocket(io) {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization &&
          socket.handshake.headers.authorization.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.split(" ")[1]
          : null) ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      if (!user.emailVerified) {
        return next(new Error("Authentication error: Email not verified"));
      }

      // Attach verified user to socket instance
      socket.user = user;
      return next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    // Automatically join the user's personal room for direct notifications
    socket.join(userId);
    socket.emit("connected");

    // Backward-compatibility: "setup" event
    socket.on("setup", () => {
      // Always enforce verified user id, never trust any client-supplied id
      socket.join(userId);
      socket.emit("connected");
    });

    // Secure chat room join
    socket.on("join chat", async (room) => {
      try {
        if (!room || !mongoose.Types.ObjectId.isValid(room)) {
          socket.emit("socket_error", { message: "Invalid chat room ID" });
          return;
        }

        const chat = await Chat.findById(room);
        if (!chat) {
          socket.emit("socket_error", { message: "Chat not found" });
          return;
        }

        const isMember = chat.users.some((u) => u.toString() === userId);
        if (!isMember) {
          socket.emit("socket_error", { message: "Not authorized to join this chat" });
          return;
        }

        socket.join(room.toString());
      } catch (err) {
        socket.emit("socket_error", { message: "Failed to join chat room" });
      }
    });

    // Message creation intentionally has no client Socket.IO producer.  The
    // authenticated HTTP endpoint persists the message and then emits the
    // legacy "message recieved" event with that saved document.  Accepting a
    // client-supplied document here would let a client claim a fake success.
    socket.on("new message", () => {
      socket.emit("socket_error", {
        message: "Send messages through the authenticated messages endpoint",
      });
    });

    // Proper disconnect cleanup
    socket.on("disconnect", () => {
      socket.leave(userId);
    });
  });

  return io;
}

module.exports = { initializeSocket };
