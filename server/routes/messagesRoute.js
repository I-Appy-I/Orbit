const router = require("express").Router();
const { addMessage, getMessages } = require("../controller/messagesController");
const { protect } = require("../middleware/authMiddleware");
const { attachmentUpload } = require("../middleware/uploadMiddleware");

router.route("/addmsg").put(protect, attachmentUpload.single("attachment"), addMessage);
router.route("/getmsg/:chatId").get(protect, getMessages);

module.exports = router;