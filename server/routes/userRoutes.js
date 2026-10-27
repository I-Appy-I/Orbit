const router = require("express").Router();
const {
  login,
  getCurrentUser,
  register,
  getAllUsers,
  renameUser,
  emailUpdate,
  profilePicUpdate,
  passwordUpdate,
  deleteProfile,
} = require("../controller/userController");
const { protect } = require("../middleware/authMiddleware");
const { profilePicUpload, validateUploadedFile } = require("../middleware/uploadMiddleware");
const {
  registerRateLimiter,
  loginRateLimiter,
} = require("../middleware/rateLimiter");

router.post("/register", registerRateLimiter, profilePicUpload.single("profilePic"), validateUploadedFile, register);
router.post("/login", loginRateLimiter, login);
router.get("/me", protect, getCurrentUser);

router.route("/allUsers").get(protect, getAllUsers);
router.route("/deleteUser").put(protect, deleteProfile);
router.route("/renameUser").put(protect, renameUser);
router.route("/emailUpdate").put(protect, emailUpdate);
router.route("/profilePicUpdate").put(protect, profilePicUpload.single("profilePic"), validateUploadedFile, profilePicUpdate);
router.route("/passwordUpdate").put(protect, passwordUpdate);

module.exports = router;
