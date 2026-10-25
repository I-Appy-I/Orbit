const request = require("supertest");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
const { safeDeleteFile, profilePicsDir, attachmentsDir } = require("../middleware/uploadMiddleware");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const { generateToken } = require("../config/generateToken");

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await closeDB();
});

beforeEach(async () => {
  await clearDB();
});

describe("File Uploads & Security", () => {
  it("should ensure upload directories exist on the filesystem", () => {
    expect(fs.existsSync(profilePicsDir)).toBe(true);
    expect(fs.existsSync(attachmentsDir)).toBe(true);
  });

  it("should safeDeleteFile without crashing on non-existent file", () => {
    const result = safeDeleteFile(path.join(profilePicsDir, "non_existent_file_12345.png"));
    expect(result).toBe(false);
  });

  it("should reject non-image file uploads during registration", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .field("username", "badfileuser")
      .field("email", "badfile@example.com")
      .field("password", "password123")
      .attach("profilePic", Buffer.from("console.log('malicious script')"), "script.js");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid file type/);
  });

  it("should accept valid image file during registration and sanitize filename", async () => {
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const res = await request(app)
      .post("/api/auth/register")
      .field("username", "goodpicuser")
      .field("email", "goodpic@example.com")
      .field("password", "password123")
      .attach("profilePic", pngBuffer, "avatar.png");

    expect(res.status).toBe(201);
    expect(res.body.user.profilePic).not.toBe("avatar.png"); // Filename was sanitized with random hex
    expect(res.body.user.profilePic).toMatch(/\.png$/);

    // Clean up created file
    const uploadedPath = path.join(profilePicsDir, res.body.user.profilePic);
    expect(fs.existsSync(uploadedPath)).toBe(true);
    safeDeleteFile(uploadedPath);
    expect(fs.existsSync(uploadedPath)).toBe(false);
  });
});
