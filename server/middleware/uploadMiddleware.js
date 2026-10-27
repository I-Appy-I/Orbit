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

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
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
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : ".png";
      const uniqueSuffix = crypto.randomBytes(16).toString("hex");
      cb(null, `${Date.now()}_${uniqueSuffix}${safeExt}`);
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

/**
 * Inspects the magic numbers (initial bytes) of a file to verify its true image type.
 * Protects against executable or script files disguised as images.
 * @param {string} filePath
 * @returns {{ mime: string, ext: string } | null}
 */
const detectImageSignature = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;

    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) return null;

    // JPEG signature: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mime: "image/jpeg", ext: ".jpg" };
    }

    // PNG signature: 89 50 4E 47
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return { mime: "image/png", ext: ".png" };
    }

    // GIF signature: GIF8 (47 49 46 38)
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return { mime: "image/gif", ext: ".gif" };
    }

    // WEBP signature: RIFF (bytes 0-3) and WEBP (bytes 8-11)
    if (
      bytesRead >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { mime: "image/webp", ext: ".webp" };
    }

    return null;
  } catch (err) {
    return null;
  }
};

/**
 * Middleware that runs after multer has saved a file to disk.
 * Validates the file's binary magic bytes and ensures the declared extension
 * matches the actual file content. Deletes malicious/disguised files immediately.
 */
const validateUploadedFile = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const detected = detectImageSignature(req.file.path);
  if (!detected) {
    safeDeleteFile(req.file.path);
    return res.status(400).json({
      message: "Invalid file content: file signature does not match allowed image formats (JPEG, PNG, WEBP, GIF)",
      status: false,
    });
  }

  const clientExt = path.extname(req.file.originalname || "").toLowerCase();
  const isExtensionValid =
    (detected.mime === "image/jpeg" && (clientExt === ".jpg" || clientExt === ".jpeg")) ||
    (detected.mime === "image/png" && clientExt === ".png") ||
    (detected.mime === "image/gif" && clientExt === ".gif") ||
    (detected.mime === "image/webp" && clientExt === ".webp");

  if (!isExtensionValid) {
    safeDeleteFile(req.file.path);
    return res.status(400).json({
      message: "File extension does not match actual image signature",
      status: false,
    });
  }

  req.file.detectedMime = detected.mime;
  return next();
};

module.exports = {
  profilePicUpload,
  attachmentUpload,
  profilePicsDir,
  attachmentsDir,
  safeDeleteFile,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  detectImageSignature,
  validateUploadedFile,
};
