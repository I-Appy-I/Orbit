const http = require("http");
const socketio = require("socket.io");
const ioClient = require("socket.io-client");
const app = require("../app");
const { initializeSocket } = require("../socket");
const { connectDB, closeDB, clearDB } = require("./setup");
const User = require("../model/userModel");
const Chat = require("../model/chatModel");
const { generateToken } = require("../config/generateToken");

let httpServer, io, port, serverUrl;

beforeAll(async () => {
  await connectDB();

  httpServer = http.createServer(app);
  io = socketio(httpServer);
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
    });
    token1 = generateToken(user1._id);

    user2 = await User.create({
      username: "socketUser2",
      email: "socket2@example.com",
      password: "password2",
    });
    token2 = generateToken(user2._id);

    user3 = await User.create({
      username: "socketUser3",
      email: "socket3@example.com",
      password: "password3",
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

  it("should broadcast a message only to chat room members", (done) => {
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

    // Client 2 joins the room
    client2.on("connected", () => {
      client2.emit("join chat", chat12._id.toString());

      // Client 1 sends message after client 2 has joined
      setTimeout(() => {
        client1.emit("new message", {
          chatId: chat12._id.toString(),
          content: "Hello User 2!",
          sender: user1._id.toString(),
        });
      }, 200);
    });
  });
});
