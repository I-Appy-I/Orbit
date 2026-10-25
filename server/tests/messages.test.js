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

describe("Messages API, Sender Enforcement & Pagination", () => {
  let user1, user2, token1, token2, chat;

  beforeEach(async () => {
    user1 = await User.create({
      username: "userOne",
      email: "one@example.com",
      password: "password1",
    });
    token1 = generateToken(user1._id);

    user2 = await User.create({
      username: "userTwo",
      email: "two@example.com",
      password: "password2",
    });
    token2 = generateToken(user2._id);

    chat = await Chat.create({
      chatName: "Chat 1-2",
      isGroupChat: false,
      users: [user1._id, user2._id],
    });
  });

  it("should enforce authenticated sender identity and ignore spoofed sender in body", async () => {
    const res = await request(app)
      .put("/api/messages/addmsg")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        chatId: chat._id.toString(),
        content: "Authentic message from user1",
        sender: user2._id.toString(), // Attacker tries to impersonate user2
      });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe("Authentic message from user1");
    // Verify stored sender is user1, not user2!
    expect(res.body.sender._id.toString()).toBe(user1._id.toString());

    const savedMessage = await Messages.findById(res.body._id);
    expect(savedMessage.sender.toString()).toBe(user1._id.toString());
  });

  it("should update latestMessage on chat when a new message is added", async () => {
    const res = await request(app)
      .put("/api/messages/addmsg")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        chatId: chat._id.toString(),
        content: "Updating latest message",
      });

    expect(res.status).toBe(201);
    const updatedChat = await Chat.findById(chat._id);
    expect(updatedChat.latestMessage.toString()).toBe(res.body._id.toString());
  });

  it("should reject message without content or attachment", async () => {
    const res = await request(app)
      .put("/api/messages/addmsg")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        chatId: chat._id.toString(),
        content: "   ",
      });

    expect(res.status).toBe(400);
  });

  it("should paginate messages correctly with headers and chronological order", async () => {
    // Insert 15 messages sequentially
    for (let i = 1; i <= 15; i++) {
      await Messages.create({
        content: `Message ${i}`,
        sender: user1._id,
        chat: chat._id,
        createdAt: new Date(Date.now() + i * 1000), // Ensure strict time ordering
      });
    }

    // Request page 1 with limit 5 (most recent 5 messages)
    const resPage1 = await request(app)
      .get(`/api/messages/getmsg/${chat._id}?page=1&limit=5`)
      .set("Authorization", `Bearer ${token1}`);

    expect(resPage1.status).toBe(200);
    expect(resPage1.headers["x-total-count"]).toBe("15");
    expect(resPage1.headers["x-page"]).toBe("1");
    expect(resPage1.headers["x-total-pages"]).toBe("3");
    expect(resPage1.body.length).toBe(5);

    // Verify chronological order: the oldest of the top 5 is first, newest is last
    expect(resPage1.body[0].content).toBe("Message 11");
    expect(resPage1.body[4].content).toBe("Message 15");

    // Request page 2 with limit 5
    const resPage2 = await request(app)
      .get(`/api/messages/getmsg/${chat._id}?page=2&limit=5`)
      .set("Authorization", `Bearer ${token1}`);

    expect(resPage2.status).toBe(200);
    expect(resPage2.body.length).toBe(5);
    expect(resPage2.body[0].content).toBe("Message 6");
    expect(resPage2.body[4].content).toBe("Message 10");
  });

  it("should have correct indexes configured on Messages and Chat collections", async () => {
    const messageIndexes = await Messages.collection.indexes();
    const hasChatCreatedAtIndex = messageIndexes.some(
      (idx) => idx.key.chat === 1 && idx.key.createdAt === -1
    );
    expect(hasChatCreatedAtIndex).toBe(true);

    const chatIndexes = await Chat.collection.indexes();
    const hasUsersIndex = chatIndexes.some((idx) => idx.key.users === 1);
    expect(hasUsersIndex).toBe(true);
  });
});
