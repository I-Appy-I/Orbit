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

describe("UpdateProfile - Direct Email Update", () => {
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

  it("should update email directly, save to localStorage, update state, and close edit form without navigating to /verify-email", async () => {
    const mockOnClose = jest.fn();
    const updatedUserData = {
      _id: "user123",
      username: "alice",
      email: "alice_new@example.com",
      profilePic: "",
      isAdmin: false,
      token: "new_jwt_token_456",
    };
    axios.put.mockResolvedValueOnce({
      data: {
        status: true,
        msg: "Email updated successfully!",
        updatedUser: updatedUserData,
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
      expect(mockSetUser).toHaveBeenCalledWith(updatedUserData);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Edit input should be closed
    expect(screen.queryByPlaceholderText("alice@example.com")).not.toBeInTheDocument();
  });

  it("should stay on email-edit form when backend request fails", async () => {
    const mockOnClose = jest.fn();
    axios.put.mockRejectedValueOnce({
      response: {
        data: {
          status: false,
          msg: "The email is already used",
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
    fireEvent.change(input, { target: { value: "alice_dup@example.com" } });

    const saveBtn = screen.getByRole("button", { name: /Save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // User stays on the edit form
    expect(screen.getByPlaceholderText("alice@example.com")).toBeInTheDocument();
  });
});
