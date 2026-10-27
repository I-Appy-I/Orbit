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

const getVerificationSecret = () => {
  return process.env.EMAIL_VERIFICATION_SECRET || process.env.JWT_SECRET || "orbit-default-verification-secret";
};

const hashVerificationCode = (code) => {
  return crypto.createHmac("sha256", getVerificationSecret()).update(String(code).trim()).digest("hex");
};

const legacyHashVerificationCode = (code) => {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
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
    const codeHash = hashVerificationCode(rawCode);
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
      const tokenHash = hashVerificationCode(token);
      const legacyTokenHash = legacyHashVerificationCode(token);
      const user = await User.findOne({
        $or: [
          { emailVerificationTokenHash: tokenHash },
          { emailVerificationTokenHash: legacyTokenHash },
        ],
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

      await User.findOneAndUpdate(
        { _id: user._id, emailVerified: false },
        {
          $set: { emailVerified: true },
          $unset: {
            emailVerificationTokenHash: 1,
            emailVerificationExpires: 1,
            emailVerificationAttempts: 1,
          },
        }
      );

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

    const submittedHmacHash = hashVerificationCode(cleanCode);
    const submittedLegacyHash = legacyHashVerificationCode(cleanCode);
    const storedHash = user.emailVerificationTokenHash;

    const matchHmac =
      storedHash.length === submittedHmacHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(submittedHmacHash, "hex"),
        Buffer.from(storedHash, "hex")
      );

    const matchLegacy =
      storedHash.length === submittedLegacyHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(submittedLegacyHash, "hex"),
        Buffer.from(storedHash, "hex")
      );

    const match = matchHmac || matchLegacy;

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

    // Success! Mark verified atomically and invalidate single-use code
    const verifiedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        emailVerified: false,
        emailVerificationTokenHash: storedHash,
      },
      {
        $set: { emailVerified: true },
        $unset: {
          emailVerificationTokenHash: 1,
          emailVerificationExpires: 1,
          emailVerificationAttempts: 1,
        },
      },
      { new: true }
    );

    if (!verifiedUser) {
      return res.status(400).json({
        status: false,
        error: "invalid",
        msg: "Code has already been verified or invalidated.",
      });
    }

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
    const codeHash = hashVerificationCode(rawCode);
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

    const currentUser = await User.findById(targetUserId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Rate limiting: 60 seconds minimum cooldown between code requests
    if (currentUser.pendingEmailVerificationLastSent) {
      const elapsedMs = Date.now() - new Date(currentUser.pendingEmailVerificationLastSent).getTime();
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
    const codeHash = hashVerificationCode(rawCode);
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      await sendVerificationEmail({
        to: cleanEmail,
        username: currentUser.username,
        code: rawCode,
      });
    } catch (emailErr) {
      console.error("[Auth] Failed to send verification email for email update:", emailErr.message);
      return res.status(500).json({
        status: false,
        msg: "Failed to send verification code to your new email. Please check the address or try again later.",
      });
    }

    currentUser.pendingEmail = cleanEmail;
    currentUser.pendingEmailVerificationTokenHash = codeHash;
    currentUser.pendingEmailVerificationExpires = codeExpires;
    currentUser.pendingEmailVerificationAttempts = 0;
    currentUser.pendingEmailVerificationLastSent = new Date();
    await currentUser.save();

    return res.status(200).json({
      status: true,
      msg: "A 6-digit verification code has been sent to your new email address.",
      pendingEmail: cleanEmail,
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.verifyEmailUpdate = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const { code } = req.body;

    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({
        status: false,
        msg: "Please provide a valid 6-digit verification code",
      });
    }

    const cleanCode = code.trim();
    const user = await User.findById(targetUserId).select(
      "+pendingEmailVerificationTokenHash +pendingEmailVerificationAttempts"
    );

    if (!user || !user.pendingEmail || !user.pendingEmailVerificationTokenHash) {
      return res.status(400).json({
        status: false,
        msg: "No pending email change request found.",
      });
    }

    if (!user.pendingEmailVerificationExpires || new Date() > user.pendingEmailVerificationExpires) {
      return res.status(400).json({
        status: false,
        error: "expired",
        msg: "Verification code has expired. Please request a new code.",
      });
    }

    const currentAttempts = user.pendingEmailVerificationAttempts || 0;
    if (currentAttempts >= 5) {
      await User.findByIdAndUpdate(user._id, {
        $unset: {
          pendingEmail: 1,
          pendingEmailVerificationTokenHash: 1,
          pendingEmailVerificationExpires: 1,
          pendingEmailVerificationAttempts: 1,
          pendingEmailVerificationLastSent: 1,
        },
      });
      return res.status(429).json({
        status: false,
        error: "max_attempts",
        msg: "Too many failed attempts. For your security, this code has been invalidated. Please request a new code.",
      });
    }

    const storedHash = user.pendingEmailVerificationTokenHash;
    const submittedHmacHash = hashVerificationCode(cleanCode);
    const submittedLegacyHash = legacyHashVerificationCode(cleanCode);

    const matchHmac =
      storedHash.length === submittedHmacHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(submittedHmacHash, "hex"),
        Buffer.from(storedHash, "hex")
      );

    const matchLegacy =
      storedHash.length === submittedLegacyHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(submittedLegacyHash, "hex"),
        Buffer.from(storedHash, "hex")
      );

    const match = matchHmac || matchLegacy;

    if (!match) {
      const nextAttempts = currentAttempts + 1;
      const remaining = 5 - nextAttempts;

      if (remaining <= 0) {
        await User.findByIdAndUpdate(user._id, {
          $unset: {
            pendingEmail: 1,
            pendingEmailVerificationTokenHash: 1,
            pendingEmailVerificationExpires: 1,
            pendingEmailVerificationAttempts: 1,
            pendingEmailVerificationLastSent: 1,
          },
        });
        return res.status(429).json({
          status: false,
          error: "max_attempts",
          msg: "Too many failed attempts. For your security, this code has been invalidated. Please request a new code.",
        });
      }

      await User.findByIdAndUpdate(user._id, {
        pendingEmailVerificationAttempts: nextAttempts,
      });

      return res.status(400).json({
        status: false,
        error: "incorrect_code",
        remainingAttempts: remaining,
        msg: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      });
    }

    // Check if pendingEmail is already taken by another account
    const emailConflict = await User.findOne({
      email: user.pendingEmail,
      _id: { $ne: user._id },
    });

    if (emailConflict) {
      await User.findByIdAndUpdate(user._id, {
        $unset: {
          pendingEmail: 1,
          pendingEmailVerificationTokenHash: 1,
          pendingEmailVerificationExpires: 1,
          pendingEmailVerificationAttempts: 1,
          pendingEmailVerificationLastSent: 1,
        },
      });
      return res.status(409).json({
        status: false,
        msg: "This email address is already registered to another account.",
      });
    }

    // Atomically promote pendingEmail to email, clear pending fields, ensure emailVerified remains true
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        pendingEmail: user.pendingEmail,
        pendingEmailVerificationTokenHash: storedHash,
      },
      {
        $set: {
          email: user.pendingEmail,
          emailVerified: true,
        },
        $unset: {
          pendingEmail: 1,
          pendingEmailVerificationTokenHash: 1,
          pendingEmailVerificationExpires: 1,
          pendingEmailVerificationAttempts: 1,
          pendingEmailVerificationLastSent: 1,
        },
      },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(400).json({
        status: false,
        msg: "This email change request has been cancelled or has already been completed.",
      });
    }

    const token = generateToken(updatedUser._id);
    const userPayload = {
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      profilePic: updatedUser.profilePic,
      isAdmin: updatedUser.isAdmin,
      emailVerified: updatedUser.emailVerified,
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

module.exports.resendEmailUpdate = async (req, res, next) => {
  try {
    const targetUserId = req.user._id;
    const user = await User.findById(targetUserId).select(
      "+pendingEmailVerificationTokenHash +pendingEmailVerificationAttempts"
    );

    if (!user || !user.pendingEmail) {
      return res.status(400).json({
        status: false,
        msg: "No pending email change request found.",
      });
    }

    // Rate limiting: 60 seconds minimum cooldown between code requests
    if (user.pendingEmailVerificationLastSent) {
      const elapsedMs = Date.now() - new Date(user.pendingEmailVerificationLastSent).getTime();
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
    const codeHash = hashVerificationCode(rawCode);
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      await sendVerificationEmail({
        to: user.pendingEmail,
        username: user.username,
        code: rawCode,
      });
    } catch (emailErr) {
      console.error("[Auth] Resend email update verification failed:", emailErr.message);
      return res.status(500).json({
        status: false,
        msg: "Failed to deliver verification code. Please try again later.",
      });
    }

    user.pendingEmailVerificationTokenHash = codeHash;
    user.pendingEmailVerificationExpires = codeExpires;
    user.pendingEmailVerificationAttempts = 0;
    user.pendingEmailVerificationLastSent = new Date();
    await user.save();

    return res.status(200).json({
      status: true,
      msg: "A new 6-digit verification code has been sent to your new email address.",
    });
  } catch (e) {
    return next(e);
  }
};

module.exports.cancelEmailUpdate = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $unset: {
        pendingEmail: 1,
        pendingEmailVerificationTokenHash: 1,
        pendingEmailVerificationExpires: 1,
        pendingEmailVerificationAttempts: 1,
        pendingEmailVerificationLastSent: 1,
      },
    });
    return res.status(200).json({
      status: true,
      msg: "Email change request cancelled.",
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
