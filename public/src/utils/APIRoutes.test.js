import * as APIRoutes from "./APIRoutes";

describe("APIRoutes Dynamic Configuration and Fallback Behavior", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("getBackendOrigin reads REACT_APP_API_URL and strips trailing slashes", () => {
    process.env.REACT_APP_API_URL = "https://orbit-backend.onrender.com///";
    const { getBackendOrigin } = require("./APIRoutes");
    expect(getBackendOrigin()).toBe("https://orbit-backend.onrender.com");
  });

  test("getBackendOrigin falls back to http://localhost:5000 when REACT_APP_API_URL is unset", () => {
    delete process.env.REACT_APP_API_URL;
    delete process.env.REACT_APP_BACKEND_URL;
    const { getBackendOrigin } = require("./APIRoutes");
    expect(getBackendOrigin()).toBe("http://localhost:5000");
  });

  test("getSocketUrl uses REACT_APP_SOCKET_URL when explicitly provided", () => {
    process.env.REACT_APP_SOCKET_URL = "https://socket.orbit-chat.com///";
    process.env.REACT_APP_API_URL = "https://orbit-backend.onrender.com";
    const { getSocketUrl } = require("./APIRoutes");
    expect(getSocketUrl()).toBe("https://socket.orbit-chat.com");
  });

  test("getSocketUrl falls back to REACT_APP_API_URL when REACT_APP_SOCKET_URL is unset", () => {
    delete process.env.REACT_APP_SOCKET_URL;
    process.env.REACT_APP_API_URL = "https://orbit-backend.onrender.com";
    const { getSocketUrl } = require("./APIRoutes");
    expect(getSocketUrl()).toBe("https://orbit-backend.onrender.com");
  });

  test("getSocketUrl falls back to http://localhost:5000 when all env vars are unset", () => {
    delete process.env.REACT_APP_SOCKET_URL;
    delete process.env.REACT_APP_API_URL;
    delete process.env.REACT_APP_BACKEND_URL;
    const { getSocketUrl } = require("./APIRoutes");
    expect(getSocketUrl()).toBe("http://localhost:5000");
  });

  test("does not declare or export obsolete email-verification or OTP route constants", () => {
    expect(APIRoutes.verifyEmailRoute).toBeUndefined();
    expect(APIRoutes.verifyCodeRoute).toBeUndefined();
    expect(APIRoutes.resendVerificationRoute).toBeUndefined();
    expect(APIRoutes.verifyEmailUpdateRoute).toBeUndefined();
    expect(APIRoutes.resendEmailUpdateRoute).toBeUndefined();
    expect(APIRoutes.cancelEmailUpdateRoute).toBeUndefined();
  });

  test("exports all required core authentication, conversation, and messaging endpoints", () => {
    expect(typeof APIRoutes.loginRoute).toBe("string");
    expect(typeof APIRoutes.registerRoute).toBe("string");
    expect(typeof APIRoutes.currentUserRoute).toBe("string");
    expect(typeof APIRoutes.allUsersRoute).toBe("string");
    expect(typeof APIRoutes.emailUpdateRoute).toBe("string");
    expect(typeof APIRoutes.sendMessageRoute).toBe("string");
    expect(typeof APIRoutes.recieveMessageRoute).toBe("string");
    expect(typeof APIRoutes.fetchChatsRoute).toBe("string");
    expect(typeof APIRoutes.accessChatRoute).toBe("string");
    expect(typeof APIRoutes.blocksRoute).toBe("string");
  });

  test("getAttachmentUrl creates authenticated attachment URL using configured backend origin", () => {
    delete process.env.REACT_APP_ATTACHMENT_PATHS;
    process.env.REACT_APP_API_URL = "https://orbit-backend.onrender.com";
    const { getAttachmentUrl } = require("./APIRoutes");
    const url = getAttachmentUrl("photo.jpg", "test-token");
    expect(url).toBe("https://orbit-backend.onrender.com/api/messages/attachment/photo.jpg?token=test-token");
  });
});
