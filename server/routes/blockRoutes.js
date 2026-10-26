const router = require("express").Router();
const { getBlockStatus, blockUser, unblockUser } = require("../controller/blockController");
const { protect } = require("../middleware/authMiddleware");

router.get("/:userId", protect, getBlockStatus);
router.post("/:userId", protect, blockUser);
router.delete("/:userId", protect, unblockUser);

module.exports = router;
