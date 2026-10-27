import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock axios
jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({ data: [] }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
}));

// Mock socket.io-client
jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  })),
}));

// Mock child components
jest.mock("../components/Contacts", () => () => <div data-testid="contacts-component">Contacts</div>);
jest.mock("../components/ChatContainer", () => () => <div data-testid="chat-container-component">Chat Container</div>);
jest.mock("../components/UpdateProfile", () => () => <div data-testid="update-profile-component">Update Profile</div>);
jest.mock("../components/Group/CreateGroupChat", () => () => <div>Create Group Modal</div>);

// Mock ChatProvider
jest.mock("../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

import Authorization from "./Authorization";
import Chat from "./Chat";
import { ChatState } from "../context/ChatProvider";
import { io } from "socket.io-client";

const mockUser = {
  _id: "user_test_123",
  username: "alice",
  email: "alice@example.com",
  profilePic: "avatar.png",
  isAdmin: false,
  token: "mock_jwt_token",
};

describe("Responsive Layout Regressions & Viewport Sizing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    io.mockImplementation(() => ({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    }));
  });

  describe("Authorization & Registration Viewport Sizing", () => {
    it("renders the login view with proper form elements", () => {
      ChatState.mockReturnValue({
        user: undefined,
        setUser: jest.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/auth"]}>
          <Routes>
            <Route path="/auth" element={<Authorization initialMode="yes" />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Welcome back")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();

      const submitBtn = screen.getByRole("button", { name: /log in/i });
      expect(submitBtn).toBeInTheDocument();

      const registerLink = screen.getByRole("button", { name: /create one/i });
      expect(registerLink).toBeInTheDocument();

      // Click Create One -> switches to Register
      fireEvent.click(registerLink);
      expect(screen.getByText("Create account")).toBeInTheDocument();
    });
  });

  describe("Chat Layout Responsive State Classes", () => {
    it("applies 'has-selected-chat' when a conversation is active", () => {
      ChatState.mockReturnValue({
        selectedChat: { _id: "chat123", isGroupChat: false, users: [mockUser] },
        user: mockUser,
        setUser: jest.fn(),
        logout: jest.fn(),
        setChats: jest.fn(),
        setSelectedChat: jest.fn(),
        theme: "light",
      });

      const { container } = render(
        <MemoryRouter>
          <Chat />
        </MemoryRouter>
      );

      const chatBox = container.querySelector(".chat-box");
      expect(chatBox).toHaveClass("has-selected-chat");
      expect(chatBox).not.toHaveClass("has-profile-open");
    });

    it("applies 'has-profile-open' when profile settings are opened", () => {
      ChatState.mockReturnValue({
        selectedChat: undefined,
        user: mockUser,
        setUser: jest.fn(),
        logout: jest.fn(),
        setChats: jest.fn(),
        setSelectedChat: jest.fn(),
        theme: "light",
      });

      const { container } = render(
        <MemoryRouter initialEntries={["/?openProfile=true"]}>
          <Routes>
            <Route path="/" element={<Chat />} />
          </Routes>
        </MemoryRouter>
      );

      const chatBox = container.querySelector(".chat-box");
      expect(chatBox).toHaveClass("has-profile-open");
      expect(chatBox).not.toHaveClass("has-selected-chat");
      expect(screen.getByTestId("update-profile-component")).toBeInTheDocument();
    });
  });

  describe("Registration Form Responsive Structure", () => {
    it("renders create account fields properly in register mode", () => {
      ChatState.mockReturnValue({
        user: undefined,
        setUser: jest.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/register"]}>
          <Routes>
            <Route path="/register" element={<Authorization initialMode="no" />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText("Create account")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Confirm Password")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create user/i })).toBeInTheDocument();
    });
  });
});
