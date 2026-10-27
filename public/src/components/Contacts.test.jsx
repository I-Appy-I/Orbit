import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";
import { toast } from "react-toastify";
import Contacts from "./Contacts";
import { ChatState } from "../context/ChatProvider";

jest.mock("axios");
jest.mock("react-toastify", () => ({
  ToastContainer: () => <div data-testid="toast-container" />,
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

jest.mock("./Avatar", () => ({ alt }) => <div data-testid="avatar">{alt}</div>);

describe("Contacts Component - Empty State and Loading Handling", () => {
  const mockUser = {
    _id: "user123",
    username: "newuser",
    email: "newuser@example.com",
    token: "mock-jwt-token",
  };
  let mockSetChats;
  let mockSetSelectedChat;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetChats = jest.fn();
    mockSetSelectedChat = jest.fn();
  });

  test("a newly registered user with zero conversations finishes loading and displays empty state without error", async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    ChatState.mockReturnValue({
      user: mockUser,
      chats: [],
      setChats: mockSetChats,
      selectedChat: null,
      setSelectedChat: mockSetSelectedChat,
    });

    render(<Contacts fetchAgain={false} selectedChat={null} socket={{ current: null }} />);

    await waitFor(() => {
      expect(screen.getByText(/your chat list is empty/i)).toBeInTheDocument();
    });

    // No "Failed to load the chats" error toast
    expect(toast.error).not.toHaveBeenCalledWith("Failed to load the chats", expect.anything());
    // Loading spinner should not be present
    expect(screen.queryByLabelText(/loading chats/i)).not.toBeInTheDocument();
  });

  test("handles genuine API failure: stops loading spinner and displays toast error", async () => {
    axios.get.mockRejectedValueOnce(new Error("Server error"));

    ChatState.mockReturnValue({
      user: mockUser,
      chats: [],
      setChats: mockSetChats,
      selectedChat: null,
      setSelectedChat: mockSetSelectedChat,
    });

    render(<Contacts fetchAgain={false} selectedChat={null} socket={{ current: null }} />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load the chats", expect.anything());
    });

    // Spinner should not be left spinning indefinitely
    expect(screen.queryByLabelText(/loading chats/i)).not.toBeInTheDocument();
  });

  test("renders conversations list when user has active chats", async () => {
    const mockChats = [
      {
        _id: "chat1",
        chatName: "Alice",
        isGroupChat: false,
        users: [
          mockUser,
          { _id: "user456", username: "Alice", profilePic: "alice.png" },
        ],
        latestMessage: {
          sender: { username: "Alice" },
          content: "Hello there!",
          createdAt: "2026-10-27T10:00:00.000Z",
        },
      },
    ];

    axios.get.mockResolvedValueOnce({ data: mockChats });

    ChatState.mockReturnValue({
      user: mockUser,
      chats: mockChats,
      setChats: mockSetChats,
      selectedChat: null,
      setSelectedChat: mockSetSelectedChat,
    });

    render(<Contacts fetchAgain={false} selectedChat={null} socket={{ current: null }} />);

    await waitFor(() => {
      expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/hello there!/i)).toBeInTheDocument();
    expect(screen.queryByText(/your chat list is empty/i)).not.toBeInTheDocument();
  });
});
