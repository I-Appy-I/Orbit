const request = require("supertest");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
const { safeDeleteFile, profilePicsDir, attachmentsDir, detectImageSignature } = require("../middleware/uploadMiddleware");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
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

describe("File Uploads, Magic Bytes & Attachment Security", () => {
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  it("should ensure upload directories exist on the filesystem", () => {
    expect(fs.existsSync(profilePicsDir)).toBe(true);
    expect(fs.existsSync(attachmentsDir)).toBe(true);
  });

  it("should safeDeleteFile without crashing on non-existent file", () => {
    const result = safeDeleteFile(path.join(profilePicsDir, "non_existent_file_12345.png"));
    expect(result).toBe(false);
  });

  it("should detect valid image signatures correctly", () => {
    const tempFile = path.join(profilePicsDir, `temp_sig_${Date.now()}.png`);
    fs.writeFileSync(tempFile, png1x1);
    const sig = detectImageSignature(tempFile);
    expect(sig).not.toBeNull();
    expect(sig.mime).toBe("image/png");
    safeDeleteFile(tempFile);
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

  it("should reject disguised script files claiming to be .png via magic byte inspection", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .field("username", "disguiseduser")
      .field("email", "disguised@example.com")
      .field("password", "password123")
      .attach("profilePic", Buffer.from("<?php echo 'malicious'; ?>"), "avatar.png");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature does not match allowed image formats/);
  });

  it("should accept valid image file during registration and sanitize filename", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .field("username", "goodpicuser")
      .field("email", "goodpic@example.com")
      .field("password", "password123")
      .attach("profilePic", png1x1, "avatar.png");

    expect(res.status).toBe(201);
    expect(res.body.user.profilePic).not.toBe("avatar.png");
    expect(res.body.user.profilePic).toMatch(/\.png$/);

    const uploadedPath = path.join(profilePicsDir, res.body.user.profilePic);
    expect(fs.existsSync(uploadedPath)).toBe(true);
    safeDeleteFile(uploadedPath);
    expect(fs.existsSync(uploadedPath)).toBe(false);
  });

  it("should reject direct unauthenticated static access to attachments folder", async () => {
    // Write a dummy file directly into attachments folder
    const dummyFilename = `attachment_dummy_${Date.now()}.png`;
    const dummyPath = path.join(attachmentsDir, dummyFilename);
    fs.writeFileSync(dummyPath, png1x1);

    // Static route /images/attachments should NOT be mounted
    const staticRes = await request(app).get(`/images/attachments/${dummyFilename}`);
    expect(staticRes.status).toBe(404);

    safeDeleteFile(dummyPath);
  });

  describe("Protected Attachment Serving (/api/messages/attachment/:filename)", () => {
    let userA, userB, userC, tokenA, tokenB, tokenC, chatAB, attachmentFilename;

    beforeEach(async () => {
      userA = await User.create({
        username: "userAAttach",
        email: "usera_attach@example.com",
        password: "password123",
        emailVerified: true,
      });
      tokenA = generateToken(userA._id);

      userB = await User.create({
        username: "userBAttach",
        email: "userb_attach@example.com",
        password: "password123",
        emailVerified: true,
      });
      tokenB = generateToken(userB._id);

      userC = await User.create({
        username: "userCAttach",
        email: "userc_attach@example.com",
        password: "password123",
        emailVerified: true,
      });
      tokenC = generateToken(userC._id);

      chatAB = await Chat.create({
        chatName: "Chat AB",
        isGroupChat: false,
        users: [userA._id, userB._id],
      });

      // Upload an attachment message to chatAB
      const uploadRes = await request(app)
        .put("/api/messages/addmsg")
        .set("Authorization", `Bearer ${tokenA}`)
        .field("chatId", chatAB._id.toString())
        .attach("attachment", png1x1, "photo.png");

      expect(uploadRes.status).toBe(201);
      attachmentFilename = uploadRes.body.attachment;
      expect(attachmentFilename).toBeDefined();
    });

    afterEach(() => {
      if (attachmentFilename) {
        safeDeleteFile(path.join(attachmentsDir, attachmentFilename));
      }
    });

    it("should return 401 when no token is provided", async () => {
      const res = await request(app).get(`/api/messages/attachment/${attachmentFilename}`);
      expect(res.status).toBe(401);
    });

    it("should return 403 when non-participant requests attachment", async () => {
      const res = await request(app)
        .get(`/api/messages/attachment/${attachmentFilename}`)
        .set("Authorization", `Bearer ${tokenC}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Not authorized to access this attachment/);
    });

    it("should allow chat participant to access attachment via Bearer token", async () => {
      const res = await request(app)
        .get(`/api/messages/attachment/${attachmentFilename}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-type"]).toMatch(/image\/png/);
    });

    it("should allow chat participant to access attachment via query token (?token=)", async () => {
      const res = await request(app)
        .get(`/api/messages/attachment/${attachmentFilename}?token=${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("should return 400 or 404 for path traversal attempts", async () => {
      const res = await request(app)
        .get(`/api/messages/attachment/..%2F..%2Fpackage.json`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect([400, 404]).toContain(res.status);
    });
  });
});
