const request = require("supertest");
const app = require("../app");
const { connectDB, closeDB, clearDB } = require("./setup");

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await closeDB();
});

beforeEach(async () => {
  await clearDB();
});

describe("Authentication & Authorization Middleware", () => {
  it("should register a new user successfully", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(true);
    expect(res.body.user).toHaveProperty("token");
    expect(res.body.user.username).toBe("testuser");
    expect(res.body.user.email).toBe("test@example.com");
    expect(res.body.user).not.toHaveProperty("password");
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

  it("should login registered user and return token", async () => {
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
        password: "password123",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body).toHaveProperty("token");
  });

  it("should reject login with wrong password", async () => {
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

  it("should reject protected route when token is missing or invalid", async () => {
    const resNoToken = await request(app).get("/api/auth/allUsers");
    expect(resNoToken.status).toBe(401);

    const resBadToken = await request(app)
      .get("/api/auth/allUsers")
      .set("Authorization", "Bearer invalidtoken123");
    expect(resBadToken.status).toBe(401);
  });
});
