const mongoose = require("mongoose");

const MessageSchema = mongoose.Schema(
  {
    content: {
      type: String,
      default: "",
    },
    attachment: {
      type: String,
      default: "",
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for efficient message pagination per chat
MessageSchema.index({ chat: 1, createdAt: -1 });

module.exports = mongoose.model("Messages", MessageSchema);