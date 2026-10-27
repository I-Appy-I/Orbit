const request = require("supertest");
const crypto = require("crypto");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");
const User = require("../model/userModel");
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
  process.env.GMAIL_SENDER_NAME = "Orbit";
});

describe("Authentication & Email Verification System", () => {
  it("should register a new user as unverified and not return an authenticated session token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(true);
    expect(res.body.emailVerified).toBe(false);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.emailVerified).toBe(false);
    // Crucial requirement: Do not issue a fully authorized session to an unverified account
    expect(res.body.user).not.toHaveProperty("token");

    // Check database state: token must be stored as hash only
    const dbUser = await User.findOne({ email: "test@example.com" }).select("+emailVerificationTokenHash");
    expect(dbUser).not.toBeNull();
    expect(dbUser.emailVerified).toBe(false);
    expect(dbUser.emailVerificationTokenHash).toBeDefined();
    expect(typeof dbUser.emailVerificationTokenHash).toBe("string");
    expect(dbUser.emailVerificationExpires).toBeDefined();
    expect(new Date(dbUser.emailVerificationExpires) > new Date()).toBe(true);

    // Verify email delivery was attempted with 6-digit code
    const sent = _getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe("test@example.com");
    expect(sent[0]._code).toBeDefined();
    expect(sent[0]._code).toMatch(/^\d{6}$/);

    // Verify stored hash matches hash of 6-digit code in email
    const secret = process.env.EMAIL_VERIFICATION_SECRET || process.env.JWT_SECRET || "orbit-default-verification-secret";
    const computedHash = crypto.createHmac("sha256", secret).update(sent[0]._code).digest("hex");
    expect(dbUser.emailVerificationTokenHash).toBe(computedHash);

    // Check expiration is 10 minutes
    const expiryDiff = new Date(dbUser.emailVerificationExpires) - Date.now();
    expect(expiryDiff).toBeLessThanOrEqual(10 * 60 * 1000 + 2000);
    expect(expiryDiff).toBeGreaterThan(9 * 60 * 1000);
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
  });

  it("should reject duplicate username or email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const duplicateRes = await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "other@example.com",
        password: "password123",
      });
    expect(duplicateRes.status).toBe(409);
  });

  it("should prevent unverified users from logging in with a 403 status", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        username: "testuser",
        password: "password123",
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.status).toBe(false);
    expect(loginRes.body.emailVerified).toBe(false);
    expect(loginRes.body.email).toBe("test@example.com");
    expect(loginRes.body.msg).toMatch(/verify your email/i);
    expect(loginRes.body).not.toHaveProperty("token");
  });

  it("should reject login with wrong password regardless of verification status", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        username: "testuser",
        password: "wrongpassword",
      });

    expect(res.status).toBe(401);
  });

  it("should verify account with valid 6-digit code via POST /api/auth/verify-code and allow subsequent login", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const sent = _getSentEmails();
    const rawCode = sent[0]._code;

    // Verify 6-digit code via POST /api/auth/verify-code
    const verifyRes = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: rawCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe(true);
    expect(verifyRes.body.msg).toMatch(/verified successfully/i);

    // Database check
    const dbUser = await User.findOne({ email: "test@example.com" }).select("+emailVerificationTokenHash");
    expect(dbUser.emailVerified).toBe(true);
    expect(dbUser.emailVerificationTokenHash).toBeUndefined();
    expect(dbUser.emailVerificationExpires).toBeUndefined();

    // Now login should succeed and return JWT session token
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        username: "testuser",
        password: "password123",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe(true);
    expect(loginRes.body).toHaveProperty("token");
    expect(loginRes.body.emailVerified).toBe(true);
  });

  it("should reject incorrect 6-digit codes and decrement remaining attempts", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const res = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("incorrect_code");
    expect(res.body.remainingAttempts).toBe(4);
    expect(res.body.msg).toMatch(/4 attempts remaining/i);
  });

  it("should lock out and invalidate verification code after 5 failed attempts", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post("/api/auth/verify-code")
        .send({ email: "test@example.com", code: "000000" });
      expect(res.status).toBe(400);
      expect(res.body.remainingAttempts).toBe(5 - i);
    }

    // 5th failed attempt should trigger lockout and code invalidation
    const lockoutRes = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: "000000" });

    expect(lockoutRes.status).toBe(429);
    expect(lockoutRes.body.error).toBe("max_attempts");

    // Code hash should be cleared in DB
    const dbUser = await User.findOne({ email: "test@example.com" }).select("+emailVerificationTokenHash");
    expect(dbUser.emailVerificationTokenHash).toBeUndefined();
    expect(dbUser.emailVerified).toBe(false);
  });

  it("should invalidate the 6-digit code after successful use (single-use enforcement)", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const rawCode = _getSentEmails()[0]._code;

    // First use: success
    const firstRes = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: rawCode });
    expect(firstRes.status).toBe(200);

    // Second use: must be rejected
    const secondRes = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: rawCode });
    expect(secondRes.status).toBe(400);
    expect(secondRes.body.error).toBe("invalid");
  });

  it("should reject expired verification codes and clear expired state", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const rawCode = _getSentEmails()[0]._code;

    // Force expire the code in database
    await User.updateOne(
      { email: "test@example.com" },
      { emailVerificationExpires: new Date(Date.now() - 1000) }
    );

    const res = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: rawCode });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("expired");
    expect(res.body.email).toBe("test@example.com");

    // Token hash should be cleared in DB
    const dbUser = await User.findOne({ email: "test@example.com" }).select("+emailVerificationTokenHash");
    expect(dbUser.emailVerificationTokenHash).toBeUndefined();
    expect(dbUser.emailVerified).toBe(false);
  });

  it("should reject arbitrary or malformed verification codes", async () => {
    const res = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_code");

    const resEmpty = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "test@example.com", code: "" });
    expect(resEmpty.status).toBe(400);
  });

  it("should enforce a 60-second cooldown rate limit on resending verification code", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    // Immediate resend must be rate limited (429)
    const rateLimitedRes = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "test@example.com" });

    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.error).toBe("rate_limited");
    expect(rateLimitedRes.body.retryAfter).toBeDefined();

    // Advance lastSent timestamp by 61 seconds in DB
    await User.updateOne(
      { email: "test@example.com" },
      { emailVerificationLastSent: new Date(Date.now() - 65 * 1000) }
    );

    _clearSentEmails();
    const allowedRes = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "test@example.com" });

    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.status).toBe(true);

    const sent = _getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0]._code).toMatch(/^\d{6}$/);
  });

  it("should avoid leaking whether an account exists on resend-verification", async () => {
    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "nonexistent@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.msg).toMatch(/If an unverified account/i);
    expect(_getSentEmails().length).toBe(0);
  });

  it("should handle email delivery failure gracefully without falsely claiming success", async () => {
    process.env.GMAIL_USER = "simulate_failure";

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "deliveryfailuser",
        email: "fail@example.com",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(true);
    expect(res.body.emailDeliveryFailed).toBe(true);
    expect(res.body.msg).toMatch(/could not be delivered/i);
    expect(res.body.user).not.toHaveProperty("token");

    // Resend failure handling
    const resendFail = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "fail@example.com" });

    expect(resendFail.status).toBe(500);
    expect(resendFail.body.status).toBe(false);
  });

  it("should enforce email verification on protected backend API routes", async () => {
    // Manually create an unverified user in the database
    const unverifiedUser = await User.create({
      username: "unverifiedApiUser",
      email: "unverified-api@example.com",
      password: "password123",
      emailVerified: false,
    });

    const unverifiedToken = generateToken(unverifiedUser._id);

    // Attempting to access protected endpoints with unverified user's token must be rejected with 403
    const protectedRes = await request(app)
      .get("/api/auth/allUsers")
      .set("Authorization", `Bearer ${unverifiedToken}`);

    expect(protectedRes.status).toBe(403);
    expect(protectedRes.body.emailVerified).toBe(false);
    expect(protectedRes.body.message).toMatch(/Email verification required/i);

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${unverifiedToken}`);

    expect(meRes.status).toBe(403);
  });

  it("should validate an existing verified session through the current-user endpoint", async () => {
    const verifiedUser = await User.create({
      username: "sessionuser",
      email: "session@example.com",
      password: "password123",
      emailVerified: true,
    });
    const validToken = generateToken(verifiedUser._id);

    const validSession = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(validSession.status).toBe(200);
    expect(validSession.body.user.username).toBe("sessionuser");
    expect(validSession.body.user.emailVerified).toBe(true);
    expect(validSession.body.user).not.toHaveProperty("password");

    const invalidSession = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalidtoken123");
    expect(invalidSession.status).toBe(401);
  });

  describe("Gmail SMTP / Nodemailer Email Service Unit Tests", () => {
    it("should format verification email with clear 6-digit code and authenticated sender", async () => {
      process.env.GMAIL_SENDER_NAME = "Orbit Chat";
      process.env.GMAIL_USER = "test_orbit_sender@gmail.com";

      const { sendVerificationEmail } = require("../utils/emailService");
      const result = await sendVerificationEmail({
        to: "user@example.com",
        username: "orbituser",
        code: "654321",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      const sent = _getSentEmails();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe("user@example.com");
      expect(sent[0].username).toBe("orbituser");
      expect(sent[0].from).toBe('"Orbit Chat" <test_orbit_sender@gmail.com>');
      expect(sent[0]._code).toBe("654321");
    });

    it("should reject when recipient or code/token is missing", async () => {
      const { sendVerificationEmail } = require("../utils/emailService");
      await expect(sendVerificationEmail({ to: "", code: "123456" })).rejects.toThrow(
        /Recipient email and verification (token|code) are required/
      );
      await expect(sendVerificationEmail({ to: "user@example.com", code: "" })).rejects.toThrow(
        /Recipient email and verification (token|code) are required/
      );
    });

    it("should throw error when Gmail credentials are not configured", () => {
      const { createTransporter } = require("../utils/emailService");
      const oldUser = process.env.GMAIL_USER;
      const oldPass = process.env.GMAIL_APP_PASSWORD;
      try {
        delete process.env.GMAIL_USER;
        delete process.env.GMAIL_APP_PASSWORD;

        expect(() => createTransporter()).toThrow(
          /Gmail SMTP credentials are not configured/
        );
      } finally {
        process.env.GMAIL_USER = oldUser;
        process.env.GMAIL_APP_PASSWORD = oldPass;
      }
    });

    it("should handle Nodemailer SMTP failure and throw sanitized error", async () => {
      const nodemailer = require("nodemailer");
      const originalCreateTransport = nodemailer.createTransport;
      const originalEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = "production";
        process.env.GMAIL_USER = "prod_user@gmail.com";
        process.env.GMAIL_APP_PASSWORD = "app_password_123";

        // Mock transporter sending failure
        nodemailer.createTransport = jest.fn().mockReturnValue({
          sendMail: jest.fn().mockRejectedValue(new Error("535-5.7.8 Username and Password not accepted")),
        });

        const { sendVerificationEmail } = require("../utils/emailService");
        await expect(
          sendVerificationEmail({
            to: "test@example.com",
            username: "test",
            token: "secret_token_never_leak",
          })
        ).rejects.toThrow(/Email delivery failed: 535-5.7.8 Username and Password not accepted/);

        expect(nodemailer.createTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
              user: "prod_user@gmail.com",
              pass: "app_password_123",
            },
          })
        );
      } finally {
        nodemailer.createTransport = originalCreateTransport;
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should strip internal spaces and whitespace from GMAIL_APP_PASSWORD", () => {
      const nodemailer = require("nodemailer");
      const originalCreateTransport = nodemailer.createTransport;
      const { createTransporter } = require("../utils/emailService");

      try {
        process.env.GMAIL_USER = "test@gmail.com";
        process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";

        nodemailer.createTransport = jest.fn().mockReturnValue({});
        createTransporter();

        expect(nodemailer.createTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            auth: {
              user: "test@gmail.com",
              pass: "abcdefghijklmnop",
            },
          })
        );
      } finally {
        nodemailer.createTransport = originalCreateTransport;
      }
    });

    it("should safely mask recipient email and sanitize error messages", () => {
      const { maskEmail, sanitizeErrorMessage } = require("../utils/emailService");
      expect(maskEmail("arpit.25bcs10093@sst.scaler.com")).toBe("ar***93@sst.scaler.com");
      expect(maskEmail("ab@example.com")).toBe("a***@example.com");

      const rawErr = "Failed to connect to http://localhost:3000/verify?token=secret123456789&password=mypassword";
      const sanitized = sanitizeErrorMessage(rawErr);
      expect(sanitized).not.toContain("secret123456789");
      expect(sanitized).not.toContain("mypassword");
      expect(sanitized).toContain("token=[REDACTED]");
      expect(sanitized).toContain("password=[REDACTED]");
    });
  });

  it("should verify successfully with legacy SHA-256 code hash in database for backward compatibility", async () => {
    const rawCode = "123456";
    const legacyHash = crypto.createHash("sha256").update(rawCode).digest("hex");
    await User.create({
      username: "legacyuser",
      email: "legacy@example.com",
      password: "password123",
      emailVerified: false,
      emailVerificationTokenHash: legacyHash,
      emailVerificationExpires: new Date(Date.now() + 10 * 60 * 1000),
    });

    const res = await request(app)
      .post("/api/auth/verify-code")
      .send({ email: "legacy@example.com", code: rawCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    const dbUser = await User.findOne({ email: "legacy@example.com" });
    expect(dbUser.emailVerified).toBe(true);
  });

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
