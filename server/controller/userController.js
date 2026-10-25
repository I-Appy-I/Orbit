const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const bcrypt = require("bcrypt");
const path = require("path");
const { generateToken } = require("../config/generateToken");
const { safeDeleteFile, profilePicsDir } = require("../middleware/uploadMiddleware");

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

    return res.status(201).json({
      status: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
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

module.exports.getAllUsers = async (req, res, next) => {
  try {
    const keyword = req.query.search
      ? { username: { $regex: escapeRegex(req.query.search.trim()), $options: "i" } }
      : {};

    const users = await User.find(keyword)
      .find({ _id: { $ne: req.user._id } })
      .select("-password");

    return res.status(200).send(users);
  } catch (e) {
    return next(e);
  }
};

module.exports.renameUser = async (req, res, next) => {
  try {
    // Strictly enforce modifying the authenticated user
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
    // Strictly enforce modifying the authenticated user
    const targetUserId = req.user._id;
    const { newEmail } = req.body;

    if (!newEmail || typeof newEmail !== "string" || !EMAIL_REGEX.test(newEmail.trim())) {
      return res.status(400).json({ msg: "Please provide a valid email address", status: false });
    }

    const cleanEmail = newEmail.trim().toLowerCase();
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

module.exports.profilePicUpdate = async (req, res, next) => {
  try {
    // Strictly enforce modifying the authenticated user
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
    // Strictly enforce modifying the authenticated user
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
    // Strictly enforce deleting the authenticated user
    const targetUserId = req.user._id;
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Safely delete profile picture if custom
    if (user.profilePic && user.profilePic !== "default.svg") {
      safeDeleteFile(path.join(profilePicsDir, user.profilePic));
    }

    // Delete group pics for chats where this user was group admin
    const adminChats = await Chat.find({ groupAdmin: targetUserId });
    for (const chat of adminChats) {
      if (chat.groupPic && chat.groupPic !== "default-group.svg") {
        safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
      }
    }

    // Find all chats this user was part of
    const allUserChats = await Chat.find({ users: targetUserId });
    const chatIds = allUserChats.map((c) => c._id);

    // Delete messages in those chats
    await Messages.deleteMany({ chat: { $in: chatIds } });

    // Delete chats where user was admin
    await Chat.deleteMany({ groupAdmin: targetUserId });

    // Remove user from other group chats
    await Chat.updateMany(
      { users: targetUserId, isGroupChat: true },
      { $pull: { users: targetUserId } }
    );

    // Delete direct chats involving this user
    await Chat.deleteMany({ users: targetUserId, isGroupChat: false });

    // Finally delete the user document
    await User.deleteOne({ _id: targetUserId });

    return res.status(200).json({ status: true });
  } catch (e) {
    return next(e);
  }
};