import { useState, useRef, useEffect, useMemo } from "react";
import Picker from "emoji-picker-react";
import { BsEmojiSmile } from "react-icons/bs";
import { IoSend } from "react-icons/io5";
import { GrFormClose } from "react-icons/gr";
import { MdOutlineAddAPhoto } from "react-icons/md";

function ChatInput({ handleSendMsg, setNewAttach, newAttach, isSending, disabled, conversationId }) {
  const [msg, setMsg] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputElement = useRef();
  const emojiWrapperRef = useRef();
  const triggerBtnRef = useRef();

  useEffect(() => {
    inputElement.current?.focus();
  }, []);

  useEffect(() => {
    if (disabled) setShowEmojiPicker(false);
  }, [disabled]);

  useEffect(() => {
    setMsg("");
    setShowEmojiPicker(false);
  }, [conversationId]);

  useEffect(() => {
    if (!showEmojiPicker) return;

    const handlePointerDownOutside = (event) => {
      if (emojiWrapperRef.current && !emojiWrapperRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowEmojiPicker(false);
        triggerBtnRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showEmojiPicker]);

  const handlePointerEnter = (e) => {
    if (disabled) return;
    if (e.pointerType === "touch") return;
    setShowEmojiPicker(true);
  };

  const handlePointerLeave = (e) => {
    if (e.pointerType === "touch") return;
    setShowEmojiPicker(false);
  };

  const handleTriggerClick = (e) => {
    e.preventDefault();
    if (disabled) return;
    setShowEmojiPicker((isOpen) => !isOpen);
  };

  const attachmentUrl = useMemo(
    () => (newAttach ? URL.createObjectURL(newAttach) : null),
    [newAttach]
  );

  useEffect(() => () => {
    if (attachmentUrl) URL.revokeObjectURL(attachmentUrl);
  }, [attachmentUrl]);

  // emoji-picker-react@3.5.1 calls this as (event, emojiObject).
  const handleEmojiClick = (_event, emojiObject) => {
    const emoji = emojiObject?.emoji;
    if (typeof emoji !== "string" || !emoji) return;
    setMsg((currentMessage) => `${currentMessage}${emoji}`);
    inputElement.current?.focus();
  };

  const sendChat = async (event) => {
    event.preventDefault();
    if (!disabled && !isSending && (msg.length > 0 || newAttach)) {
      const wasSent = await handleSendMsg(msg);
      if (wasSent) {
        setMsg("");
      }
    }
  };

  return (
    <div className="chat-input">
      <form className="input-container" onSubmit={(event) => sendChat(event)}>
        <div className="button-container">
          <div
            ref={emojiWrapperRef}
            className="emoji emoji-picker-wrapper"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            <button
              ref={triggerBtnRef}
              type="button"
              className="icon-button emoji-trigger-btn"
              aria-label="Open emoji picker"
              aria-expanded={showEmojiPicker}
              disabled={disabled}
              onClick={handleTriggerClick}
            >
              <BsEmojiSmile />
            </button>
            {showEmojiPicker && !disabled && (
              <div
                className="emoji-picker-popover"
                role="dialog"
                aria-label="Emoji picker"
              >
                <Picker
                  onEmojiClick={handleEmojiClick}
                  pickerStyle={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border)",
                    boxShadow: "var(--shadow-xl)",
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <input
          ref={inputElement}
          type="text"
          placeholder="Write a message..."
          onChange={(e) => setMsg(e.target.value)}
          value={msg}
          disabled={disabled}
        />
        <div className="buttons">
          <div className="hidden-input">
            <label className="icon-button">
              <input
                type="file"
                name="profilePic"
                accept="image/*"
                disabled={disabled}
                onChange={(event) => setNewAttach(event.target.files[0])}
              />
              <MdOutlineAddAPhoto />
            </label>
          </div>
          <button type="submit" className="icon-button submit-button" disabled={isSending || disabled}>
            <IoSend />
          </button>
        </div>
      </form>

      {newAttach && !disabled &&
        <div className="attachment">
          <img src={attachmentUrl} className="attach-file" alt={newAttach.name}/>
          <div className="close-button-wrapper">
            <button className="close-button" onClick={() => { setNewAttach() }}>
              <GrFormClose />
            </button>
          </div>
        </div>

      }
    </div>
  );
}

export default ChatInput;
