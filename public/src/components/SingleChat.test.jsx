import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SingleChat from "./SingleChat";
import { ChatState } from "../context/ChatProvider";

// Mock ChatState
jest.mock("../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

// Mock axios
jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({ data: [] }),
  put: jest.fn(),
}));

describe("SingleChat message alignment and wrappers", () => {
  const mockUser = { _id: "userA", username: "Alice" };
  const mockSocket = { current: { on: jest.fn(), off: jest.fn(), emit: jest.fn(), connected: false } };

  beforeEach(() => {
    ChatState.mockReturnValue({ user: mockUser });
  });

  test("renders outgoing messages with .outgoing and incoming with .incoming", async () => {
    const selectedChat = {
      _id: "chat123",
      isGroupChat: false,
      users: [mockUser, { _id: "userB", username: "Bob" }],
    };

    const messages = [
      {
        _id: "m1",
        sender: { _id: "userA", username: "Alice" },
        content: "Hello from Alice",
        attachment: "",
        createdAt: "2026-10-26T12:00:00.000Z",
      },
      {
        _id: "m2",
        sender: { _id: "userB", username: "Bob" },
        content: "Hello from Bob",
        attachment: "",
        createdAt: "2026-10-26T12:01:00.000Z",
      },
    ];

    const axios = require("axios");
    axios.get.mockResolvedValueOnce({ data: messages });

    render(
      <SingleChat
        selectedChat={selectedChat}
        socket={mockSocket}
        fetchAgain={false}
        setFetchAgain={jest.fn()}
      />
    );

    const m1Content = await screen.findByText("Hello from Alice");
    const m2Content = await screen.findByText("Hello from Bob");

    // Check message wrappers
    const m1Wrapper = m1Content.closest(".message-wrapper");
    const m2Wrapper = m2Content.closest(".message-wrapper");

    expect(m1Wrapper.classList.contains("outgoing")).toBe(true);
    expect(m1Wrapper.classList.contains("incoming")).toBe(false);

    expect(m2Wrapper.classList.contains("incoming")).toBe(true);
    expect(m2Wrapper.classList.contains("outgoing")).toBe(false);

    // Check message bubble classes
    const m1Bubble = m1Content.closest(".message");
    const m2Bubble = m2Content.closest(".message");

    expect(m1Bubble.classList.contains("sended")).toBe(true);
    expect(m2Bubble.classList.contains("recieved")).toBe(true);
  });

  test("renders group chat messages with correct alignment and incoming sender info", async () => {
    const selectedChat = {
      _id: "group123",
      isGroupChat: true,
      chatName: "Dev Team",
      users: [mockUser, { _id: "userB", username: "Bob" }],
    };

    const messages = [
      {
        _id: "gm1",
        sender: { _id: "userB", username: "Bob", profilePic: "bob.png" },
        content: "Group msg from Bob",
        attachment: "",
        createdAt: "2026-10-26T12:00:00.000Z",
      },
      {
        _id: "gm2",
        sender: { _id: "userA", username: "Alice" },
        content: "Group msg from Alice",
        attachment: "",
        createdAt: "2026-10-26T12:01:00.000Z",
      },
    ];

    const axios = require("axios");
    axios.get.mockResolvedValueOnce({ data: messages });

    render(
      <SingleChat
        selectedChat={selectedChat}
        socket={mockSocket}
        fetchAgain={false}
        setFetchAgain={jest.fn()}
      />
    );

    const gm1Content = await screen.findByText("Group msg from Bob");
    const gm2Content = await screen.findByText("Group msg from Alice");

    const gm1Wrapper = gm1Content.closest(".message-wrapper");
    const gm2Wrapper = gm2Content.closest(".message-wrapper");

    // Bob is incoming
    expect(gm1Wrapper.classList.contains("incoming")).toBe(true);
    expect(screen.getByText("Bob")).toBeInTheDocument();

    // Alice is outgoing
    expect(gm2Wrapper.classList.contains("outgoing")).toBe(true);
    expect(gm2Content.closest(".message").classList.contains("sended")).toBe(true);
  });
});
