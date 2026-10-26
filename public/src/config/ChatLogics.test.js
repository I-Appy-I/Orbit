import {
  extractId,
  isAnotherSender,
  isGroupRecieved,
  isLastMessage,
  isSameSenderMargin,
  getSender,
  getSenderProfilePic,
  getSenderFull,
} from "./ChatLogics";

describe("ChatLogics - extractId", () => {
  test("extracts id from string, object, ObjectId, and handles null/undefined", () => {
    expect(extractId("64a1b2c3")).toBe("64a1b2c3");
    expect(extractId("  64a1b2c3  ")).toBe("64a1b2c3");
    expect(extractId({ _id: "64a1b2c3" })).toBe("64a1b2c3");
    expect(extractId({ id: "64a1b2c3" })).toBe("64a1b2c3");
    expect(extractId({ _id: { toString: () => "64a1b2c3" } })).toBe("64a1b2c3");
    expect(extractId({ toString: () => "64a1b2c3" })).toBe("64a1b2c3");
    expect(extractId(null)).toBe("");
    expect(extractId(undefined)).toBe("");
    expect(extractId({})).toBe("");
  });
});

describe("ChatLogics - isAnotherSender", () => {
  const currentUserId = "user-123";
  const otherUserId = "user-456";

  test("returns false when message is sent by current user (outgoing)", () => {
    // Current user as plain string ID
    expect(isAnotherSender({ sender: currentUserId }, currentUserId)).toBe(false);
    // Current user as object
    expect(isAnotherSender({ sender: { _id: currentUserId } }, currentUserId)).toBe(false);
    // userId passed as user object
    expect(isAnotherSender({ sender: { _id: currentUserId } }, { _id: currentUserId })).toBe(false);
    expect(isAnotherSender({ sender: currentUserId }, { _id: currentUserId })).toBe(false);
  });

  test("returns true when message is sent by another user (incoming)", () => {
    expect(isAnotherSender({ sender: otherUserId }, currentUserId)).toBe(true);
    expect(isAnotherSender({ sender: { _id: otherUserId } }, currentUserId)).toBe(true);
    expect(isAnotherSender({ sender: { _id: otherUserId } }, { _id: currentUserId })).toBe(true);
    expect(isAnotherSender({ sender: otherUserId }, { _id: currentUserId })).toBe(true);
  });

  test("safely handles missing or empty sender / userId", () => {
    expect(isAnotherSender(null, currentUserId)).toBe(false);
    expect(isAnotherSender({}, currentUserId)).toBe(false);
    expect(isAnotherSender({ sender: currentUserId }, null)).toBe(false);
  });
});

describe("ChatLogics - isGroupRecieved", () => {
  const currentUserId = "user-123";
  const otherUserId = "user-456";
  const groupChat = { isGroupChat: true };
  const directChat = { isGroupChat: false };

  test("returns true only for incoming messages in group chats", () => {
    expect(isGroupRecieved({ sender: otherUserId }, groupChat, currentUserId)).toBe(true);
    expect(isGroupRecieved({ sender: { _id: otherUserId } }, groupChat, currentUserId)).toBe(true);
  });

  test("returns false for outgoing messages in group chats", () => {
    expect(isGroupRecieved({ sender: currentUserId }, groupChat, currentUserId)).toBe(false);
    expect(isGroupRecieved({ sender: { _id: currentUserId } }, groupChat, currentUserId)).toBe(false);
  });

  test("returns false for direct chats", () => {
    expect(isGroupRecieved({ sender: otherUserId }, directChat, currentUserId)).toBe(false);
    expect(isGroupRecieved({ sender: currentUserId }, directChat, currentUserId)).toBe(false);
  });
});

describe("ChatLogics - isLastMessage", () => {
  test("returns true for first message or when sender changes", () => {
    const messages = [
      { sender: { _id: "u1" } },
      { sender: { _id: "u1" } },
      { sender: { _id: "u2" } },
    ];

    expect(isLastMessage(messages, messages[0], 0)).toBe(true);
    expect(isLastMessage(messages, messages[1], 1)).toBe(false);
    expect(isLastMessage(messages, messages[2], 2)).toBe(true);
  });
});

describe("ChatLogics - getSender and getSenderProfilePic", () => {
  const userA = { _id: "u1", username: "Alice", profilePic: "alice.png" };
  const userB = { _id: "u2", username: "Bob", profilePic: "bob.png" };
  const users = [userA, userB];

  test("getSender returns peer username", () => {
    expect(getSender(userA, users)).toBe("Bob");
    expect(getSender("u1", users)).toBe("Bob");
    expect(getSender(userB, users)).toBe("Alice");
    expect(getSender("u2", users)).toBe("Alice");
  });

  test("getSenderProfilePic returns peer profile pic", () => {
    expect(getSenderProfilePic(userA, users)).toBe("bob.png");
    expect(getSenderProfilePic(userB, users)).toBe("alice.png");
  });

  test("getSenderFull returns peer user object", () => {
    expect(getSenderFull(userA, users)).toEqual(userB);
    expect(getSenderFull(userB, users)).toEqual(userA);
  });
});
