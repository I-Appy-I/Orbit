const request = require("supertest");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const Block = require("../model/blockModel");
const { generateToken } = require("../config/generateToken");

beforeAll(async () => connectDB());
afterAll(async () => closeDB());
beforeEach(async () => clearDB());

describe("persistent direct-message blocking", () => {
  let alice, bob, tokenA, tokenB, direct, group;
  beforeEach(async () => {
    alice = await User.create({ username: "aliceBlock", email: "alice-block@example.com", password: "passwordA", emailVerified: true });
    bob = await User.create({ username: "bobBlock", email: "bob-block@example.com", password: "passwordB", emailVerified: true });
    tokenA = generateToken(alice._id); tokenB = generateToken(bob._id);
    direct = await Chat.create({ chatName: "Direct", users: [alice._id, bob._id] });
    group = await Chat.create({ chatName: "Group", isGroupChat: true, users: [alice._id, bob._id], groupAdmin: alice._id });
  });

  it("blocks both direct-message directions, retains history, and restores messaging on unblock", async () => {
    const history = await Messages.create({ chat: direct._id, sender: alice._id, content: "Earlier message" });
    expect((await request(app).post(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(200);
    expect(await Block.countDocuments({ blocker: alice._id, blockedUser: bob._id })).toBe(1);
    expect((await request(app).get(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`)).body).toEqual({ blockedByMe: true, blockedMe: false });
    expect((await request(app).get(`/api/blocks/${alice._id}`).set("Authorization", `Bearer ${tokenB}`)).body).toEqual({ blockedByMe: false, blockedMe: true });
    expect((await request(app).post(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(200);

    const outgoing = await request(app).put("/api/messages/addmsg").set("Authorization", `Bearer ${tokenA}`).send({ chatId: direct._id, content: "Blocked outgoing" });
    const incoming = await request(app).put("/api/messages/addmsg").set("Authorization", `Bearer ${tokenB}`).send({ chatId: direct._id, content: "Blocked incoming" });
    expect(outgoing.status).toBe(403); expect(outgoing.body.code).toBe("DIRECT_MESSAGE_BLOCKED");
    expect(incoming.status).toBe(403); expect(incoming.body.code).toBe("DIRECT_MESSAGE_BLOCKED");
    expect(await Messages.countDocuments({ chat: direct._id })).toBe(1);
    expect((await request(app).get(`/api/messages/getmsg/${direct._id}`).set("Authorization", `Bearer ${tokenB}`)).body[0]._id).toBe(history._id.toString());

    const blockedAttemptInGroup = await request(app).put("/api/messages/addmsg").set("Authorization", `Bearer ${tokenB}`).send({ chatId: group._id, content: "Group still works" });
    expect(blockedAttemptInGroup.status).toBe(201);
    expect((await request(app).delete(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(200);
    expect((await request(app).delete(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(200);
    expect((await request(app).put("/api/messages/addmsg").set("Authorization", `Bearer ${tokenB}`).send({ chatId: direct._id, content: "After unblock" })).status).toBe(201);
  });

  it("rejects self-blocks and avoids creating a direct conversation when blocked", async () => {
    expect((await request(app).post(`/api/blocks/${alice._id}`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(400);
    await request(app).post(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`);
    await Chat.deleteOne({ _id: direct._id });
    const access = await request(app).post("/api/chats/accessChat").set("Authorization", `Bearer ${tokenB}`).send({ userId: alice._id });
    expect(access.status).toBe(403);
    expect(await Chat.countDocuments({ isGroupChat: false })).toBe(0);
  });

  it("keeps blocked users searchable after conversation deletion and supports unblocking there", async () => {
    await request(app).post(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`);
    await Chat.deleteOne({ _id: direct._id });

    const search = await request(app).get("/api/auth/allUsers?search=bobBlock").set("Authorization", `Bearer ${tokenA}`);
    expect(search.status).toBe(200);
    expect(search.body).toHaveLength(1);
    expect(search.body[0]._id).toBe(bob._id.toString());
    expect(search.body[0].blockedByMe).toBe(true);
    expect(search.body[0].blockedMe).toBe(false);
    expect(search.body[0]).not.toHaveProperty("email");

    const unblocked = await request(app).delete(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(unblocked.status).toBe(200);
    expect(await Block.countDocuments({ blocker: alice._id, blockedUser: bob._id })).toBe(0);
    const refreshedSearch = await request(app).get("/api/auth/allUsers?search=bobBlock").set("Authorization", `Bearer ${tokenA}`);
    expect(refreshedSearch.body[0].blockedByMe).toBe(false);

    const opened = await request(app).post("/api/chats/accessChat").set("Authorization", `Bearer ${tokenA}`).send({ userId: bob._id });
    expect(opened.status).toBe(200);
    expect(await Chat.countDocuments({ users: { $all: [alice._id, bob._id] }, isGroupChat: false })).toBe(1);
  });

  it("returns one canonical direct chat for repeated concurrent access requests", async () => {
    await Chat.init();
    const [first, second] = await Promise.all([
      request(app).post("/api/chats/accessChat").set("Authorization", `Bearer ${tokenA}`).send({ userId: bob._id }),
      request(app).post("/api/chats/accessChat").set("Authorization", `Bearer ${tokenB}`).send({ userId: alice._id }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body._id).toBe(second.body._id);
    expect(await Chat.countDocuments({ isGroupChat: false })).toBe(1);
  });

  it("consolidates only duplicate direct chats for the same pair without losing messages", async () => {
    const duplicate = await Chat.create({ chatName: "Duplicate", users: [bob._id, alice._id] });
    const oldMessage = await Messages.create({ chat: direct._id, sender: alice._id, content: "Older history" });
    const newerMessage = await Messages.create({ chat: duplicate._id, sender: bob._id, content: "Newer history" });

    const response = await request(app).post("/api/chats/accessChat")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ userId: bob._id });
    expect(response.status).toBe(200);
    expect(response.body._id).toBe(direct._id.toString());
    expect(await Chat.countDocuments({ isGroupChat: false })).toBe(1);
    expect(await Chat.findById(duplicate._id)).toBeNull();
    const history = await Messages.find({ chat: direct._id }).sort({ createdAt: 1 });
    expect(history.map((message) => message._id.toString())).toEqual([oldMessage._id.toString(), newerMessage._id.toString()]);
    expect(history.every((message) => message.chat.toString() === direct._id.toString())).toBe(true);
    expect(response.body.latestMessage._id).toBe(newerMessage._id.toString());
  });

  it("creates exactly one direct chat when unblocked and a message is sent after the prior chat was deleted", async () => {
    // Regression test for Issue #3: block + delete + unblock + send must not
    // create two Chat documents for the same pair.
    await request(app).post(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`);
    await request(app).put("/api/chats/deleteChat")
      .set("Authorization", `Bearer ${tokenA}`).send({ chatId: direct._id });
    expect(await Chat.countDocuments({ isGroupChat: false })).toBe(0);

    await request(app).delete(`/api/blocks/${bob._id}`).set("Authorization", `Bearer ${tokenA}`);

    // Alice opens a fresh conversation (findOrCreateDirectChat must create exactly one)
    const opened = await request(app).post("/api/chats/accessChat")
      .set("Authorization", `Bearer ${tokenA}`).send({ userId: bob._id });
    expect(opened.status).toBe(200);
    expect(await Chat.countDocuments({ isGroupChat: false })).toBe(1);

    // Sending the first message must not spawn a second chat document
    const sent = await request(app).put("/api/messages/addmsg")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ chatId: opened.body._id, content: "First message after unblock" });
    expect(sent.status).toBe(201);
    expect(await Chat.countDocuments({ isGroupChat: false })).toBe(1);

    // Bob must also be able to reply via the same conversation
    const reply = await request(app).put("/api/messages/addmsg")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ chatId: opened.body._id, content: "Bob's reply" });
    expect(reply.status).toBe(201);
    expect(await Messages.countDocuments({ chat: opened.body._id })).toBe(2);
  });
});
