import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import UserInfo from "./UserInfo";
import { ChatState } from "../context/ChatProvider";

jest.mock("../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}));

describe("UserInfo - Theme Toggle", () => {
  const mockUser = { username: "Alice", profilePic: "alice.png" };

  test("renders theme toggle button and calls toggleTheme on click", () => {
    const toggleThemeMock = jest.fn();
    ChatState.mockReturnValue({
      user: mockUser,
      logout: jest.fn(),
      theme: "light",
      toggleTheme: toggleThemeMock,
    });

    render(<UserInfo onOpenSettings={jest.fn()} onCreateGroup={jest.fn()} />);

    const themeBtn = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(themeBtn).toBeInTheDocument();

    fireEvent.click(themeBtn);
    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
  });

  test("displays appropriate label when in dark mode", () => {
    ChatState.mockReturnValue({
      user: mockUser,
      logout: jest.fn(),
      theme: "dark",
      toggleTheme: jest.fn(),
    });

    render(<UserInfo onOpenSettings={jest.fn()} onCreateGroup={jest.fn()} />);

    const themeBtn = screen.getByRole("button", { name: /switch to light mode/i });
    expect(themeBtn).toBeInTheDocument();
  });
});
