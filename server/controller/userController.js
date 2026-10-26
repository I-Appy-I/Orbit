const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const Block = require("../model/blockModel");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const path = require("path");
const { generateToken } = require("../config/generateToken");
const { safeDeleteFile, profilePicsDir } = require("../middleware/uploadMiddleware");
const { getGroupAdminIds, isGroupAdmin } = require("../utils/groupAdmins");
const { sendVerificationEmail } = require("../utils/emailService");

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

    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto.createHash("sha256").update(rawCode).digest("hex");
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      profilePic: profilePicUrl,
      emailVerified: false,
      emailVerificationTokenHash: codeHash,
      emailVerificationExpires: codeExpires,
      emailVerificationAttempts: 0,
      emailVerificationLastSent: new Date(),
    });

    try {
      await sendVerificationEmail({
        to: cleanEmail,
        username: cleanUsername,
        code: rawCode,
      });
    } catch (emailErr) {
      user.emailVerificationLastSent = undefined;
      await user.save();
      console.error("[Auth] Registration succeeded, but verification email sending failed:", emailErr.message);
      return res.status(201).json({
        status: true,
        emailVerified: false,
        emailDeliveryFailed: true,
        email: cleanEmail,
        msg: "Account created, but verification code could not be delivered. Please use the resend code option.",
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePic: user.profilePic,
          isAdmin: user.isAdmin,
          emailVerified: false,
        },
      });
    }

    return res.status(201).json({
      status: true,
      emailVerified: false,
      email: cleanEmail,
      msg: "Registration successful! A 6-digit verification code has been sent to your email.",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        isAdmin: user.isAdmin,
        emailVerified: false,
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

    if (!user.emailVerified) {
      return res.status(403).json({
        msg: "Please verify your email address before logging in.",
        status: false,
        emailVerified: false,
        email: user.email,
      });
    }

    return res.status(200).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
      token: generateToken(user._id),
      status: true,
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.verifyEmail = async (req, res, next) => {
  try {
    const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "");

    // Handle legacy GET link requests
    if (req.method === "GET") {
      const token = req.query.token;
      if (token) {
        return res.redirect(`${clientUrl}/verify-email?legacy=true`);
      }
      return res.redirect(`${clientUrl}/auth`);
    }

    const { email, code, token } = req.body;

    // Legacy token verification if token is provided without code
    if (token && !code) {
      const tokenHash = crypto.createHash("sha256").update(String(token).trim()).digest("hex");
      const user = await User.findOne({
        emailVerificationTokenHash: tokenHash,
      }).select("+emailVerificationTokenHash +emailVerificationAttempts");

      if (!user) {
        return res.status(400).json({
          status: false,
          error: "invalid",
          msg: "Invalid or previously used verification token.",
        });
      }

      if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
        user.emailVerificationTokenHash = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();
        return res.status(400).json({
          status: false,
          error: "expired",
          email: user.email,
          msg: "Verification token has expired. Please request a new 6-digit code.",
        });
      }

      user.emailVerified = true;
      user.emailVerificationTokenHash = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerificationAttempts = 0;
      await user.save();

      return res.status(200).json({
        status: true,
        msg: "Email verified successfully! You can now log in.",
      });
    }

    // 6-digit Code verification
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        status: false,
        error: "invalid_email",
        msg: "A valid email address is required.",
      });
    }

    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({
        status: false,
        error: "invalid_code",
        msg: "Please enter a valid 6-digit verification code.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    // Look up user strictly by email (do NOT trust arbitrary frontend IDs)
    const user = await User.findOne({ email: cleanEmail }).select("+emailVerificationTokenHash +emailVerificationAttempts");

    if (!user) {
      return res.status(400).json({
        status: false,
        error: "not_found",
        msg: "No account found with this email address.",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        status: false,
        error: "invalid",
        alreadyVerified: true,
        msg: "This account has already been verified or code has already been used.",
      });
    }

    if (!user.emailVerificationTokenHash) {
      return res.status(400).json({
        status: false,
        error: "invalid",
        msg: "No active verification code found or code already used. Please request a new code.",
      });
    }

    const currentAttempts = user.emailVerificationAttempts || 0;
    if (currentAttempts >= 5) {
      user.emailVerificationTokenHash = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerificationAttempts = 0;
      await user.save();

      return res.status(429).json({
        status: false,
        error: "max_attempts",
        msg: "Too many failed attempts. For your security, this code has been invalidated. Please request a new code.",
      });
    }

    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      user.emailVerificationTokenHash = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerificationAttempts = 0;
      await user.save();

      return res.status(400).json({
        status: false,
        error: "expired",
        email: user.email,
        msg: "Verification code has expired. Codes are valid for 10 minutes. Please request a new code.",
      });
    }

    const submittedHash = crypto.createHash("sha256").update(cleanCode).digest("hex");
    const storedHash = user.emailVerificationTokenHash;

    const match = crypto.timingSafeEqual(
      Buffer.from(submittedHash, "hex"),
      Buffer.from(storedHash, "hex")
    );

    if (!match) {
      user.emailVerificationAttempts = currentAttempts + 1;
      await user.save();

      const remaining = 5 - user.emailVerificationAttempts;
      if (remaining <= 0) {
        user.emailVerificationTokenHash = undefined;
        user.emailVerificationExpires = undefined;
        user.emailVerificationAttempts = 0;
        await user.save();

        return res.status(429).json({
          status: false,
          error: "max_attempts",
          msg: "Too many failed attempts. For your security, this code has been invalidated. Please request a new code.",
        });
      }

      return res.status(400).json({
        status: false,
        error: "incorrect_code",
        remainingAttempts: remaining,
        msg: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      });
    }

    // Success! Mark verified and invalidate single-use code
    user.emailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerificationAttempts = 0;
    await user.save();

    return res.status(200).json({
      status: true,
      msg: "Email verified successfully! You can now log in.",
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        status: false,
        msg: "Please provide a valid email address",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).select("+emailVerificationTokenHash +emailVerificationAttempts");

    if (!user) {
      return res.status(200).json({
        status: true,
        msg: "If an unverified account with this email exists, a verification code has been sent.",
      });
    }

    if (user.emailVerified) {
      return res.status(200).json({
        status: true,
        alreadyVerified: true,
        msg: "Your account is already verified. You can log in directly.",
      });
    }

    // Rate limiting: 60 seconds minimum cooldown between code requests
    if (user.emailVerificationLastSent) {
      const elapsedMs = Date.now() - new Date(user.emailVerificationLastSent).getTime();
      if (elapsedMs < 60 * 1000) {
        const remainingSec = Math.ceil((60000 - elapsedMs) / 1000);
        return res.status(429).json({
          status: false,
          error: "rate_limited",
          retryAfter: remainingSec,
          msg: `Please wait ${remainingSec} second${remainingSec === 1 ? "" : "s"} before requesting another code.`,
        });
      }
    }

    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto.createHash("sha256").update(rawCode).digest("hex");
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.emailVerificationTokenHash = codeHash;
    user.emailVerificationExpires = codeExpires;
    user.emailVerificationAttempts = 0;
    user.emailVerificationLastSent = new Date();
    await user.save();

    try {
      await sendVerificationEmail({
        to: cleanEmail,
        username: user.username,
        code: rawCode,
      });
    } catch (emailErr) {
      console.error("[Auth] Resend verification email failed:", emailErr.message);
      return res.status(500).json({
        status: false,
        msg: "Failed to deliver verification code. Please try again later.",
      });
    }

    return res.status(200).json({
      status: true,
      msg: "A new 6-digit verification code has been sent to your email address.",
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
      emailVerified: req.user.emailVerified,
    },
  });
};

module.exports.getAllUsers = async (req, res, next) => {
  try {
    const keyword = req.query.search
      ? { username: { $regex: escapeRegex(req.query.search.trim()), $options: "i" } }
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

    // Real-time notification: inform all users who share a conversation (direct or group) with this user
    const io = req.app.get("io");
    if (io) {
      try {
        const chats = await Chat.find({ users: targetUserId }).select("users");
        const relevantUserIds = new Set();
        // Always include target user themselves (to keep other active tabs/sessions in sync)
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
        // Notification failure should not fail the successful user rename operation
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

    // Find all chats this user was part of
    const allUserChats = await Chat.find({ users: targetUserId });
    const chatIds = allUserChats.map((c) => c._id);

    // Delete messages in those chats
    await Messages.deleteMany({ chat: { $in: chatIds } });

    // Keep surviving groups and admins intact. A group with no remaining
    // administrator is deleted, matching the prior behavior for sole-admin
    // groups whose owner account was removed.
    for (const chat of allUserChats.filter((item) => item.isGroupChat)) {
      const admins = getGroupAdminIds(chat).filter((id) => id !== targetUserId.toString());
      if (isGroupAdmin(chat, targetUserId) && admins.length === 0) {
        if (chat.groupPic && chat.groupPic !== "default-group.svg") safeDeleteFile(path.join(profilePicsDir, chat.groupPic));
        await Chat.deleteOne({ _id: chat._id });
      } else {
        chat.users = chat.users.filter((member) => member.toString() !== targetUserId.toString());
        chat.groupAdmins = admins;
        if (!admins.some((id) => id === String(chat.groupAdmin))) chat.groupAdmin = admins[0];
        await chat.save();
      }
    }

    // Delete direct chats involving this user
    await Chat.deleteMany({ users: targetUserId, isGroupChat: false });

    // Finally delete the user document
    await User.deleteOne({ _id: targetUserId });

    return res.status(200).json({ status: true });
  } catch (e) {
    return next(e);
  }
};
