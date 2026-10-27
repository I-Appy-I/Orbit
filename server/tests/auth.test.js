const request = require("supertest");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
const User = require("../model/userModel");
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

describe("Authentication System (Frictionless / Direct Auth)", () => {
  describe("Registration Flow", () => {
    it("should register a new user directly without requiring OTP or email delivery", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(true);
      expect(res.body.msg).toMatch(/Registration successful/i);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe("testuser");
      expect(res.body.user.email).toBe("test@example.com");
      expect(res.body.user.token).toBeDefined();
      expect(typeof res.body.user.token).toBe("string");

      // Verify database record has no OTP, verification token, or expires fields
      const dbUser = await User.findOne({ email: "test@example.com" });
      expect(dbUser).not.toBeNull();
      expect(dbUser.username).toBe("testuser");
      expect(dbUser.password).not.toBe("password123"); // Hashed
      expect(dbUser.emailVerificationTokenHash).toBeUndefined();
      expect(dbUser.emailVerificationExpires).toBeUndefined();
      expect(dbUser.pendingEmail).toBeUndefined();
    });

    it("should reject registration with invalid email or short password", async () => {
      const res1 = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "invalid-email",
          password: "password123",
        });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "test@example.com",
          password: "123",
        });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post("/api/auth/register")
        .send({
          username: "abc",
          email: "test@example.com",
          password: "password123",
        });
      expect(res3.status).toBe(400);
    });

    it("should reject duplicate username or email", async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        });

      const duplicateUserRes = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "other@example.com",
          password: "password123",
        });
      expect(duplicateUserRes.status).toBe(409);

      const duplicateEmailRes = await request(app)
        .post("/api/auth/register")
        .send({
          username: "otheruser",
          email: "test@example.com",
          password: "password123",
        });
      expect(duplicateEmailRes.status).toBe(409);
    });
  });

  describe("Login Flow", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        });
    });

    it("should allow registered user to log in directly with valid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "password123",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(true);
      expect(res.body.username).toBe("testuser");
      expect(res.body.email).toBe("test@example.com");
      expect(res.body.token).toBeDefined();
    });

    it("should reject login with wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "wrongpassword",
        });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe(false);
      expect(res.body.msg).toMatch(/Incorrect username or password/i);
    });

    it("should reject login with missing username or password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe(false);
    });

    it("should allow legacy users with emailVerified: false in database to log in", async () => {
      // Manually create a user document mimicking a legacy database document
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("legacyPass123", 10);
      await User.collection.insertOne({
        username: "legacyUser",
        email: "legacy@example.com",
        password: hashedPassword,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          username: "legacyUser",
          password: "legacyPass123",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(true);
      expect(res.body.username).toBe("legacyUser");
      expect(res.body.token).toBeDefined();
    });
  });

  describe("Current User Session Endpoint (/api/auth/me)", () => {
    it("should return current user profile without password for valid JWT", async () => {
      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          username: "sessionuser",
          email: "session@example.com",
          password: "password123",
        });

      const token = registerRes.body.user.token;

      const meRes = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.username).toBe("sessionuser");
      expect(meRes.body.user.email).toBe("session@example.com");
      expect(meRes.body.user).not.toHaveProperty("password");
    });

    it("should reject unauthenticated request with 401", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("should reject invalid JWT token with 401", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalidtoken123");
      expect(res.status).toBe(401);
    });
  });

  describe("Rate Limiting on Sensitive Auth Endpoints", () => {
    it("should rate limit excessive login attempts when test rate limiting is enabled", async () => {
      process.env.ENABLE_TEST_RATE_LIMIT = "true";
      const { clearRateLimitRecords } = require("../middleware/rateLimiter");
      clearRateLimitRecords();

      try {
        // 15 attempts allowed
        for (let i = 0; i < 15; i++) {
          await request(app)
            .post("/api/auth/login")
            .send({ username: "rateuser", password: "wrongpassword" });
        }

        // 16th attempt should be blocked with 429
        const res = await request(app)
          .post("/api/auth/login")
          .send({ username: "rateuser", password: "wrongpassword" });

        expect(res.status).toBe(429);
        expect(res.body.msg).toMatch(/Too many login attempts/);
      } finally {
        delete process.env.ENABLE_TEST_RATE_LIMIT;
        clearRateLimitRecords();
      }
    });
  });

  describe("Verification Endpoints Clean Removal", () => {
    it("should return 404 for removed verification routes", async () => {
      const getVerify = await request(app).get("/api/auth/verify-email");
      expect(getVerify.status).toBe(404);

      const postVerify = await request(app).post("/api/auth/verify-email").send({ token: "123" });
      expect(postVerify.status).toBe(404);

      const postCode = await request(app).post("/api/auth/verify-code").send({ code: "123456" });
      expect(postCode.status).toBe(404);

      const resendCode = await request(app).post("/api/auth/resend-verification").send({ email: "test@example.com" });
      expect(resendCode.status).toBe(404);
    });
  });
  describe("New User Conversation and Profile Operations", () => {
    it("should allow a newly registered user with zero chats to fetch chats and receive empty list", async () => {
      const regRes = await request(app)
        .post("/api/auth/register")
        .send({ username: "brandnew", email: "brandnew@example.com", password: "password123" });
      expect(regRes.status).toBe(201);
      const token = regRes.body.user.token;

      const chatRes = await request(app)
        .get("/api/chats/fetchChats")
        .set("Authorization", `Bearer ${token}`);
      expect(chatRes.status).toBe(200);
      expect(Array.isArray(chatRes.body)).toBe(true);
      expect(chatRes.body.length).toBe(0);
    });

    it("should allow a user to search for other users by username or email, excluding themselves", async () => {
      // Create user 1 (searcher)
      const u1 = await request(app)
        .post("/api/auth/register")
        .send({ username: "searcher", email: "searcher@example.com", password: "password123" });
      const token = u1.body.user.token;

      // Create user 2 (target)
      await request(app)
        .post("/api/auth/register")
        .send({ username: "arpit kakkar", email: "arpit123@example.com", password: "password123" });

      // Search by username
      const searchRes1 = await request(app)
        .get("/api/auth/allUsers?search=arpit")
        .set("Authorization", `Bearer ${token}`);
      expect(searchRes1.status).toBe(200);
      expect(Array.isArray(searchRes1.body)).toBe(true);
      expect(searchRes1.body.length).toBe(1);
      expect(searchRes1.body[0].username).toBe("arpit kakkar");

      // Search with 0 matches returns 200 with empty array
      const searchRes2 = await request(app)
        .get("/api/auth/allUsers?search=nonexistentuser")
        .set("Authorization", `Bearer ${token}`);
      expect(searchRes2.status).toBe(200);
      expect(Array.isArray(searchRes2.body)).toBe(true);
      expect(searchRes2.body.length).toBe(0);

      // Search without query returns all other users (excluding self)
      const searchRes3 = await request(app)
        .get("/api/auth/allUsers")
        .set("Authorization", `Bearer ${token}`);
      expect(searchRes3.status).toBe(200);
      expect(searchRes3.body.some((u) => u.username === "searcher")).toBe(false);
      expect(searchRes3.body.some((u) => u.username === "arpit kakkar")).toBe(true);
    });

    it("should allow authenticated profile email update and persist in MongoDB", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({ username: "emailupdater", email: "original@example.com", password: "password123" });
      const token = reg.body.user.token;
      const userId = reg.body.user._id;

      const updateRes = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${token}`)
        .send({ newEmail: "updated.address@example.com" });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe(true);
      expect(updateRes.body.user.email).toBe("updated.address@example.com");
      expect(updateRes.body.updatedUser.email).toBe("updated.address@example.com");
      expect(updateRes.body.updatedUser.token).toBeDefined();

      // Verify in DB
      const dbUser = await User.findById(userId);
      expect(dbUser.email).toBe("updated.address@example.com");

      // Verify reject duplicate email
      await request(app)
        .post("/api/auth/register")
        .send({ username: "otheruser", email: "other@example.com", password: "password123" });

      const dupRes = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${token}`)
        .send({ newEmail: "other@example.com" });
      expect(dupRes.status).toBe(409);

      // Verify reject same email
      const sameRes = await request(app)
        .put("/api/auth/emailUpdate")
        .set("Authorization", `Bearer ${token}`)
        .send({ newEmail: "updated.address@example.com" });
      expect(sameRes.status).toBe(400);

      // Verify unauthenticated rejected
      const unauthRes = await request(app)
        .put("/api/auth/emailUpdate")
        .send({ newEmail: "unauth@example.com" });
      expect(unauthRes.status).toBe(401);
    });
  });
});
