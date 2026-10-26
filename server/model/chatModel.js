const mongoose = require("mongoose");

const chatSchema = mongoose.Schema(
  {
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    chatName: {
      type: String,
      trim: true,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
    },
    // Stable, order-independent key used to enforce one direct chat per pair.
    // Legacy chats are assigned this lazily when opened.
    directKey: { type: String, select: false },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // groupAdmin is retained for old documents and API clients. New code uses
    // this array, falling back to the legacy field for unmigrated groups.
    groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    groupPic: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

chatSchema.index({ users: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ directKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Chat", chatSchema);
