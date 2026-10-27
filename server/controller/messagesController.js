const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Messages = require("../model/messageModel");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Block = require("../model/blockModel");

module.exports.getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    // Verify chat exists and authenticated user is a participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const isMember = chat.users.some(
      (userId) => userId.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "Not authorized to access messages for this chat" });
    }

    // Pagination parameters
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { chat: chatId };
    if (req.query.before) {
      const beforeDate = new Date(req.query.before);
      if (!isNaN(beforeDate.getTime())) {
        filter.createdAt = { $lt: beforeDate };
      }
    }

    const totalMessages = await Messages.countDocuments({ chat: chatId });
    const totalPages = Math.ceil(totalMessages / limit);

    // Fetch messages sorted newest first for pagination, then reverse to chronological order
    const rawMessages = await Messages.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "username profilePic")
      .populate({
        path: "chat",
        populate: { path: "latestMessage", populate: { path: "sender", select: "username profilePic" } },
      });

    const messages = rawMessages.reverse();

    // Set pagination metadata headers
    res.setHeader("X-Total-Count", totalMessages);
    res.setHeader("X-Page", page);
    res.setHeader("X-Total-Pages", totalPages);
    res.setHeader("X-Limit", limit);

    // Backward-compatible response: array by default, or object if requested
    if (req.query.paginated === "true") {
      return res.json({
        messages,
        totalMessages,
        page,
        totalPages,
        hasNextPage: page < totalPages,
      });
    }

    return res.json(messages);
  } catch (error) {
    return next(error);
  }
};

module.exports.addMessage = async (req, res, next) => {
  try {
    const { chatId, content } = req.body;
    const attachmentUrl = req.file ? req.file.filename : "";

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (!trimmedContent && !attachmentUrl) {
      return res.status(400).json({ message: "Message must contain either text content or an attachment" });
    }

    // Verify chat exists and sender is an authenticated member
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const isMember = chat.users.some(
      (userId) => userId.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "Not authorized to send messages to this chat" });
    }

    if (!chat.isGroupChat) {
      const peer = chat.users.find((memberId) => memberId.toString() !== req.user._id.toString());
      const blocked = peer && await Block.exists({
        $or: [
          { blocker: req.user._id, blockedUser: peer },
          { blocker: peer, blockedUser: req.user._id },
        ],
      });
      if (blocked) {
        return res.status(403).json({
          message: "You can't message this contact while direct messaging is blocked.",
          code: "DIRECT_MESSAGE_BLOCKED",
        });
      }
    }

    // Sender is strictly taken from verified req.user, never trusted from client
    const newMessage = {
      sender: req.user._id,
      content: trimmedContent,
      chat: chatId,
      attachment: attachmentUrl,
    };

    let message = await Messages.create(newMessage);

    await Chat.findByIdAndUpdate(
      chatId,
      { latestMessage: message._id },
      { new: true }
    );

    message = await Messages.findById(message._id)
      .populate("sender", "username profilePic")
      .populate({
        path: "chat",
        populate: [
          { path: "users", select: "username profilePic" },
          { path: "latestMessage", populate: { path: "sender", select: "username profilePic" } },
        ],
      });

    // The REST response is the authoritative acknowledgement for the sender.
    res.status(201).json(message);

    const io = req.app.get("io");
    if (io) {
      const room = chatId.toString();
      io.to(room).emit("message recieved", message);
      const updatedChat = message.chat;
      for (const participant of chat.users) {
        io.to(participant.toString()).emit("contacts", updatedChat);
      }
    }

    return undefined;
  } catch (error) {
    return next(error);
  }
};

module.exports.getAttachment = async (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ message: "Invalid filename" });
    }

    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || safeFilename.includes("..")) {
      return res.status(400).json({ message: "Invalid filename" });
    }

    const attachmentsDir = path.resolve(__dirname, "../images/attachments");
    const filePath = path.join(attachmentsDir, safeFilename);

    // Path traversal check
    if (!filePath.startsWith(attachmentsDir) || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    // Verify chat membership
    const message = await Messages.findOne({ attachment: safeFilename }).populate("chat");
    if (!message || !message.chat) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    const isMember = message.chat.users.some(
      (userId) => userId.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: "Not authorized to access this attachment" });
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.sendFile(filePath);
  } catch (error) {
    return next(error);
  }
};
