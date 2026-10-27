import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock axios before any imports that might use it
jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({ data: [] }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
}));

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

jest.mock("../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

jest.mock("../components/Contacts", () => () => <div data-testid="contacts-component">Contacts List</div>);
jest.mock("../components/ChatContainer", () => () => <div data-testid="chat-container-component">Chat Container</div>);
jest.mock("../components/UpdateProfile", () => () => <div>Update Profile Modal</div>);
jest.mock("../components/Group/CreateGroupChat", () => () => <div>Create Group Modal</div>);

// Import Chat after mocks
import Chat from "./Chat";
import { ChatState } from "../context/ChatProvider";
import { MemoryRouter } from "react-router-dom";
import { io } from "socket.io-client";

const renderChat = () => render(
  <MemoryRouter>
    <Chat />
  </MemoryRouter>
);

describe("Chat component - Search Navigation", () => {
  const mockUser = { _id: "user1", username: "Alice", token: "mock-token" };
  const axios = require("axios");

  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockResolvedValue({ data: {} });
    io.mockImplementation(() => ({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    }));
    ChatState.mockReturnValue({
      user: mockUser,
      selectedChat: null,
      logout: jest.fn(),
      setChats: jest.fn(),
      setSelectedChat: jest.fn(),
      theme: "light",
      toggleTheme: jest.fn(),
    });
  });

  test("entering search query, submitting, then clicking back arrow clears input and restores contacts", async () => {
    let resolveSearch;
    const searchPromise = new Promise((resolve) => {
      resolveSearch = resolve;
    });
    axios.get.mockReturnValueOnce(searchPromise);

    renderChat();

    // Initially, contacts list is visible
    expect(screen.getByTestId("contacts-component")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search or start new chat/i);
    fireEvent.change(searchInput, { target: { value: "bob" } });
    expect(searchInput.value).toBe("bob");

    // Submit search form
    const submitBtn = screen.getByRole("button", { name: /submit search/i });
    fireEvent.click(submitBtn);

    // Now in search mode: back button should be visible
    const backBtn = await screen.findByRole("button", { name: /back to contacts/i });
    expect(backBtn).toBeInTheDocument();

    // Resolve search request with results
    resolveSearch({ data: [{ _id: "u2", username: "bob" }] });
    await screen.findByText("bob");

    // Click back arrow to exit search
    fireEvent.click(backBtn);

    // Search input should be cleared
    expect(searchInput.value).toBe("");

    // Normal contacts list is restored
    await waitFor(() => {
      expect(screen.getByTestId("contacts-component")).toBeInTheDocument();
    });
    expect(screen.queryByText("bob")).not.toBeInTheDocument();
  });

  test("clicking clear (X) button clears input, exits search mode, and restores contacts", async () => {
    axios.get.mockResolvedValueOnce({ data: [{ _id: "u2", username: "bob" }] });

    renderChat();

    const searchInput = screen.getByPlaceholderText(/search or start new chat/i);
    fireEvent.change(searchInput, { target: { value: "bob" } });

    // Submit search
    fireEvent.submit(searchInput.closest("form"));

    await screen.findByText("bob");

    // Clear (X) button is present
    const clearBtn = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clearBtn);

    expect(searchInput.value).toBe("");
    expect(screen.getByTestId("contacts-component")).toBeInTheDocument();
    expect(screen.queryByText("bob")).not.toBeInTheDocument();
  });

  test("canceling/clearing search ignores in-flight search responses", async () => {
    let resolveSearch;
    const pendingSearchPromise = new Promise((resolve) => {
      resolveSearch = resolve;
    });
    axios.get.mockReturnValueOnce(pendingSearchPromise);

    renderChat();

    const searchInput = screen.getByPlaceholderText(/search or start new chat/i);
    fireEvent.change(searchInput, { target: { value: "delayedUser" } });
    fireEvent.submit(searchInput.closest("form"));

    const backBtn = await screen.findByRole("button", { name: /back to contacts/i });

    // User clicks back BEFORE the delayed search finishes
    fireEvent.click(backBtn);

    expect(searchInput.value).toBe("");
    expect(screen.getByTestId("contacts-component")).toBeInTheDocument();

    // Now delayed search resolves
    resolveSearch({ data: [{ _id: "delayedId", username: "delayedUser" }] });

    // Stale result should NOT appear in DOM
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("delayedUser")).not.toBeInTheDocument();
    expect(screen.getByTestId("contacts-component")).toBeInTheDocument();
  });

  test("clicking hamburger menu button opens navigation drawer and renders menu options", async () => {
    renderChat();

    // Hamburger button should be in top header
    const hamburgerBtn = screen.getByRole("button", { name: /open menu/i });
    expect(hamburgerBtn).toBeInTheDocument();

    // Drawer is closed initially
    expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();

    // Click hamburger button to open drawer
    fireEvent.click(hamburgerBtn);

    // Drawer should now be visible with navigation items
    const drawer = await screen.findByRole("dialog", { name: /navigation menu/i });
    expect(drawer).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /my profile/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new group/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();

    // Clicking overlay closes drawer
    const overlay = screen.getByTestId("drawer-overlay");
    fireEvent.click(overlay);
    expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();
  });

  test("receiving 'user updated' socket event updates matching user in chats and selectedChat", () => {
    let socketHandlers = {};
    io.mockImplementation(() => ({
      on: jest.fn((event, cb) => {
        socketHandlers[event] = cb;
      }),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    }));

    const mockSetChats = jest.fn();
    const mockSetSelectedChat = jest.fn();
    const mockSetUser = jest.fn();

    ChatState.mockReturnValue({
      user: mockUser,
      setUser: mockSetUser,
      selectedChat: {
        _id: "c1",
        isGroupChat: true,
        chatName: "Team",
        users: [
          { _id: "user1", username: "Alice" },
          { _id: "user2", username: "BobOld" },
        ],
      },
      logout: jest.fn(),
      setChats: mockSetChats,
      setSelectedChat: mockSetSelectedChat,
      theme: "light",
      toggleTheme: jest.fn(),
    });

    renderChat();

    // Trigger 'user updated' event
    expect(socketHandlers["user updated"]).toBeDefined();
    socketHandlers["user updated"]({ userId: "user2", username: "BobNew" });

    // Verify setChats was called with updater function
    expect(mockSetChats).toHaveBeenCalled();
    const chatsUpdater = mockSetChats.mock.calls[0][0];
    const initialChats = [
      {
        _id: "c1",
        users: [
          { _id: "user1", username: "Alice" },
          { _id: "user2", username: "BobOld" },
        ],
        latestMessage: {
          sender: { _id: "user2", username: "BobOld" },
        },
      },
    ];
    const updatedChats = chatsUpdater(initialChats);
    expect(updatedChats[0].users[1].username).toBe("BobNew");
    expect(updatedChats[0].latestMessage.sender.username).toBe("BobNew");

    // Verify setSelectedChat was called with updater function
    expect(mockSetSelectedChat).toHaveBeenCalled();
    const selectedChatUpdater = mockSetSelectedChat.mock.calls[0][0];
    const updatedSelected = selectedChatUpdater({
      _id: "c1",
      users: [
        { _id: "user1", username: "Alice" },
        { _id: "user2", username: "BobOld" },
      ],
    });
    expect(updatedSelected.users[1].username).toBe("BobNew");
  });
  test("search with zero matches displays 'No users found' without error toast", async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    renderChat();

    const searchInput = screen.getByPlaceholderText(/search or start new chat/i);
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    fireEvent.submit(searchInput.closest("form"));

    await screen.findByText(/no users found/i);
    expect(screen.queryByText(/error in searching user/i)).not.toBeInTheDocument();
  });

  test("search failure displays 'Failed to load search results' and does not disguise error as empty", async () => {
    axios.get.mockRejectedValueOnce(new Error("Network Error"));

    renderChat();

    const searchInput = screen.getByPlaceholderText(/search or start new chat/i);
    fireEvent.change(searchInput, { target: { value: "errorUser" } });
    fireEvent.submit(searchInput.closest("form"));

    await screen.findByText(/failed to load search results/i);
    expect(screen.queryByText(/no users found/i)).not.toBeInTheDocument();
  });
});
