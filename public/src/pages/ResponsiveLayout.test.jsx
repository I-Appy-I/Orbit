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
import VerifyEmail from "./VerifyEmail";
import { ChatState } from "../context/ChatProvider";
import { io } from "socket.io-client";

describe("Responsive Layout & Authorization Rendering Tests", () => {
  const mockUser = { _id: "user1", username: "Alice", email: "alice@example.com", token: "mock-token" };

  beforeEach(() => {
    jest.clearAllMocks();
    io.mockImplementation(() => ({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    }));
    ChatState.mockReturnValue({
      user: mockUser,
      setUser: jest.fn(),
      logout: jest.fn(),
      selectedChat: null,
      setSelectedChat: jest.fn(),
      setChats: jest.fn(),
      theme: "light",
      toggleTheme: jest.fn(),
    });
  });

  describe("Registration Page Form & Elements", () => {
    it("renders all registration fields, buttons, and switches in Register mode", () => {
      const { container } = render(
        <MemoryRouter>
          <Authorization initialMode="no" />
        </MemoryRouter>
      );

      // Verify page wrapper structure
      const authContainer = container.querySelector(".auth");
      expect(authContainer).toBeInTheDocument();
      const authWrapper = container.querySelector(".auth-wrapper");
      expect(authWrapper).toBeInTheDocument();
      const formContainer = container.querySelector(".form-container");
      expect(formContainer).toBeInTheDocument();

      // Brand
      expect(screen.getByText("Orbit")).toBeInTheDocument();

      // Title & Subtitle
      expect(screen.getByText("Create account")).toBeInTheDocument();
      expect(screen.getByText("Join and start chatting today")).toBeInTheDocument();

      // All 5 input fields are present and reachable
      const usernameInput = screen.getByPlaceholderText("Enter your name");
      expect(usernameInput).toBeInTheDocument();
      expect(usernameInput).toHaveAttribute("id", "reg-username");

      const emailInput = screen.getByPlaceholderText("Enter your email");
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute("id", "reg-email");

      const passwordInput = screen.getByPlaceholderText("Password");
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute("id", "reg-password");
      expect(passwordInput).toHaveAttribute("type", "password");

      const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");
      expect(confirmPasswordInput).toBeInTheDocument();
      expect(confirmPasswordInput).toHaveAttribute("id", "reg-confirm-password");
      expect(confirmPasswordInput).toHaveAttribute("type", "password");

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute("id", "reg-profile-pic");

      // Submit button is present
      const submitBtn = screen.getByRole("button", { name: /create user/i });
      expect(submitBtn).toBeInTheDocument();
      expect(submitBtn).toHaveAttribute("id", "reg-submit");

      // Switch to Login button is present
      const loginLink = screen.getByRole("button", { name: /login now/i });
      expect(loginLink).toBeInTheDocument();
    });

    it("allows toggling password visibility on both password fields", () => {
      const { container } = render(
        <MemoryRouter>
          <Authorization initialMode="no" />
        </MemoryRouter>
      );

      const passwordInput = screen.getByPlaceholderText("Password");
      const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

      expect(passwordInput).toHaveAttribute("type", "password");
      expect(confirmPasswordInput).toHaveAttribute("type", "password");

      const passwordIcons = container.querySelectorAll(".password-icon");
      expect(passwordIcons.length).toBeGreaterThanOrEqual(2);

      // Toggle first password field
      fireEvent.click(passwordIcons[0]);
      expect(passwordInput).toHaveAttribute("type", "text");

      // Toggle confirm password field
      fireEvent.click(passwordIcons[1]);
      expect(confirmPasswordInput).toHaveAttribute("type", "text");
    });

    it("switches to Login form when 'Login Now' is clicked", () => {
      render(
        <MemoryRouter>
          <Authorization initialMode="no" />
        </MemoryRouter>
      );

      expect(screen.getByText("Create account")).toBeInTheDocument();

      const loginLink = screen.getByRole("button", { name: /login now/i });
      fireEvent.click(loginLink);

      expect(screen.getByText("Welcome back")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
    });
  });

  describe("Login Page Form & Elements", () => {
    it("renders login fields, submit button, and 'Create One' link", () => {
      render(
        <MemoryRouter>
          <Authorization initialMode="yes" />
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

  describe("OTP Verification Page Narrow Screen Layout", () => {
    it("renders 6 distinct numeric OTP input boxes and navigation controls", () => {
      ChatState.mockReturnValue({
        user: mockUser,
        setUser: jest.fn(),
      });

      const { container } = render(
        <MemoryRouter initialEntries={["/verify-email?mode=email-change&email=new@example.com"]}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify OTP boxes container
      const otpGroup = container.querySelector(".otp-input-group");
      expect(otpGroup).toBeInTheDocument();

      const otpBoxes = container.querySelectorAll(".otp-box");
      expect(otpBoxes.length).toBe(6);

      // Verify action buttons
      expect(screen.getByRole("button", { name: /verify code/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend code/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel & return to profile/i })).toBeInTheDocument();
    });
  });
});
