import { useEffect, useRef, useState } from "react";
import { IoIosArrowBack } from "react-icons/io";
import { RxExit, RxPencil2 } from "react-icons/rx";
import { GoKebabVertical } from "react-icons/go";

import { ChatState } from "../context/ChatProvider";
import { getSender, getSenderProfilePic } from "../config/ChatLogics";

import UpdateGroupChat from "./Group/UpdateGroupChat";
import SubmitModal from "./Aux/SubmitModal";
import SingleChat from "./SingleChat";
import Avatar from "./Avatar";

import { toast } from "react-toastify";
import axios from "axios";
import { exitGroupChatRoute, deleteChatRoute, blocksRoute, accessChatRoute } from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";

function ChatContainer({ socket, fetchAgain, setFetchAgain }) {
  const { setSelectedChat, selectedChat, user, setChats } = ChatState();
  const [showToggle, setShowToggle] = useState(false);
  const [modalUpdateActive, setModalUpdateActive] = useState('not');
  //submit modal
  const [modalSubmitActive, setModalSubmitActive] = useState('not');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [warnText, setWarnText] = useState("");
  const [submText, setSubmText] = useState("");
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [blockStatusLoading, setBlockStatusLoading] = useState(true);
  const [blockLoading, setBlockLoading] = useState(false);
  const blockStatusVersion = useRef(0);
  const directContact = selectedChat?.isGroupChat ? null : selectedChat?.users?.find((member) => String(member?._id || member) !== String(user?._id));

  useEffect(() => {
    let active = true;
    setBlockedByMe(false);
    setBlockedMe(false);
    if (!directContact?._id) {
      setBlockStatusLoading(false);
      return undefined;
    }
    setBlockStatusLoading(true);
    const revision = blockStatusVersion.current;
    axios.get(`${blocksRoute}/${directContact._id}`, { headers: { Authorization: `Bearer ${user.token}` } })
      .then(({ data }) => {
        if (active && revision === blockStatusVersion.current) {
          setBlockedByMe(data.blockedByMe);
          setBlockedMe(data.blockedMe);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setBlockStatusLoading(false); });
    return () => { active = false; };
  }, [directContact?._id, user.token]);

  useEffect(() => {
    const activeSocket = socket.current;
    if (!activeSocket) return undefined;
    const handleBlockStatus = (event) => {
      const contactId = String(directContact?._id || "");
      if (!contactId) return;
      if (event.blockedUserId === contactId) {
        blockStatusVersion.current += 1;
        setBlockedByMe(event.blocked);
      }
      if (event.blockerId === contactId) {
        blockStatusVersion.current += 1;
        setBlockedMe(event.blocked);
      }
    };
    const refreshOnReconnect = () => {
      if (!directContact?._id) return;
      const revision = blockStatusVersion.current;
      axios.get(`${blocksRoute}/${directContact._id}`, { headers: { Authorization: `Bearer ${user.token}` } })
        .then(({ data }) => {
          if (revision === blockStatusVersion.current) {
            setBlockedByMe(data.blockedByMe);
            setBlockedMe(data.blockedMe);
          }
        })
        .catch(() => {});
    };
    activeSocket.on("block status", handleBlockStatus);
    activeSocket.on("connect", refreshOnReconnect);
    return () => {
      activeSocket.off("block status", handleBlockStatus);
      activeSocket.off("connect", refreshOnReconnect);
    };
  }, [socket, directContact?._id, user.token]);

  const toggleBlock = async () => {
    if (!directContact || blockLoading) return;
    const operation = blockedByMe ? "unblock" : "block";
    if (operation === "block" && !window.confirm(`Block ${directContact.username}?`)) return;
    setBlockLoading(true);
    try {
      if (operation === "block") await axios.post(`${blocksRoute}/${directContact._id}`, {}, { headers: { Authorization: `Bearer ${user.token}` } });
      else await axios.delete(`${blocksRoute}/${directContact._id}`, { headers: { Authorization: `Bearer ${user.token}` } });
      setBlockedByMe(operation === "block");
      setShowToggle(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update block settings", toastOptions);
    } finally { setBlockLoading(false); }
  };

  const handleBlockedByPeer = () => setBlockedMe(true);

  const updateChat = () => {
    setModalUpdateActive("active");
    setShowToggle(!showToggle);
  };

  const leaveChat = () => {
    setModalSubmitActive("leave");
    setShowToggle(!showToggle);
    setWarnText(selectedChat.users?.length === 1
      ? "You are the last member. Leaving will permanently delete this group and its messages."
      : "You cannot return this chat by yourself.");
    setSubmText(`Are you sure you want to leave ${selectedChat.chatName}?`);
  };

  const handleLeave = async () => {
    if (actionSubmitting) return;
    setActionSubmitting(true);
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };
      await axios.put(
        `${exitGroupChatRoute}`,
        { chatId: selectedChat._id },
        config
      );
      setFetchAgain(!fetchAgain);
      toast.success(`You succefuly leaved ${selectedChat.chatName}`, toastOptions);
      setSelectedChat();
      setModalSubmitActive("not");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to leave this group", toastOptions);
    } finally {
      setActionSubmitting(false);
    }
  };

  const deleteChat = () => {
    setModalSubmitActive("delete");
    setShowToggle(!showToggle);
    setWarnText("You cannot restore this chat. All messages will be permanently deleted.");
    setSubmText(`Are you sure you want to delete chat with ${selectedChat.chatName}?`);
  };

  const handleDelete = async () => {
    if (actionSubmitting) return;
    setActionSubmitting(true);
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };
      await axios.put(
        `${deleteChatRoute}`,
        {
          chatId: selectedChat._id,
        },
        config
      );
      setFetchAgain(!fetchAgain);
      toast.success(`You succefuly deleted the chat`, toastOptions);
      setSelectedChat();
      setModalSubmitActive('not');
    } catch (error) {
      toast.error("Something went wrong! Please, try again", toastOptions);
    } finally {
      setActionSubmitting(false);
    }
  };

  return (
    <div className="right-side" role="main" aria-label="Conversation workspace">
      <div className="chat-header">
        <button
          type="button"
          className="icon-button back-button"
          aria-label="Back to conversation list"
          onClick={() => {
            setSelectedChat(undefined);
          }}
        >
          <IoIosArrowBack />
        </button>
        {selectedChat && (
          <div className="user-details">
            <div className="avatar">
              <Avatar
                image={selectedChat.isGroupChat
                  ? selectedChat.groupPic || "default-group.svg"
                  : getSenderProfilePic(user, selectedChat.users)}
                alt={
                  selectedChat.isGroupChat
                    ? selectedChat.chatName
                    : getSender(user, selectedChat.users)
                }
              />
            </div>
            <div className="username">
              <h3>
                {selectedChat.isGroupChat
                  ? selectedChat.chatName
                  : getSender(user, selectedChat.users)}
              </h3>
              <span className="chat-subtitle">
                {selectedChat.isGroupChat
                  ? `${selectedChat.users?.length || 0} members`
                  : selectedChat.isContactPreview ? "Contact details" : "Direct Conversation"}
              </span>
            </div>
          </div>
        )}
        {!selectedChat.isContactPreview && <div className="chat-menu">
          <button
            type="button"
            className={`icon-button ${showToggle ? "active" : ""}`}
            aria-label="Conversation options"
            onClick={() => {
              setShowToggle(!showToggle);
            }}
          >
            <GoKebabVertical />
          </button>
          {showToggle && (
            <div className="chat-menu-toggle">
              {selectedChat.isGroupChat ? (
                <>
                  <button type="button" className="list-item" onClick={updateChat}>
                    <RxPencil2 />
                    <span>Group Details</span>
                  </button>
                  <button type="button" className="list-item danger" onClick={leaveChat}>
                    <RxExit />
                    <span>Leave Group</span>
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="list-item danger" onClick={deleteChat}>
                    <RxExit /><span>Delete Chat</span>
                  </button>
                  <button type="button" className={`list-item ${blockedByMe ? "" : "danger"}`} disabled={blockLoading} onClick={toggleBlock}>
                    <span>{blockedByMe ? "Unblock contact" : "Block contact"}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>}
      </div>
      {blockedByMe && directContact && <div className="blocked-notice" role="status">
        <span>You blocked this contact.</span>
        <button type="button" onClick={toggleBlock} disabled={blockLoading}>Unblock</button>
      </div>}
      {blockedMe && directContact && <div className="blocked-notice" role="status">You can&apos;t message this contact.</div>}
      {selectedChat.isContactPreview ? (
        <div className="contact-preview" role="status">
          <Avatar image={directContact?.profilePic} alt={directContact?.username} />
          <h2>{directContact?.username}</h2>
          <p>This conversation is not currently in your chat list.</p>
          {!blockedByMe && !blockedMe && !blockStatusLoading && <button type="button" onClick={async () => {
            try {
              const { data } = await axios.post(accessChatRoute, { userId: directContact._id }, {
                headers: { Authorization: `Bearer ${user.token}` },
              });
              setChats((current) => [data, ...(current || []).filter((chat) => chat._id !== data._id)]);
              setSelectedChat(data);
            } catch (error) {
              toast.error(error.response?.data?.message || "Unable to open this conversation", toastOptions);
            }
          }}>Start conversation</button>}
        </div>
      ) : <SingleChat
        fetchAgain={fetchAgain}
        socket={socket}
        setFetchAgain={setFetchAgain}
        selectedChat={selectedChat}
        blocked={Boolean(directContact) && (blockedByMe || blockedMe || blockStatusLoading)}
        onBlockedByPeer={handleBlockedByPeer}
        onUnblockedByPeer={() => setBlockedMe(false)}
      />}

      {modalUpdateActive === "active"
        ? <UpdateGroupChat fetchAgain={fetchAgain} setFetchAgain={setFetchAgain} setModalActive={setModalUpdateActive} onLeaveGroup={leaveChat} />
        : <></>
      }
      {modalSubmitActive === "leave"
        ? <SubmitModal
          setModalActive={setModalSubmitActive}
          warnText={warnText}
          submText={submText}
          handleFunction={handleLeave}
          isSubmitting={actionSubmitting}
        />
        : <></>
      }
      {modalSubmitActive === "delete"
        ? <SubmitModal
          setModalActive={setModalSubmitActive}
          warnText={warnText}
          submText={submText}
          handleFunction={handleDelete}
          isSubmitting={actionSubmitting}
        />
        : <></>
      }
    </div >
  );
}

export default ChatContainer;
