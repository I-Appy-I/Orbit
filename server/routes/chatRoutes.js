const express = require("express");
const {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  removeFromGroup,
  exitGroup,
  addToGroup,
  groupPicUpdate,
  deleteChat,
  updateGroupAdmin,
} = require("../controller/chatController");
const { protect } = require("../middleware/authMiddleware");
const { profilePicUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.route("/group").post(protect, createGroupChat);
router.route("/rename").put(protect, renameGroup);
router.route("/groupremove").put(protect, removeFromGroup);
router.route("/groupexit").put(protect, exitGroup);
router.route("/groupadd").put(protect, addToGroup);
router.route("/groupadmin").put(protect, updateGroupAdmin);
router.route("/grouppic").put(protect, profilePicUpload.single("groupPic"), groupPicUpdate);
router.route("/accessChat").post(protect, accessChat);
router.route("/fetchChats").get(protect, fetchChats);
router.route("/deleteChat").put(protect, deleteChat);

module.exports = router;
