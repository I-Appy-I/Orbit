import { useState, useEffect } from "react";
import { ToastContainer, toast } from "react-toastify";
import axios from "axios";
import { ChatState } from "../context/ChatProvider";
import { fetchChatsRoute } from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";
import { getSender, getSenderProfilePic } from "../config/ChatLogics";
import Avatar from "./Avatar";

function Contacts({ fetchAgain, selectedChat, socket }) {
  const { setSelectedChat, chats, user, setChats } = ChatState();
  const [loading, setLoading] = useState(false);

  const fetchChats = async () => {
    if (!user?.token) return;
    try {
      setLoading(true);
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.get(`${fetchChatsRoute}`, config);
      setChats((currentChats) => {
        const byId = new Map((Array.isArray(data) ? data : []).map((chat) => [chat._id, chat]));
        (currentChats || []).forEach((chat) => {
          const existing = byId.get(chat._id);
          if (existing && new Date(chat.updatedAt || 0) >= new Date(existing.updatedAt || 0)) byId.set(chat._id, chat);
        });
        const sorted = [...byId.values()].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
        const seenDirectPairs = new Set();
        return sorted.filter((chat) => {
          if (chat.isGroupChat) return true;
          const pairKey = (chat.users || [])
            .map((u) => String(u._id || u))
            .sort()
            .join(":");
          if (!pairKey) return true;
          if (seenDirectPairs.has(pairKey)) return false;
          seenDirectPairs.add(pairKey);
          return true;
        });
      });
      setLoading(false);
    } catch (error) {
      setLoading(false);
      toast.error("Failed to load the chats", toastOptions);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchChats();
    }
    // eslint-disable-next-line
  }, [fetchAgain, user?.token]);

  return (
    <>
      <div className="contacts-container" >
        <div>
          <div>
            {chats && chats.length !== 0
              ? (
                <>
                  <div className="contacts">
                    {chats.map((chat) => {
                      return (
                        <div
                          onClick={() => setSelectedChat(chat)}
                          key={chat._id}
                          className={`contact ${selectedChat?._id === chat._id ? "selected" : ""}`}
                        >
                          <div className="avatar" >
                            <Avatar image={chat.isGroupChat
                                ? chat.groupPic
                                : getSenderProfilePic(user, chat.users)}
                              alt={chat.isGroupChat
                                ? chat.chatName
                                : getSender(user, chat.users)}
                            />
                          </div>
                          <div className="grid-wrapper">
                            <div className="contact-header">
                              <h4 className="chat-name">
                                {chat.isGroupChat ? chat.chatName : getSender(user, chat.users)}
                              </h4>
                              {chat.latestMessage && (
                                <span className="time">
                                  {chat.latestMessage.createdAt.split('.')[0].split('T')[1].split(':', 2).join(':')}
                                </span>
                              )}
                            </div>
                            {chat.latestMessage && (
                              <div className="lattest-message">
                                <span className="sender">{chat.latestMessage.sender.username}: </span>
                                {chat.latestMessage.content.length !== 0
                                  ? (
                                    <span className="content">
                                      {chat.latestMessage.content.length > 20
                                        ? chat.latestMessage.content.substring(0, 21) + "..."
                                        : chat.latestMessage.content}
                                    </span>
                                  )
                                  : (<span className="file">📷 Photo</span>)
                                }
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
              : (loading
                ? <div className="spinner-container chat-loading" role="status" aria-label="Loading chats">
                  <div className="loading-spinner">
                  </div>
                </div>
                : <div className="chat-loading" role="status">
                  <b>Your chat list is empty</b>
                </div>
              )}
          </div>
        </div>
      </div>
      <ToastContainer />
    </>
  )
}

export default Contacts;
