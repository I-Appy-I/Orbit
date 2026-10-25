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

    // Secure message broadcast
    socket.on("new message", async (newMessageReceived) => {
      try {
        if (!newMessageReceived) return;

        // Extract chat ID from payload
        const chatId =
          newMessageReceived.chatId ||
          (newMessageReceived.chat && (newMessageReceived.chat._id || newMessageReceived.chat));

        if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
          return;
        }

        // Verify sender authorization for this chat
        const chat = await Chat.findById(chatId);
        if (!chat) return;

        const isMember = chat.users.some((u) => u.toString() === userId);
        if (!isMember) return;

        // Broadcast only to the authorized conversation room (excluding sender)
        socket.to(chatId.toString()).emit("message recieved", newMessageReceived);
      } catch (err) {
        // Silently catch to prevent crashing socket worker
      }
    });

    // Secure contact list update broadcast
    socket.on("contacts", async (chatData) => {
      try {
        if (!chatData) return;
        const chatId = chatData._id || chatData.chatId;

        if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
          const chat = await Chat.findById(chatId);
          if (chat && chat.users.some((u) => u.toString() === userId)) {
            // Broadcast update to the chat room so all active participants see latest message
            socket.to(chatId.toString()).emit("contacts", chatData);
          }
        }
      } catch (err) {
        // Silently catch
      }
    });

    // Proper disconnect cleanup
    socket.on("disconnect", () => {
      socket.leave(userId);
    });
  });

  return io;
}

module.exports = { initializeSocket };
