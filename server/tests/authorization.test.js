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
    });
    tokenA = generateToken(userA._id);

    userB = await User.create({
      username: "userBob",
      email: "bob@example.com",
      password: "passwordB",
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
  });
});
