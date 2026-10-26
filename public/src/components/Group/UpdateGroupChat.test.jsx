import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({ data: [] }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
}));

jest.mock("../../context/ChatProvider", () => ({
  ChatState: jest.fn(),
}));

import UpdateGroupChat from "./UpdateGroupChat";
import { ChatState } from "../../context/ChatProvider";

describe("UpdateGroupChat Component", () => {
  const mockUser = { _id: "user1", username: "Alice", token: "tok123" };
  const mockChat = {
    _id: "chat123",
    chatName: "Dev Team",
    isGroupChat: true,
    groupPic: "default-group.svg",
    groupAdmins: [{ _id: "user1", username: "Alice" }],
    users: [
      { _id: "user1", username: "Alice", profilePic: "alice.png" },
      { _id: "user2", username: "Bob", profilePic: "bob.png" },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ChatState.mockReturnValue({
      selectedChat: mockChat,
      setSelectedChat: jest.fn(),
      user: mockUser,
    });
  });

  test("renders group-details close button with accessible label and closes modal on click", () => {
    const setModalActiveMock = jest.fn();

    render(
      <UpdateGroupChat
        fetchAgain={false}
        setFetchAgain={jest.fn()}
        setModalActive={setModalActiveMock}
        onLeaveGroup={jest.fn()}
      />
    );

    // Close button should be present in top-right corner with accessible label
    const closeBtn = screen.getByRole("button", { name: /close group details/i });
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn).toHaveClass("close-button");

    // Clicking close button invokes setModalActive('not')
    fireEvent.click(closeBtn);
    expect(setModalActiveMock).toHaveBeenCalledWith("not");
  });
});
