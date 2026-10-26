const mongoose = require("mongoose");
const User = require("../model/userModel");
const Block = require("../model/blockModel");

function publishBlockStatus(req, blockerId, blockedUserId, blocked) {
  const io = req.app.get("io");
  if (!io) return;
  const update = {
    blockerId: String(blockerId),
    blockedUserId: String(blockedUserId),
    blocked,
  };
  io.to(update.blockerId).emit("block status", update);
  io.to(update.blockedUserId).emit("block status", update);
}

const validateTarget = async (req, res) => {
  const { userId: rawUserId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
    res.status(400).json({ message: "Invalid user ID" });
    return null;
  }
  const userId = new mongoose.Types.ObjectId(rawUserId).toString();
  if (userId === req.user._id.toString()) {
    res.status(400).json({ message: "You cannot block yourself" });
    return null;
  }
  const target = await User.findById(userId);
  if (!target) {
    res.status(404).json({ message: "User not found" });
    return null;
  }
  return userId;
};

module.exports.getBlockStatus = async (req, res, next) => {
  try {
    const userId = await validateTarget(req, res);
    if (!userId) return;
    const [blockedByMe, blockedMe] = await Promise.all([
      Block.exists({ blocker: req.user._id, blockedUser: userId }),
      Block.exists({ blocker: userId, blockedUser: req.user._id }),
    ]);
    return res.json({ blockedByMe: Boolean(blockedByMe), blockedMe: Boolean(blockedMe) });
  } catch (error) { return next(error); }
};

module.exports.blockUser = async (req, res, next) => {
  try {
    const userId = await validateTarget(req, res);
    if (!userId) return;
    await Block.updateOne(
      { blocker: req.user._id, blockedUser: userId },
      { $setOnInsert: { blocker: req.user._id, blockedUser: userId } },
      { upsert: true }
    );
    publishBlockStatus(req, req.user._id, userId, true);
    return res.status(200).json({ blocked: true });
  } catch (error) {
    if (error.code === 11000) return res.status(200).json({ blocked: true });
    return next(error);
  }
};

module.exports.unblockUser = async (req, res, next) => {
  try {
    const userId = await validateTarget(req, res);
    if (!userId) return;
    await Block.deleteOne({ blocker: req.user._id, blockedUser: userId });
    publishBlockStatus(req, req.user._id, userId, false);
    return res.status(200).json({ blocked: false });
  } catch (error) { return next(error); }
};
