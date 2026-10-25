const router = require("express").Router();
const {
  login,
  register,
  getAllUsers,
  renameUser,
  emailUpdate,
  profilePicUpdate,
  passwordUpdate,
  deleteProfile,
} = require("../controller/userController");
const { protect } = require("../middleware/authMiddleware");
const { profilePicUpload } = require("../middleware/uploadMiddleware");

router.post("/register", profilePicUpload.single("profilePic"), register);
router.post("/login", login);

router.route("/allUsers").get(protect, getAllUsers);
router.route("/deleteUser").put(protect, deleteProfile);
router.route("/renameUser").put(protect, renameUser);
router.route("/emailUpdate").put(protect, emailUpdate);
router.route("/profilePicUpdate").put(protect, profilePicUpload.single("profilePic"), profilePicUpdate);
router.route("/passwordUpdate").put(protect, passwordUpdate);

module.exports = router;