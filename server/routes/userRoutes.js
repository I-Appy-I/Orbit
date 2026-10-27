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
  verifyEmailUpdate,
  resendEmailUpdate,
  cancelEmailUpdate,
  profilePicUpdate,
  passwordUpdate,
  deleteProfile,
} = require("../controller/userController");
const { protect } = require("../middleware/authMiddleware");
const { profilePicUpload, validateUploadedFile } = require("../middleware/uploadMiddleware");
const {
  registerRateLimiter,
  loginRateLimiter,
  verifyCodeRateLimiter,
  resendRateLimiter,
} = require("../middleware/rateLimiter");

router.post("/register", registerRateLimiter, profilePicUpload.single("profilePic"), validateUploadedFile, register);
router.post("/login", loginRateLimiter, login);
router.get("/me", protect, getCurrentUser);

router.get("/verify-email", verifyEmail);
router.post("/verify-email", verifyCodeRateLimiter, verifyEmail);
router.post("/verify-code", verifyCodeRateLimiter, verifyEmail);
router.post("/resend-verification", resendRateLimiter, resendVerification);

router.route("/allUsers").get(protect, getAllUsers);
router.route("/deleteUser").put(protect, deleteProfile);
router.route("/renameUser").put(protect, renameUser);
router.route("/emailUpdate").put(protect, resendRateLimiter, emailUpdate);
router.route("/verify-email-update").post(protect, verifyCodeRateLimiter, verifyEmailUpdate);
router.route("/resend-email-update").post(protect, resendRateLimiter, resendEmailUpdate);
router.route("/cancel-email-update").post(protect, cancelEmailUpdate);
router.route("/profilePicUpdate").put(protect, profilePicUpload.single("profilePic"), validateUploadedFile, profilePicUpdate);
router.route("/passwordUpdate").put(protect, passwordUpdate);

module.exports = router;
