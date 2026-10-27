const request = require("supertest");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const { generateToken } = require("../config/generateToken");
const { _getSentEmails, _clearSentEmails } = require("../utils/emailService");

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await closeDB();
});

beforeEach(async () => {
  await clearDB();
  _clearSentEmails();
  process.env.GMAIL_USER = "test_user@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "test_app_password";
});

describe("Resource Authorization & IDOR Protection", () => {
  let userA, userB, tokenA, tokenB;

  beforeEach(async () => {
    userA = await User.create({
      username: "userAlice",
      email: "alice@example.com",
      password: "passwordA",
      emailVerified: true,
    });
    tokenA = generateToken(userA._id);

    userB = await User.create({
      username: "userBob",
      email: "bob@example.com",
      password: "passwordB",
      emailVerified: true,
    });
    tokenB = generateToken(userB._id);
  });

  describe("User Profile IDOR Protections", () => {
    it("should prevent User A from renaming User B by sending User B's ID in body", async () => {
      const res = await request(app)
        .put("/api/auth/renameUser")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          userId: userB._id.toString(),
          newUsername: "hackedBob",
        });

      expect(res.status).toBe(200);
      const refreshedA = await User.findById(userA._id);
      const refreshedB = await User.findById(userB._id);
      expect(refreshedA.username).toBe("hackedBob");
      expect(refreshedB.username).toBe("userBob");
    });

    it("should prevent User A from updating User B's email", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          userId: userB._id.toString(),
          newEmail: "hacked@example.com",
        });

      const refreshedB = await User.findById(userB._id);
      expect(refreshedB.email).toBe("bob@example.com");
    });

    it("should prevent User A from deleting User B's account", async () => {
      await request(app)
        .put("/api/auth/deleteUser")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          userId: userB._id.toString(),
        });

      const refreshedB = await User.findById(userB._id);
      expect(refreshedB).not.toBeNull();
    });
  });

  describe("Chat Access & Message Authorization", () => {
    let privateChat;

    beforeEach(async () => {
      const userC = await User.create({
        username: "userCharlie",
        email: "charlie@example.com",
        password: "passwordC",
        emailVerified: true,
      });

      privateChat = await Chat.create({
        chatName: "Bob and Charlie",
        isGroupChat: false,
        users: [userB._id, userC._id],
      });

      await Messages.create({
        content: "Top secret message between Bob and Charlie",
        sender: userB._id,
        chat: privateChat._id,
      });
    });

    it("should forbid User A from reading messages from a chat they are not part of", async () => {
      const res = await request(app)
        .get(`/api/messages/getmsg/${privateChat._id}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
    });

    it("should forbid User A from sending a message to a chat they are not part of", async () => {
      const res = await request(app)
        .put("/api/messages/addmsg")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          chatId: privateChat._id.toString(),
          content: "Unauthorized intrusion message",
        });

      expect(res.status).toBe(403);
    });

    it("should allow User B (authorized member) to read messages", async () => {
      const res = await request(app)
        .get(`/api/messages/getmsg/${privateChat._id}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].content).toBe("Top secret message between Bob and Charlie");
    });
  });

  describe("Group Management Authorization", () => {
    let groupChat;

    beforeEach(async () => {
      groupChat = await Chat.create({
        chatName: "Secret Club",
        isGroupChat: true,
        users: [userA._id, userB._id],
        groupAdmin: userA._id,
      });
    });

    it("should forbid non-admin (Bob) from renaming the group", async () => {
      const res = await request(app)
        .put("/api/chats/rename")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({
          chatId: groupChat._id.toString(),
          chatName: "Bob's Club",
        });

      expect(res.status).toBe(403);
      const chat = await Chat.findById(groupChat._id);
      expect(chat.chatName).toBe("Secret Club");
    });

    it("should forbid non-admin (Bob) from adding another user", async () => {
      const userD = await User.create({
        username: "userDavid",
        email: "david@example.com",
        password: "passwordD",
        emailVerified: true,
      });

      const res = await request(app)
        .put("/api/chats/groupadd")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({
          chatId: groupChat._id.toString(),
          userId: userD._id.toString(),
        });

      expect(res.status).toBe(403);
    });

    it("should allow admin (Alice) to rename the group", async () => {
      const res = await request(app)
        .put("/api/chats/rename")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          chatId: groupChat._id.toString(),
          chatName: "Alice's Awesome Club",
        });

      expect(res.status).toBe(200);
      const chat = await Chat.findById(groupChat._id);
      expect(chat.chatName).toBe("Alice's Awesome Club");
    });

    it("preserves legacy group admins and allows multiple admins to manage the group", async () => {
      expect(groupChat.groupAdmins).toHaveLength(0);
      const promoted = await request(app)
        .put("/api/chats/groupadmin")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userB._id.toString(), action: "promote" });
      expect(promoted.status).toBe(200);
      expect(promoted.body.groupAdmins.map((admin) => admin._id.toString())).toContain(userA._id.toString());
      expect(promoted.body.groupAdmins.map((admin) => admin._id.toString())).toContain(userB._id.toString());

      const renamed = await request(app)
        .put("/api/chats/rename")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ chatId: groupChat._id.toString(), chatName: "Shared administration" });
      expect(renamed.status).toBe(200);
      expect(renamed.body.chatName).toBe("Shared administration");
    });

    it("returns a canonical admin array for legacy groups during chat-list fetch", async () => {
      const response = await request(app).get("/api/chats/fetchChats").set("Authorization", `Bearer ${tokenA}`);
      expect(response.status).toBe(200);
      const fetchedGroup = response.body.find((chat) => chat._id === groupChat._id.toString());
      expect(fetchedGroup.groupAdmins.map((admin) => admin._id.toString())).toContain(userA._id.toString());
    });

    it("rejects role changes from non-admins and protects the last administrator", async () => {
      const outsider = await User.create({ username: "userOutsider", email: "outsider@example.com", password: "passwordX", emailVerified: true });
      const outsiderPromotion = await request(app)
        .put("/api/chats/groupadmin")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: outsider._id.toString(), action: "promote" });
      expect(outsiderPromotion.status).toBe(400);

      const rejectPromotion = await request(app)
        .put("/api/chats/groupadmin")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ chatId: groupChat._id.toString(), userId: userB._id.toString(), action: "promote" });
      expect(rejectPromotion.status).toBe(403);

      const rejectDemotion = await request(app)
        .put("/api/chats/groupadmin")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userA._id.toString(), action: "demote" });
      expect(rejectDemotion.status).toBe(400);

      const rejectLastAdminLeave = await request(app)
        .put("/api/chats/groupremove")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userA._id.toString() });
      expect(rejectLastAdminLeave.status).toBe(400);
    });

    it("removes a departing administrator from the admin list when another admin remains", async () => {
      await request(app).put("/api/chats/groupadmin")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userB._id.toString(), action: "promote" });
      const removed = await request(app).put("/api/chats/groupremove")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userB._id.toString() });
      expect(removed.status).toBe(200);
      expect(removed.body.users.map((member) => member._id.toString())).not.toContain(userB._id.toString());
      expect(removed.body.groupAdmins.map((admin) => admin._id.toString())).not.toContain(userB._id.toString());
      expect(removed.body.groupAdmins[0]._id.toString()).toBe(userA._id.toString());
    });

    it("allows a member to exit only their own group membership and preserves the last admin", async () => {
      const lastAdminExit = await request(app)
        .put("/api/chats/groupexit")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString() });
      expect(lastAdminExit.status).toBe(400);

      const outsider = await User.create({ username: "userOutsider2", email: "outsider2@example.com", password: "passwordX", emailVerified: true });
      const outsiderToken = generateToken(outsider._id);
      const rejectOutsider = await request(app)
        .put("/api/chats/groupexit")
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({ chatId: groupChat._id.toString() });
      expect(rejectOutsider.status).toBe(403);

      const promote = await request(app)
        .put("/api/chats/groupadmin")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userB._id.toString(), action: "promote" });
      expect(promote.status).toBe(200);

      const exit = await request(app)
        .put("/api/chats/groupexit")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ chatId: groupChat._id.toString(), userId: userA._id.toString() });
      expect(exit.status).toBe(200);
      const persisted = await Chat.findById(groupChat._id);
      expect(persisted.users.map(String)).toContain(userA._id.toString());
      expect(persisted.users.map(String)).not.toContain(userB._id.toString());
      expect(persisted.groupAdmins.map(String)).toContain(userA._id.toString());
      expect(persisted.groupAdmins.map(String)).not.toContain(userB._id.toString());
    });

    it("deletes a group and its messages when the sole administrator exits as its last member", async () => {
      const unauthorizedDelete = await request(app).put("/api/chats/deleteChat")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ chatId: groupChat._id.toString() });
      expect(unauthorizedDelete.status).toBe(403);

      const removeMember = await request(app).put("/api/chats/groupremove")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString(), userId: userB._id.toString() });
      expect(removeMember.status).toBe(200);

      const groupMessage = await Messages.create({ chat: groupChat._id, sender: userA._id, content: "Group history" });
      const exit = await request(app).put("/api/chats/groupexit")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ chatId: groupChat._id.toString() });
      expect(exit.status).toBe(200);
      expect(exit.body.deleted).toBe(true);
      expect(await Chat.findById(groupChat._id)).toBeNull();
      expect(await Messages.findById(groupMessage._id)).toBeNull();
    });
  });

  describe("Account Deletion & Group Message Retention", () => {
    it("should preserve group messages sent by other members when a user deletes their account", async () => {
      const userC = await User.create({
        username: "userCharlieDel",
        email: "charliedel@example.com",
        password: "passwordC",
        emailVerified: true,
      });

      const group = await Chat.create({
        chatName: "Preserved Group",
        isGroupChat: true,
        users: [userA._id, userB._id, userC._id],
        groupAdmin: userA._id,
        groupAdmins: [userA._id, userB._id],
      });

      const msgAlice = await Messages.create({ chat: group._id, sender: userA._id, content: "Alice msg" });
      const msgBob = await Messages.create({ chat: group._id, sender: userB._id, content: "Bob msg" });
      const msgCharlie = await Messages.create({ chat: group._id, sender: userC._id, content: "Charlie msg" });

      const directChat = await Chat.create({
        chatName: "Alice & Bob Direct",
        isGroupChat: false,
        users: [userA._id, userB._id],
      });
      const directMsg = await Messages.create({ chat: directChat._id, sender: userA._id, content: "Direct msg" });

      const delRes = await request(app)
        .put("/api/auth/deleteUser")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(delRes.status).toBe(200);

      const deletedAlice = await User.findById(userA._id);
      expect(deletedAlice).toBeNull();

      expect(await Chat.findById(directChat._id)).toBeNull();
      expect(await Messages.findById(directMsg._id)).toBeNull();

      const survivingGroup = await Chat.findById(group._id);
      expect(survivingGroup).not.toBeNull();
      expect(survivingGroup.users.map(String)).not.toContain(userA._id.toString());
      expect(survivingGroup.users.map(String)).toContain(userB._id.toString());
      expect(survivingGroup.users.map(String)).toContain(userC._id.toString());

      expect(survivingGroup.groupAdmins.map(String)).toContain(userB._id.toString());
      expect(survivingGroup.groupAdmins.map(String)).not.toContain(userA._id.toString());

      expect(await Messages.findById(msgBob._id)).not.toBeNull();
      expect(await Messages.findById(msgCharlie._id)).not.toBeNull();
    });
  });

  describe("Email Update Integrity & Pending OTP Verification Flow", () => {
    it("should send OTP to new email address without modifying current email or emailVerified status", async () => {
      const res = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(true);
      expect(res.body.pendingEmail).toBe("alice_new@example.com");

      // Verify original user record was not modified prematurely
      const refreshed = await User.findById(userA._id).select(
        "+pendingEmailVerificationTokenHash +pendingEmailVerificationExpires"
      );
      expect(refreshed.email).toBe("alice@example.com"); // Remains original email
      expect(refreshed.emailVerified).toBe(true); // Remains verified
      expect(refreshed.pendingEmail).toBe("alice_new@example.com");
      expect(refreshed.pendingEmailVerificationTokenHash).toBeDefined();
      expect(refreshed.pendingEmailVerificationExpires).toBeDefined();

      // Verify email was sent to NEW address with 6-digit code
      const sent = _getSentEmails();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe("alice_new@example.com");
      expect(sent[0]._code).toMatch(/^\d{6}$/);
    });

    it("should reject updating email to the same email address", async () => {
      const res = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice@example.com" });

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/New email cannot be the same/);
    });

    it("should reject updating email if new email is already registered to another user", async () => {
      const res = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "bob@example.com" });

      expect(res.status).toBe(409);
      expect(res.body.msg).toMatch(/already used/i);
    });

    it("should reject updating email with invalid email format", async () => {
      const res = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "not-an-email" });

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/valid email/i);
    });

    it("should handle email delivery failure gracefully without updating pending email", async () => {
      process.env.GMAIL_USER = "simulate_failure";

      const res = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_failed@example.com" });

      expect(res.status).toBe(500);
      expect(res.body.status).toBe(false);

      const refreshed = await User.findById(userA._id);
      expect(refreshed.email).toBe("alice@example.com");
      expect(refreshed.pendingEmail).toBeUndefined();
    });

    it("should enforce 60-second cooldown between email change requests", async () => {
      // First request
      const res1 = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new1@example.com" });
      expect(res1.status).toBe(200);

      // Immediate second request
      const res2 = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new2@example.com" });

      expect(res2.status).toBe(429);
      expect(res2.body.error).toBe("rate_limited");
      expect(res2.body.retryAfter).toBeGreaterThan(0);
    });

    it("should verify OTP and promote pendingEmail to email while preserving emailVerified: true", async () => {
      // Request change
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      const sent = _getSentEmails();
      expect(sent.length).toBe(1);
      const code = sent[0]._code;

      // Submit verification
      const verifyRes = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ code });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.status).toBe(true);
      expect(verifyRes.body.user.email).toBe("alice_new@example.com");
      expect(verifyRes.body.user.emailVerified).toBe(true);
      expect(verifyRes.body.user.token).toBeDefined();

      // Database check
      const refreshed = await User.findById(userA._id).select(
        "+pendingEmailVerificationTokenHash +pendingEmailVerificationExpires"
      );
      expect(refreshed.email).toBe("alice_new@example.com");
      expect(refreshed.emailVerified).toBe(true);
      expect(refreshed.pendingEmail).toBeUndefined();
      expect(refreshed.pendingEmailVerificationTokenHash).toBeUndefined();
    });

    it("should reject incorrect OTP and decrement remaining attempts", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      const verifyRes = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ code: "000000" });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.status).toBe(false);
      expect(verifyRes.body.error).toBe("incorrect_code");
      expect(verifyRes.body.remainingAttempts).toBe(4);

      // Ensure original email is intact
      const refreshed = await User.findById(userA._id);
      expect(refreshed.email).toBe("alice@example.com");
    });

    it("should reject expired OTP", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      // Expire code in DB
      await User.findByIdAndUpdate(userA._id, {
        pendingEmailVerificationExpires: new Date(Date.now() - 1000),
      });

      const sent = _getSentEmails();
      const code = sent[0]._code;

      const verifyRes = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ code });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error).toBe("expired");

      const refreshed = await User.findById(userA._id);
      expect(refreshed.email).toBe("alice@example.com");
    });

    it("should allow resending OTP for pending email with 60s cooldown", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      _clearSentEmails();

      // Immediate resend should be rate-limited
      const resend1 = await request(app)
        .post("/api/auth/resend-email-update")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(resend1.status).toBe(429);

      // Fast-forward cooldown in DB
      await User.findByIdAndUpdate(userA._id, {
        pendingEmailVerificationLastSent: new Date(Date.now() - 65 * 1000),
      });

      const resend2 = await request(app)
        .post("/api/auth/resend-email-update")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(resend2.status).toBe(200);
      expect(resend2.body.status).toBe(true);

      const sent = _getSentEmails();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe("alice_new@example.com");
    });

    it("should preserve original email if user cancels email change", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      const cancelRes = await request(app)
        .post("/api/auth/cancel-email-update")
        .set("Authorization", `Bearer ${tokenA}`);

      expect(cancelRes.status).toBe(200);

      const refreshed = await User.findById(userA._id);
      expect(refreshed.email).toBe("alice@example.com");
      expect(refreshed.pendingEmail).toBeUndefined();
    });

    it("should prevent subsequent login from being blocked after initiating and cancelling an email change", async () => {
      // Re-hash password for bcrypt compare in login
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("passwordA123", 10);
      await User.findByIdAndUpdate(userA._id, { password: hashedPassword });

      // Start email change
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_cancelled@example.com" });

      // Cancel email change
      const cancelRes = await request(app)
        .post("/api/auth/cancel-email-update")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(cancelRes.status).toBe(200);

      // Verify login succeeds without being blocked or forced to verify
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          username: "userAlice",
          password: "passwordA123",
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.status).toBe(true);
      expect(loginRes.body.email).toBe("alice@example.com");
      expect(loginRes.body.emailVerified).toBe(true);
      expect(loginRes.body.token).toBeDefined();
    });

    it("should reject verification when code was cancelled or outdated", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_new@example.com" });

      const sent = _getSentEmails();
      const code = sent[0]._code;

      // Cancel change
      await request(app)
        .post("/api/auth/cancel-email-update")
        .set("Authorization", `Bearer ${tokenA}`);

      // Submitting code after cancellation must be rejected
      const verifyRes = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ code });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.msg).toMatch(/No pending email change request/i);
    });

    it("should reject reusing a code that has already been verified", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_once@example.com" });

      const sent = _getSentEmails();
      const code = sent[0]._code;

      // First verification succeeds
      const verify1 = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ code });
      expect(verify1.status).toBe(200);

      // Second verification using the same code must fail
      const verify2 = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ code });
      expect(verify2.status).toBe(400);
    });

    it("should prevent User B from verifying or modifying User A's pending email change", async () => {
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_protected@example.com" });

      const sent = _getSentEmails();
      const code = sent[0]._code;

      // User B attempts to verify User A's code
      const verifyB = await request(app)
        .post("/api/auth/verify-email-update")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ code, userId: userA._id.toString() });

      expect(verifyB.status).toBe(400);
      expect(verifyB.body.msg).toMatch(/No pending email change request/i);

      // User A's pending email is untouched
      const refreshedA = await User.findById(userA._id);
      expect(refreshedA.pendingEmail).toBe("alice_protected@example.com");
      expect(refreshedA.email).toBe("alice@example.com");
    });

    it("should keep registration verification independent from email change", async () => {
      // User A starts email change
      await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ newEmail: "alice_independent@example.com" });

      _clearSentEmails();

      // Register a new unverified user
      const regRes = await request(app)
        .post("/api/auth/register")
        .send({
          username: "reguser",
          email: "reguser@example.com",
          password: "password123",
        });

      expect(regRes.status).toBe(201);
      const regSent = _getSentEmails();
      expect(regSent.length).toBe(1);
      const regCode = regSent[0]._code;

      // Verify registration via /api/auth/verify-code
      const regVerify = await request(app)
        .post("/api/auth/verify-code")
        .send({
          email: "reguser@example.com",
          code: regCode,
        });

      expect(regVerify.status).toBe(200);

      // Verify User A's pending email was not touched by registration verification
      const refreshedA = await User.findById(userA._id);
      expect(refreshedA.pendingEmail).toBe("alice_independent@example.com");
      expect(refreshedA.email).toBe("alice@example.com");
    });
  });
});
