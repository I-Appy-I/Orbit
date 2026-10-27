const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const Block = require("../model/blockModel");
const bcrypt = require("bcrypt");
const path = require("path");
const { generateToken } = require("../config/generateToken");
const { safeDeleteFile, profilePicsDir } = require("../middleware/uploadMiddleware");
const { getGroupAdminIds, isGroupAdmin } = require("../utils/groupAdmins");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

module.exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || typeof username !== "string" || username.trim().length < 4 || username.trim().length > 20) {
      return res.status(400).json({ msg: "Username must be between 4 and 20 characters", status: false });
    }

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ msg: "Please provide a valid email address", status: false });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters", status: false });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const usernameCheck = await User.findOne({ username: cleanUsername });
    if (usernameCheck) {
      return res.status(409).json({ msg: "The username is already used", status: false });
    }

    const emailCheck = await User.findOne({ email: cleanEmail });
    if (emailCheck) {
      return res.status(409).json({ msg: "The email is already used", status: false });
    }

    const profilePicUrl = req.file ? req.file.filename : "default.svg";
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      profilePic: profilePicUrl,
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      status: true,
      msg: "Registration successful!",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        isAdmin: user.isAdmin,
        token,
      },
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ msg: "Username and password are required", status: false });
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ msg: "Incorrect username or password", status: false });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ msg: "Incorrect username or password", status: false });
    }

    return res.status(200).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
      status: true,
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.getCurrentUser = async (req, res) => {
  return res.status(200).json({
    user: {
      _id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      profilePic: req.user.profilePic,
      isAdmin: req.user.isAdmin,
    },
  });
};

module.exports.getAllUsers = async (req, res, next) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const keyword = search
      ? {
          $or: [
            { username: { $regex: escapeRegex(search), $options: "i" } },
            { email: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {};

    const users = await User.find(keyword)
      .find({ _id: { $ne: req.user._id } })
      .select("username profilePic");

    const relationships = await Block.find({
      $or: [
        { blocker: req.user._id, blockedUser: { $in: users.map((user) => user._id) } },
        { blockedUser: req.user._id, blocker: { $in: users.map((user) => user._id) } },
      ],
    }).select("blocker blockedUser");
    const blockedByMe = new Set(relationships
      .filter((relationship) => relationship.blocker.toString() === req.user._id.toString())
      .map((relationship) => relationship.blockedUser.toString()));
    const blockedMe = new Set(relationships
      .filter((relationship) => relationship.blockedUser.toString() === req.user._id.toString())
      .map((relationship) => relationship.blocker.toString()));

    return res.status(200).send(users.map((user) => ({
      ...user.toObject(),
      blockedByMe: blockedByMe.has(user._id.toString()),
      blockedMe: blockedMe.has(user._id.toString()),
    })));
  } catch (e) {
    return next(e);
  }
};

module.exports.renameUser = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const { newUsername } = req.body;

    if (!newUsername || typeof newUsername !== "string" || newUsername.trim().length < 4 || newUsername.trim().length > 20) {
      return res.status(400).json({ msg: "Username must be between 4 and 20 characters", status: false });
    }

    const cleanUsername = newUsername.trim();
    const usernameCheck = await User.findOne({ username: cleanUsername, _id: { $ne: targetUserId } });
    if (usernameCheck) {
      return res.status(409).json({ msg: "The username is already used", status: false });
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { username: cleanUsername },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const io = req.app.get("io");
    if (io) {
      try {
        const chats = await Chat.find({ users: targetUserId }).select("users");
        const relevantUserIds = new Set();
        relevantUserIds.add(String(targetUserId));
        for (const chat of chats) {
          if (Array.isArray(chat.users)) {
            for (const participantId of chat.users) {
              relevantUserIds.add(String(participantId));
            }
          }
        }

        const payload = {
          userId: String(updatedUser._id),
          username: updatedUser.username,
        };

        for (const userId of relevantUserIds) {
          io.to(userId).emit("user updated", payload);
        }
      } catch (notifyErr) {
        // Notification failure should not fail the user rename
      }
    }

    return res.status(200).json({
      status: true,
      updatedUser: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        profilePic: updatedUser.profilePic,
        isAdmin: updatedUser.isAdmin,
        token: generateToken(updatedUser._id),
      },
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.emailUpdate = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const { newEmail } = req.body;

    if (!newEmail || typeof newEmail !== "string" || !EMAIL_REGEX.test(newEmail.trim())) {
      return res.status(400).json({ msg: "Please provide a valid email address", status: false });
    }

    const cleanEmail = newEmail.trim().toLowerCase();

    // Check if new email is identical to current email
    if (cleanEmail === (req.user.email || "").toLowerCase()) {
      return res.status(400).json({ msg: "New email cannot be the same as your current email", status: false });
    }

    const emailCheck = await User.findOne({ email: cleanEmail, _id: { $ne: targetUserId } });
    if (emailCheck) {
      return res.status(409).json({ msg: "The email is already used", status: false });
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { email: cleanEmail },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = generateToken(updatedUser._id);
    const userPayload = {
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      profilePic: updatedUser.profilePic,
      isAdmin: updatedUser.isAdmin,
      token,
    };

    return res.status(200).json({
      status: true,
      msg: "Email updated successfully!",
      user: userPayload,
      updatedUser: userPayload,
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.profilePicUpdate = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const profilePicUrl = req.file ? req.file.filename : "default.svg";

    const existingUser = await User.findById(targetUserId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Safely delete previous custom profile picture if not default
    if (existingUser.profilePic && existingUser.profilePic !== "default.svg" && req.file) {
      safeDeleteFile(path.join(profilePicsDir, existingUser.profilePic));
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { profilePic: profilePicUrl },
      { new: true }
    ).select("-password");

    return res.status(200).json({
      status: true,
      updatedUser: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        profilePic: updatedUser.profilePic,
        isAdmin: updatedUser.isAdmin,
        token: generateToken(updatedUser._id),
      },
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.passwordUpdate = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ msg: "Both old and new passwords are required", status: false });
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ msg: "New password must be at least 6 characters", status: false });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ msg: "Incorrect password", status: false });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(targetUserId, { password: hashedPassword });

    return res.status(200).json({ status: true });
  } catch (e) {
    return next(e);
  }
};

module.exports.deleteProfile = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Safely delete profile picture if custom
    if (user.profilePic && user.profilePic !== "default.svg") {
      safeDeleteFile(path.join(profilePicsDir, user.profilePic));
    }

    // Find all chats this user was part of
    const allUserChats = await Chat.find({ users: targetUserId });

    // Handle direct (1-on-1) chats: delete direct chat and its messages
    const directChats = allUserChats.filter((c) => !c.isGroupChat);
    const directChatIds = directChats.map((c) => c._id);
    if (directChatIds.length > 0) {
      await Messages.deleteMany({ chat: { $in: directChatIds } });
      await Chat.deleteMany({ _id: { $in: directChatIds } });
    }

    // Handle group chats: preserve chat and messages for surviving participants
    const groupChats = allUserChats.filter((c) => c.isGroupChat);
    for (const chat of groupChats) {
      const remainingUsers = chat.users.filter(
        (member) => member.toString() !== targetUserId.toString()
      );
      const remainingAdmins = getGroupAdminIds(chat).filter(
        (id) => id !== targetUserId.toString()
      );

      // If no members remain, or sole admin deleted and no admins remain: dissolve group
      if (remainingUsers.length === 0 || (isGroupAdmin(chat, targetUserId) && remainingAdmins.length === 0)) {
        if (chat.groupPic && chat.groupPic !== "default-group.svg") {
          safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
        }
        await Messages.deleteMany({ chat: chat._id });
        await Chat.deleteOne({ _id: chat._id });
      } else {
        // Group survives: remove deleted user, preserve existing messages
        chat.users = remainingUsers;
        chat.groupAdmins = remainingAdmins;
        if (!remainingAdmins.some((id) => id === String(chat.groupAdmin))) {
          chat.groupAdmin = remainingAdmins[0];
        }
        await chat.save();
      }
    }

    // Clean up all block relationships involving this user
    await Block.deleteMany({
      $or: [{ blocker: targetUserId }, { blockedUser: targetUserId }],
    });

    // Finally delete the user document
    await User.deleteOne({ _id: targetUserId });

    return res.status(200).json({ status: true });
  } catch (e) {
    return next(e);
  }
};
