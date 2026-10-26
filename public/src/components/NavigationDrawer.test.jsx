import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import NavigationDrawer from "./NavigationDrawer";
import { ChatState } from "../context/ChatProvider";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

describe("NavigationDrawer Component", () => {
  const mockUser = { _id: "u1", username: "Alice", profilePic: "alice.png" };
  const mockLogout = jest.fn();
  const mockToggleTheme = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnOpenSettings = jest.fn();
  const mockOnCreateGroup = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    ChatState.mockReturnValue({
      user: mockUser,
      logout: mockLogout,
      theme: "light",
      toggleTheme: mockToggleTheme,
    });
  });

  test("does not render when isOpen is false", () => {
    const { container } = render(
      <NavigationDrawer
        isOpen={false}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders profile section and all navigation options when isOpen is true", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    // Profile card with username
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open profile settings/i })).toBeInTheDocument();

    // Menu options
    expect(screen.getByRole("button", { name: /my profile/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new group/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  test("clicking the backdrop overlay closes the drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const overlay = screen.getByTestId("drawer-overlay");
    fireEvent.click(overlay);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the drawer content does not close the drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    fireEvent.click(dialog);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  test("pressing Escape closes the drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("clicking profile section opens profile settings and closes drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const profileCard = screen.getByRole("button", { name: /open profile settings/i });
    fireEvent.click(profileCard);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
  });

  test("pressing Enter on profile section opens profile settings", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const profileCard = screen.getByRole("button", { name: /open profile settings/i });
    fireEvent.keyDown(profileCard, { key: "Enter" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
  });

  test("clicking My Profile button opens settings and closes drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const myProfileBtn = screen.getByRole("button", { name: /my profile/i });
    fireEvent.click(myProfileBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
  });

  test("clicking New Group button opens group creation and closes drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const newGroupBtn = screen.getByRole("button", { name: /new group/i });
    fireEvent.click(newGroupBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnCreateGroup).toHaveBeenCalledTimes(1);
  });

  test("clicking Night Mode button calls toggleTheme and closes drawer", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const themeBtn = screen.getByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(themeBtn);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("displays dark mode state correctly", () => {
    ChatState.mockReturnValue({
      user: mockUser,
      logout: mockLogout,
      theme: "dark",
      toggleTheme: mockToggleTheme,
    });

    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const themeBtn = screen.getByRole("button", { name: /switch to light mode/i });
    expect(themeBtn).toBeInTheDocument();
  });

  test("clicking Log Out invokes logout, closes drawer, and redirects to /auth", () => {
    render(
      <NavigationDrawer
        isOpen={true}
        onClose={mockOnClose}
        onOpenSettings={mockOnOpenSettings}
        onCreateGroup={mockOnCreateGroup}
      />
    );

    const logoutBtn = screen.getByRole("button", { name: /log out/i });
    fireEvent.click(logoutBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/auth", { replace: true });
  });
});
