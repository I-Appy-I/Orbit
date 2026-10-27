import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
}));

const axios = require("axios");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const mockUser = {
  _id: "user123",
  username: "alice",
  email: "alice@example.com",
  profilePic: "",
  isAdmin: false,
  token: "jwt_token_123",
};

const mockSetUser = jest.fn();

jest.mock("../context/ChatProvider", () => ({
  ChatState: () => ({
    user: mockUser,
    setUser: mockSetUser,
    logout: jest.fn(),
  }),
}));

import UpdateProfile from "./UpdateProfile";

describe("UpdateProfile - Email Change Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_LOCALHOST_KEY = "chat_app_user";
  });

  it("should open email edit form when Update button is clicked", () => {
    render(
      <MemoryRouter>
        <UpdateProfile fetchAgain={false} setFetchAgain={jest.fn()} onClose={jest.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText("Email:")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    const updateBtns = screen.getAllByRole("button", { name: /Update/i });
    // Click update beside email (second update button)
    fireEvent.click(updateBtns[1]);

    expect(screen.getByPlaceholderText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
  });

  it("should reject same email address without calling backend", async () => {
    render(
      <MemoryRouter>
        <UpdateProfile fetchAgain={false} setFetchAgain={jest.fn()} onClose={jest.fn()} />
      </MemoryRouter>
    );

    const updateBtns = screen.getAllByRole("button", { name: /Update/i });
    fireEvent.click(updateBtns[1]);

    const input = screen.getByPlaceholderText("alice@example.com");
    fireEvent.change(input, { target: { value: "alice@example.com" } });

    const saveBtn = screen.getByRole("button", { name: /Save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(axios.put).not.toHaveBeenCalled();
    // Edit input stays visible
    expect(screen.getByPlaceholderText("alice@example.com")).toBeInTheDocument();
  });

  it("should send verification request and navigate to /verify-email on success", async () => {
    const mockOnClose = jest.fn();
    axios.put.mockResolvedValueOnce({
      data: {
        status: true,
        msg: "A 6-digit verification code has been sent to your new email address.",
        pendingEmail: "alice_new@example.com",
      },
    });

    render(
      <MemoryRouter>
        <UpdateProfile fetchAgain={false} setFetchAgain={jest.fn()} onClose={mockOnClose} />
      </MemoryRouter>
    );

    const updateBtns = screen.getAllByRole("button", { name: /Update/i });
    fireEvent.click(updateBtns[1]);

    const input = screen.getByPlaceholderText("alice@example.com");
    fireEvent.change(input, { target: { value: "alice_new@example.com" } });

    const saveBtn = screen.getByRole("button", { name: /Save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/emailUpdate"),
      { newEmail: "alice_new@example.com" },
      { headers: { Authorization: "Bearer jwt_token_123" } }
    );

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(
        "/verify-email?mode=email-change&email=alice_new%40example.com"
      );
    });
  });

  it("should stay on email-edit form when backend request fails", async () => {
    const mockOnClose = jest.fn();
    axios.put.mockRejectedValueOnce({
      response: {
        data: {
          status: false,
          msg: "Failed to send verification code. Please check the address or try again later.",
        },
      },
    });

    render(
      <MemoryRouter>
        <UpdateProfile fetchAgain={false} setFetchAgain={jest.fn()} onClose={mockOnClose} />
      </MemoryRouter>
    );

    const updateBtns = screen.getAllByRole("button", { name: /Update/i });
    fireEvent.click(updateBtns[1]);

    const input = screen.getByPlaceholderText("alice@example.com");
    fireEvent.change(input, { target: { value: "alice_smtp_fail@example.com" } });

    const saveBtn = screen.getByRole("button", { name: /Save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // CRITICAL: User stays on the edit form
    expect(screen.getByPlaceholderText("alice@example.com")).toBeInTheDocument();
  });
});
