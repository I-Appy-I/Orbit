const request = require("supertest");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
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
      // It must update userA, NOT userB!
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
      // Create a private chat between Bob and a third user Charlie
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
      // Alice is group admin, Bob is member
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
      expect(groupChat.groupAdmins).toHaveLength(0); // legacy persisted shape
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
        // The endpoint must ignore a supplied target ID and only remove the authenticated member.
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
});
