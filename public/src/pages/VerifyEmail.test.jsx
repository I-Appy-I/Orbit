import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock axios before any imports that might use it
jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
}));

const axios = require("axios");

import VerifyEmail from "./VerifyEmail";
import Register from "../components/Authorization/Register";
import { broadcastAuthEvent, subscribeToAuthEvents } from "../utils/authBroadcast";

describe("Email Verification Code Flow & Cross-Tab Redirection", () => {
  let originalBroadcastChannel;
  let channels = {};

  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      if (!channels[name]) channels[name] = new Set();
      channels[name].add(this);
      this.onmessage = null;
    }
    postMessage(data) {
      if (channels[this.name]) {
        channels[this.name].forEach((ch) => {
          if (ch !== this && typeof ch.onmessage === "function") {
            ch.onmessage({ data });
          }
        });
      }
    }
    close() {
      if (channels[this.name]) {
        channels[this.name].delete(this);
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    channels = {};
    originalBroadcastChannel = global.BroadcastChannel;
    global.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    global.BroadcastChannel = originalBroadcastChannel;
  });

  describe("authBroadcast utility", () => {
    it("should broadcast and receive events via BroadcastChannel", () => {
      const received = [];
      const unsubscribe = subscribeToAuthEvents((msg) => received.push(msg));

      broadcastAuthEvent({ type: "ORBIT_EMAIL_VERIFIED", email: "user@example.com" });

      expect(received.length).toBe(1);
      expect(received[0].type).toBe("ORBIT_EMAIL_VERIFIED");
      expect(received[0].email).toBe("user@example.com");
      expect(received[0]).not.toHaveProperty("code");
      expect(received[0]).not.toHaveProperty("password");

      unsubscribe();
    });

    it("should fallback to localStorage storage event when BroadcastChannel is unavailable", () => {
      delete global.BroadcastChannel;

      const received = [];
      const unsubscribe = subscribeToAuthEvents((msg) => received.push(msg));

      act(() => {
        const storageEvent = new StorageEvent("storage", {
          key: "orbit_auth_event",
          newValue: JSON.stringify({
            type: "ORBIT_EMAIL_VERIFIED",
            email: "user@example.com",
            _timestamp: Date.now(),
          }),
        });
        window.dispatchEvent(storageEvent);
      });

      expect(received.length).toBe(1);
      expect(received[0].type).toBe("ORBIT_EMAIL_VERIFIED");
      expect(received[0].email).toBe("user@example.com");

      unsubscribe();
    });

    it("should clean up event listeners on unsubscribe", () => {
      delete global.BroadcastChannel;
      const removeSpy = jest.spyOn(window, "removeEventListener");

      const unsubscribe = subscribeToAuthEvents(() => {});
      unsubscribe();

      expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  describe("VerifyEmail component (Legacy handling)", () => {
    it("should display legacy code notice when visited with legacy query param", () => {
      render(
        <MemoryRouter initialEntries={["/verify-email?legacy=true"]}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText(/Verification Code Required/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Go to Sign In/i })).toBeInTheDocument();
    });
  });

  describe("Original Tab 6-Digit Code Verification Flow", () => {
    it("should allow the user to complete verification in the original tab by entering the 6-digit code", async () => {
      const isLoginActiveMock = jest.fn();

      const { container } = render(
        <MemoryRouter initialEntries={["/register"]}>
          <Routes>
            <Route
              path="/register"
              element={<Register isLoginActive={isLoginActiveMock} />}
            />
            <Route path="/auth" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      axios.post.mockResolvedValueOnce({
        data: {
          status: true,
          email: "codeuser@example.com",
          emailVerified: false,
          msg: "Registration successful! A 6-digit verification code has been sent to your email.",
        },
      });

      // Fill in and submit the registration form
      const usernameInput = container.querySelector('input[name="username"]');
      const emailInput = container.querySelector('input[name="email"]');
      const passInput = container.querySelector('input[name="password"]');
      const confirmInput = container.querySelector('input[name="confirmPassword"]');
      const form = container.querySelector("form.signup");

      fireEvent.change(usernameInput, { target: { name: "username", value: "codeuser" } });
      fireEvent.change(emailInput, { target: { name: "email", value: "codeuser@example.com" } });
      fireEvent.change(passInput, { target: { name: "password", value: "password123" } });
      fireEvent.change(confirmInput, { target: { name: "confirmPassword", value: "password123" } });

      await act(async () => {
        fireEvent.submit(form);
      });

      // Verify that the user stays on the original page with the 6-digit code form
      await waitFor(() => {
        expect(screen.getByText(/Enter Verification Code/i)).toBeInTheDocument();
      });
      expect(screen.getByText("codeuser@example.com")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();

      // Enter the 6-digit code received in email
      const codeInput = screen.getByPlaceholderText("000000");
      fireEvent.change(codeInput, { target: { value: "482910" } });
      expect(codeInput.value).toBe("482910");

      // Mock backend verification success
      axios.post.mockResolvedValueOnce({
        data: {
          status: true,
          msg: "Email verified successfully! You can now log in.",
        },
      });

      // Click "Verify Code" button
      const verifyBtn = screen.getByRole("button", { name: /Verify Code/i });
      await act(async () => {
        fireEvent.click(verifyBtn);
      });

      // User automatically navigates to login in that same tab
      await waitFor(() => {
        expect(isLoginActiveMock).toHaveBeenCalledWith("yes");
      });
    });

    it("should display error message in original tab when code is incorrect", async () => {
      const isLoginActiveMock = jest.fn();

      const { container } = render(
        <MemoryRouter initialEntries={["/register"]}>
          <Routes>
            <Route
              path="/register"
              element={<Register isLoginActive={isLoginActiveMock} />}
            />
          </Routes>
        </MemoryRouter>
      );

      axios.post.mockResolvedValueOnce({
        data: {
          status: true,
          email: "codeuser@example.com",
          emailVerified: false,
          msg: "Registration successful!",
        },
      });

      // Register
      const usernameInput = container.querySelector('input[name="username"]');
      const emailInput = container.querySelector('input[name="email"]');
      const passInput = container.querySelector('input[name="password"]');
      const confirmInput = container.querySelector('input[name="confirmPassword"]');
      const form = container.querySelector("form.signup");

      fireEvent.change(usernameInput, { target: { name: "username", value: "codeuser" } });
      fireEvent.change(emailInput, { target: { name: "email", value: "codeuser@example.com" } });
      fireEvent.change(passInput, { target: { name: "password", value: "password123" } });
      fireEvent.change(confirmInput, { target: { name: "confirmPassword", value: "password123" } });

      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByText(/Enter Verification Code/i)).toBeInTheDocument();
      });

      // Enter wrong 6-digit code
      const codeInput = screen.getByPlaceholderText("000000");
      fireEvent.change(codeInput, { target: { value: "000000" } });

      // Mock backend returning incorrect code error
      axios.post.mockRejectedValueOnce({
        response: {
          data: {
            status: false,
            error: "incorrect_code",
            remainingAttempts: 4,
            msg: "Incorrect verification code. 4 attempts remaining.",
          },
        },
      });

      const verifyBtn = screen.getByRole("button", { name: /Verify Code/i });
      await act(async () => {
        fireEvent.click(verifyBtn);
      });

      await waitFor(() => {
        const errorElements = screen.getAllByText(/4 attempts remaining/i);
        expect(errorElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
