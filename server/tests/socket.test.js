const http = require("http");
const request = require("supertest");
const socketio = require("socket.io");
const ioClient = require("socket.io-client");
const app = require("../app");
const { initializeSocket } = require("../socket");
const { connectDB, closeDB, clearDB } = require("./setup");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const Messages = require("../model/messageModel");
const Block = require("../model/blockModel");
const { generateToken } = require("../config/generateToken");

let httpServer, io, port, serverUrl;

beforeAll(async () => {
  await connectDB();

  httpServer = http.createServer(app);
  io = socketio(httpServer);
  app.set("io", io);
  initializeSocket(io);

  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (io) io.close();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await closeDB();
});

beforeEach(async () => {
  await clearDB();
});

describe("Socket.IO Authentication & Authorization", () => {
  let user1, user2, user3, token1, token2, token3, chat12;

  beforeEach(async () => {
    user1 = await User.create({
      username: "socketUser1",
      email: "socket1@example.com",
      password: "password1",
      emailVerified: true,
    });
    token1 = generateToken(user1._id);

    user2 = await User.create({
      username: "socketUser2",
      email: "socket2@example.com",
      password: "password2",
      emailVerified: true,
    });
    token2 = generateToken(user2._id);

    user3 = await User.create({
      username: "socketUser3",
      email: "socket3@example.com",
      password: "password3",
      emailVerified: true,
    });
    token3 = generateToken(user3._id);

    // Chat between user1 and user2
    chat12 = await Chat.create({
      chatName: "Chat 1-2",
      isGroupChat: false,
      users: [user1._id, user2._id],
    });
  });

  it("should reject connection when no token is provided", (done) => {
    const client = ioClient(serverUrl, {
      transports: ["websocket"],
      reconnection: false,
    });

    client.on("connect_error", (err) => {
      expect(err.message).toMatch(/Authentication error/);
      client.close();
      done();
    });
  });

  it("should reject connection when invalid token is provided", (done) => {
    const client = ioClient(serverUrl, {
      transports: ["websocket"],
      reconnection: false,
      auth: { token: "bad.invalid.token" },
    });

    client.on("connect_error", (err) => {
      expect(err.message).toMatch(/Authentication error/);
      client.close();
      done();
    });
  });

  it("should reject connection when user email is not verified", async () => {
    const unverifiedUser = await User.create({
      username: "unverifiedSocket",
      email: "unverified@example.com",
      password: "password1",
      emailVerified: false,
    });
    const unverifiedToken = generateToken(unverifiedUser._id);

    return new Promise((resolve) => {
      const client = ioClient(serverUrl, {
        transports: ["websocket"],
        reconnection: false,
        auth: { token: unverifiedToken },
      });

      client.on("connect_error", (err) => {
        expect(err.message).toMatch(/Email not verified/);
        client.close();
        resolve();
      });
    });
  });

  it("should connect successfully when valid token is provided and receive 'connected'", (done) => {
    const client = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token1 },
    });

    client.on("connected", () => {
      client.close();
      done();
    });
  });

  it("should allow a participant to join their chat room", (done) => {
    const client = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token1 },
    });

    client.on("connected", () => {
      // User 1 joins chat12
      client.emit("join chat", chat12._id.toString());

      // If no socket_error received in 300ms, join was permitted
      setTimeout(() => {
        client.close();
        done();
      }, 300);
    });

    client.on("socket_error", (err) => {
      done(new Error(`Unexpected socket error: ${err.message}`));
    });
  });

  it("should reject non-participant from joining private chat room", (done) => {
    const client3 = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token3 }, // User 3 is NOT in chat12
    });

    client3.on("connected", () => {
      client3.emit("join chat", chat12._id.toString());
    });

    client3.on("socket_error", (err) => {
      expect(err.message).toMatch(/Not authorized/);
      client3.close();
      done();
    });
  });

  it("should reject client-created message events instead of broadcasting unpersisted data", (done) => {
    const client = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token1 },
    });

    client.on("connected", () => {
      client.emit("new message", {
        chatId: chat12._id.toString(),
        content: "This was never saved",
        sender: user2._id.toString(),
      });
    });

    client.on("socket_error", async (error) => {
      try {
        expect(error.message).toMatch(/authenticated messages endpoint/);
        expect(await Messages.countDocuments()).toBe(0);
        client.close();
        done();
      } catch (assertionError) {
        client.close();
        done(assertionError);
      }
    });
  });

  it("should broadcast a saved message only to chat room members", (done) => {
    const client1 = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token1 },
    });

    const client2 = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token2 },
    });

    const client3 = ioClient(serverUrl, {
      transports: ["websocket"],
      auth: { token: token3 }, // not in room
    });

    let client2Received = false;

    client3.on("message recieved", () => {
      done(new Error("Client 3 should not have received the message!"));
    });

    client2.on("message recieved", (payload) => {
      expect(payload.content).toBe("Hello User 2!");
      client2Received = true;
      setTimeout(() => {
        client1.close();
        client2.close();
        client3.close();
        expect(client2Received).toBe(true);
        done();
      }, 100);
    });

    // Client 2 joins the room. The message is created through the protected
    // HTTP endpoint; Socket.IO only distributes the saved document.
    client2.on("connected", () => {
      client2.emit("join chat", chat12._id.toString());

      setTimeout(async () => {
        try {
          const response = await request(app)
            .put("/api/messages/addmsg")
            .set("Authorization", `Bearer ${token1}`)
            .send({ chatId: chat12._id.toString(), content: "Hello User 2!" });
          expect(response.status).toBe(201);
          expect(response.body._id).toBeTruthy();
        } catch (error) {
          client1.close();
          client2.close();
          client3.close();
          done(error);
        }
      }, 200);
    });
  });

  it("sends a populated conversation-list update to a recipient who has not joined the chat room", (done) => {
    const sender = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token1 } });
    const recipient = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token2 } });
    recipient.on("contacts", (chatUpdate) => {
      try {
        expect(chatUpdate._id.toString()).toBe(chat12._id.toString());
        expect(chatUpdate.users.map((member) => member._id.toString())).toEqual(expect.arrayContaining([user1._id.toString(), user2._id.toString()]));
        expect(chatUpdate.latestMessage.content).toBe("First contact message");
        sender.close(); recipient.close(); done();
      } catch (error) { sender.close(); recipient.close(); done(error); }
    });

    recipient.on("connected", async () => {
      try {
        const response = await request(app).put("/api/messages/addmsg")
          .set("Authorization", `Bearer ${token1}`)
          .send({ chatId: chat12._id.toString(), content: "First contact message" });
        expect(response.status).toBe(201);
      } catch (error) { sender.close(); recipient.close(); done(error); }
    });
  });

  it("does not broadcast or persist a direct message rejected by a block", (done) => {
    const sender = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token1 } });
    const recipient = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token2 } });
    let readyCount = 0;
    let messageEvents = 0;
    let contactsEvents = 0;
    sender.on("message recieved", () => { messageEvents += 1; });
    recipient.on("message recieved", () => { messageEvents += 1; });
    recipient.on("contacts", (update) => { if (update._id === chat12._id.toString()) contactsEvents += 1; });
    const tryBlockedSend = async () => {
      readyCount += 1;
      if (readyCount !== 2) return;
      try {
        await Block.create({ blocker: user2._id, blockedUser: user1._id });
        const response = await request(app).put("/api/messages/addmsg")
          .set("Authorization", `Bearer ${token1}`)
          .send({ chatId: chat12._id.toString(), content: "Must not arrive" });
        expect(response.status).toBe(403);
        setTimeout(async () => {
          try {
            expect(await Messages.countDocuments({ chat: chat12._id })).toBe(0);
            expect(messageEvents).toBe(0);
            expect(contactsEvents).toBe(0);
            sender.close(); recipient.close(); done();
          } catch (error) { sender.close(); recipient.close(); done(error); }
        }, 200);
      } catch (error) { sender.close(); recipient.close(); done(error); }
    };
    sender.on("connected", tryBlockedSend);
    recipient.on("connected", tryBlockedSend);
  });

  it("broadcasts saved group metadata changes to participants outside the group room", (done) => {
    const groupPromise = Chat.create({ chatName: "Before rename", isGroupChat: true, users: [user1._id, user2._id], groupAdmin: user1._id });
    let group;
    const recipient = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token2 } });
    recipient.on("contacts", async (update) => {
      if (update._id !== group?._id.toString()) return;
      try {
        expect(update.chatName).toBe("After rename");
        expect(update.groupAdmins.map((admin) => admin._id.toString())).toContain(user1._id.toString());
        recipient.close(); done();
      } catch (error) { recipient.close(); done(error); }
    });
    recipient.on("connected", async () => {
      try {
        group = await groupPromise;
        const response = await request(app).put("/api/chats/rename")
          .set("Authorization", `Bearer ${token1}`)
          .send({ chatId: group._id.toString(), chatName: "After rename" });
        expect(response.status).toBe(200);
      } catch (error) { recipient.close(); done(error); }
    });
  });

  it("notifies direct-chat participants via 'chat removed' when one participant deletes the conversation", (done) => {
    // Regression test for Issue #3: deleteChat now broadcasts 'chat removed'
    // for direct chats so the peer removes the stale sidebar entry. Without
    // this, re-creating the chat after an unblock produces a duplicate entry.
    const deleter = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token1 } });
    const peer = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token2 } });
    let readyCount = 0;

    const tryDelete = async () => {
      readyCount += 1;
      if (readyCount !== 2) return;
      try {
        const response = await request(app)
          .put("/api/chats/deleteChat")
          .set("Authorization", `Bearer ${token1}`)
          .send({ chatId: chat12._id.toString() });
        expect(response.status).toBe(200);
      } catch (error) {
        deleter.close(); peer.close(); done(error);
      }
    };

    peer.on("chat removed", ({ chatId }) => {
      try {
        expect(chatId).toBe(chat12._id.toString());
        deleter.close(); peer.close(); done();
      } catch (error) { deleter.close(); peer.close(); done(error); }
    });

    deleter.on("connected", tryDelete);
    peer.on("connected", tryDelete);
  });

  it("notifies conversation peers and own other sessions via 'user updated' when a user renames, without notifying unrelated users", (done) => {
    const user1Session2 = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token1 } });
    const peerUser2 = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token2 } });
    const unrelatedUser3 = ioClient(serverUrl, { transports: ["websocket"], auth: { token: token3 } });

    let readyCount = 0;
    let peerReceived = false;
    let ownSessionReceived = false;
    let unrelatedReceived = false;

    const cleanup = () => {
      user1Session2.close();
      peerUser2.close();
      unrelatedUser3.close();
    };

    const tryRename = async () => {
      readyCount += 1;
      if (readyCount !== 3) return;
      try {
        const response = await request(app)
          .put("/api/auth/renameUser")
          .set("Authorization", `Bearer ${token1}`)
          .send({ newUsername: "AliceUpdated" });
        expect(response.status).toBe(200);
        expect(response.body.status).toBe(true);
        expect(response.body.updatedUser.username).toBe("AliceUpdated");
      } catch (error) {
        cleanup();
        done(error);
      }
    };

    peerUser2.on("user updated", (payload) => {
      try {
        expect(payload.userId).toBe(user1._id.toString());
        expect(payload.username).toBe("AliceUpdated");
        expect(payload.email).toBeUndefined();
        expect(payload.token).toBeUndefined();
        peerReceived = true;
        checkFinished();
      } catch (err) {
        cleanup();
        done(err);
      }
    });

    user1Session2.on("user updated", (payload) => {
      try {
        expect(payload.userId).toBe(user1._id.toString());
        expect(payload.username).toBe("AliceUpdated");
        ownSessionReceived = true;
        checkFinished();
      } catch (err) {
        cleanup();
        done(err);
      }
    });

    unrelatedUser3.on("user updated", () => {
      unrelatedReceived = true;
      cleanup();
      done(new Error("Unrelated user should not receive user updated event"));
    });

    const checkFinished = () => {
      if (peerReceived && ownSessionReceived) {
        setTimeout(() => {
          try {
            expect(unrelatedReceived).toBe(false);
            cleanup();
            done();
          } catch (err) {
            cleanup();
            done(err);
          }
        }, 150);
      }
    };

    user1Session2.on("connected", tryRename);
    peerUser2.on("connected", tryRename);
    unrelatedUser3.on("connected", tryRename);
  });
});
