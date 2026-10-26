const mongoose = require("mongoose");
const path = require("path");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const Block = require("../model/blockModel");
const { safeDeleteFile, profilePicsDir } = require("../middleware/uploadMiddleware");
const { isGroupAdmin, normalizeGroupAdmins } = require("../utils/groupAdmins");

async function populatedChat(chatId) {
  return Chat.findById(chatId)
    .populate("users", "username profilePic email")
    .populate("groupAdmin", "username profilePic email")
    .populate("groupAdmins", "username profilePic email")
    .populate({ path: "latestMessage", populate: { path: "sender", select: "username profilePic" } });
}

function publishChatUpdate(req, chat, removedUserIds = []) {
  const io = req.app.get("io");
  if (!io || !chat) return;
  const removed = new Set(removedUserIds.map((id) => new mongoose.Types.ObjectId(id).toString()));
  for (const participant of chat.users || []) {
    const participantId = String(participant._id || participant);
    if (!removed.has(participantId)) io.to(participantId).emit("contacts", chat);
  }
  for (const userId of removed) {
    io.in(userId).socketsLeave(String(chat._id));
    io.to(userId).emit("chat removed", { chatId: String(chat._id) });
  }
}

function publishChatRemoval(req, chat) {
  const io = req.app.get("io");
  if (!io || !chat) return;
  for (const participant of chat.users || []) {
    const userId = String(participant._id || participant);
    io.in(userId).socketsLeave(String(chat._id));
    io.to(userId).emit("chat removed", { chatId: String(chat._id) });
  }
}

async function saveNormalizedChat(chat) {
  await normalizeGroupAdmins(chat);
  if (chat.isGroupChat) {
    chat.groupAdmins = chat.groupAdmins.filter((adminId) => chat.users.some((member) => String(member) === String(adminId)));
    if (!chat.groupAdmins.length && chat.groupAdmin && chat.users.some((member) => String(member) === String(chat.groupAdmin._id || chat.groupAdmin))) {
      chat.groupAdmins = [chat.groupAdmin._id || chat.groupAdmin];
    }
    if (chat.groupAdmin && !chat.users.some((member) => String(member) === String(chat.groupAdmin._id || chat.groupAdmin))) {
      chat.groupAdmin = chat.groupAdmins[0];
    }
    if (chat.groupAdmins.length) chat.groupAdmin = chat.groupAdmins[0];
    await chat.save();
  }
  return populatedChat(chat._id);
}

const directPairQuery = (firstUserId, secondUserId) => ({
  isGroupChat: false,
  users: { $all: [firstUserId, secondUserId], $size: 2 },
});

async function findOrCreateDirectChat(req, currentUser, peerUser) {
  const currentUserId = String(currentUser._id);
  const peerUserId = String(peerUser._id);
  const orderedIds = [currentUserId, peerUserId].sort();
  const directKey = orderedIds.join(":");
  const query = directPairQuery(currentUser._id, peerUser._id);

  let chats = await Chat.find(query).select("+directKey").sort({ createdAt: 1, _id: 1 });
  if (!chats.length) {
    const blocked = await Block.exists({ $or: [
      { blocker: currentUser._id, blockedUser: peerUser._id },
      { blocker: peerUser._id, blockedUser: currentUser._id },
    ] });
    if (blocked) return { blocked: true };

    try {
      await Chat.create({
        chatName: peerUser.username,
        isGroupChat: false,
        groupPic: "",
        users: [currentUser._id, peerUser._id],
        directKey,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Another request created the same canonical direct conversation.
    }
    chats = await Chat.find(query).select("+directKey").sort({ createdAt: 1, _id: 1 });
    if (!chats.length) {
      const keyedChat = await Chat.findOne({ directKey }).select("+directKey");
      if (keyedChat) chats = [keyedChat];
    }
  }

  if (!chats.length) throw Object.assign(new Error("Unable to open direct conversation"), { status: 409 });

  let canonical = chats.find((chat) => chat.directKey === directKey) || chats[0];
  if (canonical.directKey && canonical.directKey !== directKey) {
    throw Object.assign(new Error("Direct conversation key conflicts with its participants"), { status: 409 });
  }
  if (!canonical.directKey) {
    try {
      await Chat.updateOne({ _id: canonical._id }, { $set: { directKey } }, { timestamps: false });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    chats = await Chat.find(query).select("+directKey").sort({ createdAt: 1, _id: 1 });
    canonical = chats.find((chat) => chat.directKey === directKey) || canonical;
  }

  const duplicates = chats.filter((chat) => String(chat._id) !== String(canonical._id));
  for (const duplicate of duplicates) {
    await Messages.updateMany({ chat: duplicate._id }, { $set: { chat: canonical._id } });
  }

  if (duplicates.length) {
    const latestMessage = await Messages.findOne({ chat: canonical._id }).sort({ createdAt: -1, _id: -1 }).select("_id");
    const latestChatUpdate = chats.reduce((latest, chat) =>
      new Date(chat.updatedAt || 0) > new Date(latest || 0) ? chat.updatedAt : latest, canonical.updatedAt);
    await Chat.updateOne({ _id: canonical._id }, {
      $set: { directKey, latestMessage: latestMessage?._id || null, updatedAt: latestChatUpdate },
    }, { timestamps: false });
    for (const duplicate of duplicates) {
      await Chat.deleteOne({ _id: duplicate._id });
      publishChatRemoval(req, duplicate);
    }
  }

  return populatedChat(canonical._id);
}

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

    const chat = await findOrCreateDirectChat(req, req.user, targetUser);
    if (chat.blocked) {
      return res.status(403).json({ message: "Direct messaging is unavailable for this contact" });
    }
    return res.status(200).json(chat);
  } catch (error) {
    return next(error);
  }
};

module.exports.fetchChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({ users: { $elemMatch: { $eq: req.user._id } } })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("groupAdmins", "-password")
      .populate({
        path: "latestMessage",
        populate: { path: "sender", select: "username profilePic email" },
      })
      .sort({ updatedAt: -1 });

    // Legacy groups are returned using the new array contract immediately;
    // their stored groupAdmin remains intact and is lazily persisted on the
    // next group mutation.
    chats.forEach((chat) => {
      if (chat.isGroupChat && !chat.groupAdmins.length && chat.groupAdmin &&
          chat.users.some((member) => member._id.toString() === chat.groupAdmin._id.toString())) {
        chat.groupAdmins = [chat.groupAdmin];
      }
    });

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
      groupAdmins: [req.user._id],
    });

    const fullGroupChat = await Chat.findById(groupChat._id)
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("groupAdmins", "-password");
    publishChatUpdate(req, fullGroupChat);

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
    if (!isGroupAdmin(chat, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can rename the group" });
    }

    chat.chatName = chatName.trim();
    const updatedChat = await saveNormalizedChat(chat);
    publishChatUpdate(req, updatedChat);

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
    if (!isGroupAdmin(chat, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can update the group picture" });
    }

    const groupPicUrl = req.file ? req.file.filename : "default-group.svg";

    // Safely delete previous custom group picture
    if (chat.groupPic && chat.groupPic !== "default-group.svg" && req.file) {
      safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
    }

    chat.groupPic = groupPicUrl;
    const updatedChat = await saveNormalizedChat(chat);
    publishChatUpdate(req, updatedChat);

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
    const isAdmin = isGroupAdmin(chat, req.user._id);
    const isSelf = userId.toString() === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: "Only group admins can remove other members" });
    }

    await normalizeGroupAdmins(chat);
    if (chat.users.length === 1 && !isGroupAdmin(chat, userId)) {
      return res.status(403).json({ message: "Only the administrator can close the final group membership" });
    }
    if (isGroupAdmin(chat, userId) && chat.groupAdmins.length <= 1) {
      return res.status(400).json({ message: "A group must have at least one administrator" });
    }
    chat.users = chat.users.filter((member) => member.toString() !== userId.toString());
    chat.groupAdmins = chat.groupAdmins.filter((adminId) => adminId.toString() !== userId.toString());
    const updatedChat = await saveNormalizedChat(chat);
    publishChatUpdate(req, updatedChat, [userId]);

    return res.status(200).json(updatedChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.exitGroup = async (req, res, next) => {
  try {
    const { chatId } = req.body;
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid or missing chatId" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!chat.isGroupChat) return res.status(400).json({ message: "Operation only valid on group chats" });

    const userId = String(req.user._id);
    if (!chat.users.some((member) => String(member) === userId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    await normalizeGroupAdmins(chat);
    if (chat.users.length === 1 && !isGroupAdmin(chat, userId)) {
      return res.status(403).json({ message: "Only the administrator can close the final group membership" });
    }
    if (isGroupAdmin(chat, userId) && chat.groupAdmins.length <= 1) {
      if (chat.users.length > 1) {
        return res.status(400).json({ message: "Promote another administrator before leaving this group" });
      }
      // The sole administrator is the final member; remove the group and its
      // messages rather than retaining an inaccessible orphaned conversation.
      if (chat.groupPic && chat.groupPic !== "default-group.svg") {
        safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
      }
      await Messages.deleteMany({ chat: chat._id });
      await Chat.deleteOne({ _id: chat._id });
      publishChatRemoval(req, chat);
      return res.status(200).json({ status: true, chatId: String(chat._id), deleted: true });
    }

    chat.users = chat.users.filter((member) => String(member) !== userId);
    chat.groupAdmins = chat.groupAdmins.filter((adminId) => String(adminId) !== userId);
    const updatedChat = await saveNormalizedChat(chat);
    publishChatUpdate(req, updatedChat, [userId]);
    return res.status(200).json({ status: true, chatId: String(chat._id) });
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
    if (!isGroupAdmin(chat, req.user._id)) {
      return res.status(403).json({ message: "Only group admins can add new members" });
    }

    // Check if user already in group
    const alreadyMember = chat.users.some((u) => u.toString() === userId.toString());
    if (alreadyMember) {
      return res.status(400).json({ message: "User is already a member of this group" });
    }

    chat.users.push(userId);
    const updatedChat = await saveNormalizedChat(chat);
    publishChatUpdate(req, updatedChat);

    return res.status(200).json(updatedChat);
  } catch (error) {
    return next(error);
  }
};

module.exports.updateGroupAdmin = async (req, res, next) => {
  try {
    const { chatId, userId, action } = req.body;
    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(userId) || !["promote", "demote"].includes(action)) {
      return res.status(400).json({ message: "Invalid group administrator request" });
    }
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isGroupChat) return res.status(404).json({ message: "Group chat not found" });
    await normalizeGroupAdmins(chat);
    if (!isGroupAdmin(chat, req.user._id)) return res.status(403).json({ message: "Only group administrators can manage administrators" });
    if (!chat.users.some((member) => member.toString() === userId)) return res.status(400).json({ message: "Only group participants can be administrators" });

    const alreadyAdmin = isGroupAdmin(chat, userId);
    if (action === "promote" && !alreadyAdmin) chat.groupAdmins.push(userId);
    if (action === "demote" && alreadyAdmin) {
      if (chat.groupAdmins.length <= 1) return res.status(400).json({ message: "A group must have at least one administrator" });
      chat.groupAdmins = chat.groupAdmins.filter((adminId) => adminId.toString() !== userId);
    }
    const updatedChat = await saveNormalizedChat(chat);
    publishChatUpdate(req, updatedChat);
    return res.status(200).json(updatedChat);
  } catch (error) { return next(error); }
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
      if (!isGroupAdmin(chat, req.user._id)) {
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
    // Notify all participants so stale sidebar entries are removed immediately.
    // Previously only group chats broadcast removal, leaving direct-chat
    // participants with orphaned entries that caused duplicate conversations
    // after a new chat was created for the same pair.
    publishChatRemoval(req, chat);

    return res.status(200).json({ status: true, message: "Chat deleted successfully" });
  } catch (error) {
    return next(error);
  }
};
