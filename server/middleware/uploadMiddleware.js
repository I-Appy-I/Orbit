const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Ensure upload directories exist
const profilePicsDir = path.join(__dirname, "../images/profile_pictures");
const attachmentsDir = path.join(__dirname, "../images/attachments");

[profilePicsDir, attachmentsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.");
    error.status = 400;
    cb(error);
  }
};

const createStorage = (destinationDir) => {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }
      cb(null, destinationDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueSuffix = crypto.randomBytes(16).toString("hex");
      cb(null, `${Date.now()}_${uniqueSuffix}${ext}`);
    },
  });
};

const profilePicUpload = multer({
  storage: createStorage(profilePicsDir),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
});

const attachmentUpload = multer({
  storage: createStorage(attachmentsDir),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter,
});

const safeDeleteFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.error(`Error deleting file at ${filePath}:`, err.message);
  }
  return false;
};

module.exports = {
  profilePicUpload,
  attachmentUpload,
  profilePicsDir,
  attachmentsDir,
  safeDeleteFile,
  ALLOWED_MIME_TYPES,
};
