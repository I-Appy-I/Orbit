const router = require("express").Router();
const { addMessage, getMessages, getAttachment } = require("../controller/messagesController");
const { protect } = require("../middleware/authMiddleware");
const { attachmentUpload, validateUploadedFile } = require("../middleware/uploadMiddleware");

router.route("/addmsg").put(protect, attachmentUpload.single("attachment"), validateUploadedFile, addMessage);
router.route("/getmsg/:chatId").get(protect, getMessages);
router.route("/attachment/:filename").get(protect, getAttachment);

module.exports = router;
