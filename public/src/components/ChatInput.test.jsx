import { fireEvent, render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatInput from "./ChatInput";

test("a blocked conversation disables the composer and attachment controls", () => {
  const sendMessage = jest.fn();
  const setAttachment = jest.fn();
  const { container } = render(
    <ChatInput
      handleSendMsg={sendMessage}
      setNewAttach={setAttachment}
      newAttach={undefined}
      isSending={false}
      disabled
    />
  );

  expect(screen.getByPlaceholderText("Write a message...").disabled).toBe(true);
  expect(container.querySelector('input[type="file"]').disabled).toBe(true);
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);

  fireEvent.submit(container.querySelector("form"));
  expect(sendMessage).not.toHaveBeenCalled();
});

test("changing the active conversation clears an unsent draft", () => {
  const props = {
    handleSendMsg: jest.fn(),
    setNewAttach: jest.fn(),
    newAttach: undefined,
    isSending: false,
    disabled: false,
  };
  const { rerender } = render(<ChatInput {...props} conversationId="chat-one" />);
  const input = screen.getByPlaceholderText("Write a message...");
  fireEvent.change(input, { target: { value: "private draft" } });
  expect(input.value).toBe("private draft");

  rerender(<ChatInput {...props} conversationId="chat-two" />);
  expect(screen.getByPlaceholderText("Write a message...").value).toBe("");
});

test("hovering over emoji trigger opens picker on desktop and leaving closes it", () => {
  const props = {
    handleSendMsg: jest.fn(),
    setNewAttach: jest.fn(),
    newAttach: undefined,
    isSending: false,
    disabled: false,
  };
  const { container } = render(<ChatInput {...props} />);

  const emojiWrapper = container.querySelector(".emoji-picker-wrapper");
  expect(emojiWrapper).toBeInTheDocument();

  // Initially closed
  expect(screen.queryByRole("dialog", { name: /emoji picker/i })).not.toBeInTheDocument();

  // Hover over with mouse / desktop pointer
  fireEvent.pointerEnter(emojiWrapper, { pointerType: "mouse" });
  expect(screen.getByRole("dialog", { name: /emoji picker/i })).toBeInTheDocument();

  // Leave wrapper
  fireEvent.pointerLeave(emojiWrapper, { pointerType: "mouse" });
  expect(screen.queryByRole("dialog", { name: /emoji picker/i })).not.toBeInTheDocument();
});

test("touch pointer does not open picker on hover, but clicking trigger button toggles it", () => {
  const props = {
    handleSendMsg: jest.fn(),
    setNewAttach: jest.fn(),
    newAttach: undefined,
    isSending: false,
    disabled: false,
  };
  const { container } = render(<ChatInput {...props} />);
  const emojiWrapper = container.querySelector(".emoji-picker-wrapper");
  const triggerBtn = screen.getByRole("button", { name: /open emoji picker/i });

  // Touch hover is ignored
  const touchEnterEvent = new Event("pointerenter", { bubbles: true });
  Object.defineProperty(touchEnterEvent, "pointerType", { value: "touch" });
  fireEvent(emojiWrapper, touchEnterEvent);
  expect(screen.queryByRole("dialog", { name: /emoji picker/i })).not.toBeInTheDocument();

  // Click / tap opens picker
  fireEvent.click(triggerBtn);
  expect(screen.getByRole("dialog", { name: /emoji picker/i })).toBeInTheDocument();

  // Click again toggles closed
  fireEvent.click(triggerBtn);
  expect(screen.queryByRole("dialog", { name: /emoji picker/i })).not.toBeInTheDocument();
});

test("pressing Escape or clicking outside closes the emoji picker", () => {
  const props = {
    handleSendMsg: jest.fn(),
    setNewAttach: jest.fn(),
    newAttach: undefined,
    isSending: false,
    disabled: false,
  };
  render(<ChatInput {...props} />);
  const triggerBtn = screen.getByRole("button", { name: /open emoji picker/i });

  // Open via click
  fireEvent.click(triggerBtn);
  expect(screen.getByRole("dialog", { name: /emoji picker/i })).toBeInTheDocument();

  // Escape closes
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: /emoji picker/i })).not.toBeInTheDocument();

  // Open again
  fireEvent.click(triggerBtn);
  expect(screen.getByRole("dialog", { name: /emoji picker/i })).toBeInTheDocument();

  // Pointer down outside closes
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog", { name: /emoji picker/i })).not.toBeInTheDocument();
});

test("selecting an emoji appends emoji to message input and preserves previously typed text", async () => {
  const sendMessage = jest.fn().mockResolvedValue(true);
  const { container } = render(
    <ChatInput
      handleSendMsg={sendMessage}
      setNewAttach={jest.fn()}
      newAttach={undefined}
      isSending={false}
      disabled={false}
    />
  );

  const input = screen.getByPlaceholderText("Write a message...");
  fireEvent.change(input, { target: { value: "Hello " } });

  // Open picker
  const triggerBtn = screen.getByRole("button", { name: /open emoji picker/i });
  fireEvent.click(triggerBtn);

  // Find emoji button in picker and click
  const emojiBtns = container.querySelectorAll(".emoji-picker-react .emoji button");
  expect(emojiBtns.length).toBeGreaterThan(0);
  fireEvent.click(emojiBtns[0]);

  expect(input.value.startsWith("Hello ")).toBe(true);
  expect(input.value.length).toBeGreaterThan(6);

  // Send message
  const expectedMsg = input.value;
  await act(async () => {
    fireEvent.submit(container.querySelector("form"));
  });
  expect(sendMessage).toHaveBeenCalledWith(expectedMsg);
});
