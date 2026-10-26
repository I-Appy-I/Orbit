const router = require("express").Router();
const {
  login,
  getCurrentUser,
  register,
  verifyEmail,
  resendVerification,
  getAllUsers,
  renameUser,
  emailUpdate,
  profilePicUpdate,
  passwordUpdate,
  deleteProfile,
} = require("../controller/userController");
const { protect } = require("../middleware/authMiddleware");
const { profilePicUpload } = require("../middleware/uploadMiddleware");
const { registerRateLimiter, resendRateLimiter } = require("../middleware/rateLimiter");

router.post("/register", registerRateLimiter, profilePicUpload.single("profilePic"), register);
router.post("/login", login);
router.get("/me", protect, getCurrentUser);

router.get("/verify-email", verifyEmail);
router.post("/verify-email", verifyEmail);
router.post("/verify-code", verifyEmail);
router.post("/resend-verification", resendRateLimiter, resendVerification);

router.route("/allUsers").get(protect, getAllUsers);
router.route("/deleteUser").put(protect, deleteProfile);
router.route("/renameUser").put(protect, renameUser);
router.route("/emailUpdate").put(protect, emailUpdate);
router.route("/profilePicUpdate").put(protect, profilePicUpload.single("profilePic"), profilePicUpdate);
router.route("/passwordUpdate").put(protect, passwordUpdate);

module.exports = router;
