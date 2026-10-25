const mongoose = require("mongoose");
const path = require("path");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const { safeDeleteFile, profilePicsDir } = require("../middleware/uploadMiddleware");

module.exports.accessChat = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid or missing userId parameter" });
    }

    if (userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot create a direct chat with yourself" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let isChat = await Chat.find({
      isGroupChat: false,
      $and: [
        { users: { $elemMatch: { $eq: req.user._id } } },
        { users: { $elemMatch: { $eq: userId } } },
      ],
    })
      .populate("users", "-password")
      .populate({
        path: "latestMessage",
        populate: { path: "sender", select: "username profilePic email" },
      });

    if (isChat.length > 0) {
      return res.status(200).json(isChat[0]);
    }

    const chatData = {
      chatName: targetUser.username,
      isGroupChat: false,
      groupPic: "",
      users: [req.user._id, userId],
    };

    const createdChat = await Chat.create(chatData);
    const fullChat = await Chat.findById(createdChat._id)
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    return res.status(200).json(fullChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.fetchChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({ users: { $elemMatch: { $eq: req.user._id } } })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate({
        path: "latestMessage",
        populate: { path: "sender", select: "username profilePic email" },
      })
      .sort({ updatedAt: -1 });

    return res.status(200).json(chats);
  } catch (error) {
    return next(error);
  }
};

module.exports.createGroupChat = async (req, res, next) => {
  try {
    const { name, users: rawUsers } = req.body;

    if (!rawUsers || !name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    let users;
    if (typeof rawUsers === "string") {
      try {
        users = JSON.parse(rawUsers);
      } catch (e) {
        return res.status(400).json({ message: "Invalid users format" });
      }
    } else if (Array.isArray(rawUsers)) {
      users = rawUsers;
    } else {
      return res.status(400).json({ message: "Invalid users format" });
    }

    if (!Array.isArray(users) || users.length < 1) {
      return res.status(400).json({ message: "More than 1 user is required to form a group chat" });
    }

    // Validate all user IDs
    for (const u of users) {
      const uId = u._id || u;
      if (!mongoose.Types.ObjectId.isValid(uId)) {
        return res.status(400).json({ message: `Invalid user ID: ${uId}` });
      }
    }

    const userIds = users.map((u) => u._id || u);
    // Add current user if not already present
    if (!userIds.some((id) => id.toString() === req.user._id.toString())) {
      userIds.push(req.user._id);
    }

    const groupChat = await Chat.create({
      chatName: name.trim(),
      users: userIds,
      isGroupChat: true,
      groupPic: "default-group.svg",
      groupAdmin: req.user._id,
    });

    const fullGroupChat = await Chat.findById(groupChat._id)
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    return res.status(201).json(fullGroupChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.renameGroup = async (req, res, next) => {
  try {
    const { chatId, chatName } = req.body;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    if (!chatName || typeof chatName !== "string" || !chatName.trim()) {
      return res.status(400).json({ message: "New group name is required" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (!chat.isGroupChat) {
      return res.status(400).json({ message: "Cannot rename a 1-on-1 chat" });
    }

    // Only group admin can rename the group
    if (chat.groupAdmin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only group admins can rename the group" });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { chatName: chatName.trim() },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    return res.status(200).json(updatedChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.groupPicUpdate = async (req, res, next) => {
  try {
    const { chatId } = req.body;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (!chat.isGroupChat) {
      return res.status(400).json({ message: "Cannot set a group pic for a 1-on-1 chat" });
    }

    // Only group admin can update group picture
    if (chat.groupAdmin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only group admins can update the group picture" });
    }

    const groupPicUrl = req.file ? req.file.filename : "default-group.svg";

    // Safely delete previous custom group picture
    if (chat.groupPic && chat.groupPic !== "default-group.svg" && req.file) {
      safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { groupPic: groupPicUrl },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    return res.status(200).json(updatedChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.removeFromGroup = async (req, res, next) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid or missing userId" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (!chat.isGroupChat) {
      return res.status(400).json({ message: "Operation only valid on group chats" });
    }

    // Authorization: User must either be group admin OR removing themselves (leaving)
    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString();
    const isSelf = userId.toString() === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: "Only group admins can remove other members" });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { users: userId } },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    return res.status(200).json(updatedChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.addToGroup = async (req, res, next) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid or missing userId" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (!chat.isGroupChat) {
      return res.status(400).json({ message: "Operation only valid on group chats" });
    }

    // Only group admin can add members
    if (chat.groupAdmin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only group admins can add new members" });
    }

    // Check if user already in group
    const alreadyMember = chat.users.some((u) => u.toString() === userId.toString());
    if (alreadyMember) {
      return res.status(400).json({ message: "User is already a member of this group" });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { users: userId } },
      { new: true }
    )
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    return res.status(200).json(updatedChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.deleteChat = async (req, res, next) => {
  try {
    const { chatId } = req.body;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Authorization: If group chat, only admin can delete. If direct chat, participant can delete.
    if (chat.isGroupChat) {
      if (chat.groupAdmin.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Only group admins can delete the group chat" });
      }
    } else {
      const isParticipant = chat.users.some(
        (u) => u.toString() === req.user._id.toString()
      );
      if (!isParticipant) {
        return res.status(403).json({ message: "Not authorized to delete this chat" });
      }
    }

    // Safely delete group picture if custom
    if (chat.groupPic && chat.groupPic !== "default-group.svg") {
      safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
    }

    await Messages.deleteMany({ chat: chatId });
    await Chat.deleteOne({ _id: chatId });

    return res.status(200).json({ status: true, message: "Chat deleted successfully" });
  } catch (error) {
    return next(error);
  }
};