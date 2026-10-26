import { useEffect, useState, useRef } from "react";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";
import { SlMagnifier } from "react-icons/sl";
import { IoIosArrowBack } from "react-icons/io";
import { IoMenu } from "react-icons/io5";
import { GrFormClose } from "react-icons/gr";
import { io } from "socket.io-client";

import axios from "axios";

import { ChatState } from "../context/ChatProvider";
import { allUsersRoute, host } from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";

import ChatContainer from "../components/ChatContainer";
import Contacts from "../components/Contacts";
import Search from "../components/Search";
import NavigationDrawer from "../components/NavigationDrawer";
import UpdateProfile from "../components/UpdateProfile";
import GroupChatCreate from "../components/Group/CreateGroupChat";

import Robot from "../assets/robot.gif";


function Chat() {
  const socket = useRef();
  const groupCreateTriggerRef = useRef();
  const [loading, setLoading] = useState(false);
  const [fetchAgain, setFetchAgain] = useState(false);
  const [searchResults, setSearchResult] = useState([]);
  const [search, setSearch] = useState('');
  const [navState, setNavState] = useState("start");
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchRequestIdRef = useRef(0);

  const { selectedChat, user, setUser, logout, setChats, setSelectedChat } = ChatState();
  const socketToken = user?.token;
  const closeGroupCreation = () => {
    setGroupCreateOpen(false);
    groupCreateTriggerRef.current?.focus();
  };

  const clearSearch = () => {
    searchRequestIdRef.current += 1;
    setSearch("");
    setSearchResult([]);
    setNavState("start");
    setLoading(false);
  };

  // search function
  const handleSearch = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const query = search.trim();
    if (!query) {
      toast.error("Please Enter something in search", toastOptions);
      return;
    }
    const currentRequestId = ++searchRequestIdRef.current;
    try {
      setLoading(true);
      setNavState("add-trip");
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };
      const { data } = await axios.get(`${allUsersRoute}?search=${encodeURIComponent(query)}`, config);
      if (currentRequestId === searchRequestIdRef.current) {
        setSearchResult(data);
        setLoading(false);
      }
    } catch (error) {
      if (currentRequestId === searchRequestIdRef.current) {
        setLoading(false);
        toast.error("Error in searching user", toastOptions);
      }
    }
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setSearch(value);
    if (!value) {
      searchRequestIdRef.current += 1;
      setSearchResult([]);
      setNavState("start");
      setLoading(false);
    }
  };

  //socket connection
  useEffect(() => {
    if (socketToken) {
      socket.current = io(host, {
        auth: {
          token: socketToken,
        },
      });
      const handleConversationUpdate = (chat) => {
        if (!chat?._id) return;
        setChats((currentChats) => {
          const chats = currentChats || [];
          // For direct (non-group) chats, remove any stale entries between the
          // same pair of users that have a different _id. This eliminates
          // duplicate sidebar entries that appear when a deleted direct chat is
          // re-created (e.g., after a user is unblocked and sends a new message).
          const incomingParticipantIds = !chat.isGroupChat && Array.isArray(chat.users)
            ? new Set(chat.users.map((u) => String(u._id || u)))
            : null;
          const filtered = chats.filter((item) => {
            if (item._id === chat._id) return false; // always replace self
            if (!incomingParticipantIds || item.isGroupChat) return true;
            if (item.isGroupChat !== false) return true;
            // Remove a stale direct chat whose participants exactly match the
            // incoming chat — it is a superseded duplicate.
            const existingIds = Array.isArray(item.users)
              ? new Set(item.users.map((u) => String(u._id || u)))
              : null;
            if (!existingIds || existingIds.size !== incomingParticipantIds.size) return true;
            return ![...incomingParticipantIds].every((id) => existingIds.has(id));
          });
          return [chat, ...filtered]
            .sort((left, right) => new Date(right.updatedAt || right.latestMessage?.createdAt || 0) - new Date(left.updatedAt || left.latestMessage?.createdAt || 0));
        });
        setSelectedChat((current) => {
          if (!current) return current;
          if (current._id === chat._id) return { ...current, ...chat };
          // If the user is viewing a stale direct chat that has been superseded
          // by this incoming canonical chat (same participants, different _id),
          // switch them into the new chat so their composer is immediately active.
          if (!chat.isGroupChat && !current.isGroupChat && !current.isContactPreview &&
              Array.isArray(chat.users) && Array.isArray(current.users)) {
            const incomingIds = new Set(chat.users.map((u) => String(u._id || u)));
            const currentIds = current.users.map((u) => String(u._id || u));
            if (currentIds.length === incomingIds.size &&
                currentIds.every((id) => incomingIds.has(id))) {
              return chat;
            }
          }
          return current;
        });
      };
      const handleConversationRemoved = ({ chatId }) => {
        setChats((current) => (current || []).filter((chat) => chat._id !== chatId));
        setSelectedChat((current) => current?._id === chatId ? undefined : current);
      };

      const handleUserUpdated = ({ userId, username }) => {
        if (!userId || !username) return;

        // 1. If the logged in user changed their username on another session
        if (user && String(user._id) === String(userId)) {
          setUser((currentUser) => {
            if (!currentUser || currentUser.username === username) return currentUser;
            const updated = { ...currentUser, username };
            try {
              localStorage.setItem(process.env.REACT_APP_LOCALHOST_KEY, JSON.stringify(updated));
            } catch (e) {}
            return updated;
          });
        }

        // 2. Update conversation list (chats)
        setChats((currentChats) => {
          if (!currentChats || !currentChats.length) return currentChats;
          let hasChanged = false;
          const nextChats = currentChats.map((chat) => {
            let chatChanged = false;

            // Update users array
            let nextUsers = chat.users;
            if (Array.isArray(chat.users)) {
              nextUsers = chat.users.map((member) => {
                const memberId = String(member?._id || member);
                if (memberId === String(userId) && member.username !== username) {
                  chatChanged = true;
                  hasChanged = true;
                  return typeof member === "object" ? { ...member, username } : member;
                }
                return member;
              });
            }

            // Update latestMessage sender if matching
            let nextLatestMessage = chat.latestMessage;
            if (chat.latestMessage?.sender) {
              const senderId = String(chat.latestMessage.sender._id || chat.latestMessage.sender);
              if (senderId === String(userId) && chat.latestMessage.sender.username !== username) {
                chatChanged = true;
                hasChanged = true;
                nextLatestMessage = typeof chat.latestMessage.sender === "object"
                  ? { ...chat.latestMessage, sender: { ...chat.latestMessage.sender, username } }
                  : chat.latestMessage;
              }
            }

            // If contact preview where chatName was set to contact's username
            let nextChatName = chat.chatName;
            if (chat.isContactPreview && chat.chatName && Array.isArray(chat.users)) {
              const isTargetUser = chat.users.some(
                (u) => String(u._id || u) === String(userId) && String(u._id || u) !== String(user?._id)
              );
              if (isTargetUser && chat.chatName !== username) {
                chatChanged = true;
                hasChanged = true;
                nextChatName = username;
              }
            }

            if (!chatChanged) return chat;
            return {
              ...chat,
              users: nextUsers,
              latestMessage: nextLatestMessage,
              chatName: nextChatName,
            };
          });

          return hasChanged ? nextChats : currentChats;
        });

        // 3. Update selectedChat
        setSelectedChat((current) => {
          if (!current) return current;
          let changed = false;

          let nextUsers = current.users;
          if (Array.isArray(current.users)) {
            nextUsers = current.users.map((member) => {
              const memberId = String(member?._id || member);
              if (memberId === String(userId) && member.username !== username) {
                changed = true;
                return typeof member === "object" ? { ...member, username } : member;
              }
              return member;
            });
          }

          let nextChatName = current.chatName;
          if (current.isContactPreview && current.users) {
            const isTargetUser = current.users.some(
              (u) => String(u._id || u) === String(userId) && String(u._id || u) !== String(user?._id)
            );
            if (isTargetUser && current.chatName !== username) {
              changed = true;
              nextChatName = username;
            }
          }

          let nextGroupAdmins = current.groupAdmins;
          if (Array.isArray(current.groupAdmins)) {
            nextGroupAdmins = current.groupAdmins.map((admin) => {
              const adminId = String(admin?._id || admin);
              if (adminId === String(userId) && admin.username !== username) {
                changed = true;
                return typeof admin === "object" ? { ...admin, username } : admin;
              }
              return admin;
            });
          }

          let nextGroupAdmin = current.groupAdmin;
          if (current.groupAdmin && typeof current.groupAdmin === "object") {
            if (String(current.groupAdmin._id) === String(userId) && current.groupAdmin.username !== username) {
              changed = true;
              nextGroupAdmin = { ...current.groupAdmin, username };
            }
          }

          let nextLatestMessage = current.latestMessage;
          if (current.latestMessage?.sender) {
            const senderId = String(current.latestMessage.sender._id || current.latestMessage.sender);
            if (senderId === String(userId) && current.latestMessage.sender.username !== username) {
              changed = true;
              nextLatestMessage = typeof current.latestMessage.sender === "object"
                ? { ...current.latestMessage, sender: { ...current.latestMessage.sender, username } }
                : current.latestMessage;
            }
          }

          if (!changed) return current;
          return {
            ...current,
            users: nextUsers,
            chatName: nextChatName,
            groupAdmins: nextGroupAdmins,
            groupAdmin: nextGroupAdmin,
            latestMessage: nextLatestMessage,
          };
        });
      };

      socket.current.on("contacts", handleConversationUpdate);
      socket.current.on("chat removed", handleConversationRemoved);
      socket.current.on("user updated", handleUserUpdated);
      const handleConnectError = (error) => {
        if (error.message?.startsWith("Authentication error")) logout();
      };
      socket.current.on("connect_error", handleConnectError);
      return () => {
        if (socket.current) {
          socket.current.off("connect_error", handleConnectError);
          socket.current.off("contacts", handleConversationUpdate);
          socket.current.off("chat removed", handleConversationRemoved);
          socket.current.off("user updated", handleUserUpdated);
          socket.current.disconnect();
        }
      };
    }
  }, [socketToken, logout, setChats, setSelectedChat, setUser, user]);

  return (
    <>
      <div className="chat-container">
        {user && (
          <div className={`container chat-box ${selectedChat ? "has-selected-chat" : ""}`}>
            <aside className="aside" aria-label="Conversation list">
              <header className="sidebar-header">
                {navState === "add-trip" ? (
                  <button
                    type="button"
                    className="icon-button hamburger-btn back-btn"
                    aria-label="Back to contacts"
                    title="Back to contacts"
                    onClick={clearSearch}
                  >
                    <IoIosArrowBack />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-button hamburger-btn"
                    aria-label="Open menu"
                    title="Open menu"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <IoMenu />
                  </button>
                )}
                <form className="search__chat" onSubmit={handleSearch}>
                  <button
                    type="submit"
                    className="search__button"
                    aria-label="Submit search"
                  >
                    <SlMagnifier />
                  </button>
                  <input
                    type="text"
                    placeholder="Search or start new chat"
                    aria-label="Search contacts"
                    value={search}
                    onChange={handleSearchInputChange}
                  />
                  {search && (
                    <button
                      type="button"
                      className="right-button"
                      aria-label="Clear search"
                      onClick={clearSearch}
                    >
                      <GrFormClose />
                    </button>
                  )}
                </form>
              </header>
              <div className="wrapper">
                <div className="contacts-wrapper">
                  {!search || navState === 'start'
                    ? <div>
                      <Contacts socket={socket} selectedChat={selectedChat} fetchAgain={fetchAgain} />
                    </div>
                    : (loading
                      ? (
                        <div className="spinner-container chat-loading">
                          <div className="loading-spinner">
                          </div>
                        </div>
                      )
                      : (<Search socket={socket} searchResults={searchResults} setSearchResult={setSearchResult} searchQuery={search} />)
                    )
                  }
                </div>
              </div>
            </aside>
            <div className={`workspace-view ${profileSettingsOpen ? "workspace-view--hidden" : ""}`}>
              {selectedChat
                ? <ChatContainer socket={socket} fetchAgain={fetchAgain} setFetchAgain={setFetchAgain} />
                : (<div className="welcome">
                <img src={Robot} alt="Robot waves his palm" />
                <h1>
                  Welcome, <span>{user.username}!</span>
                </h1>
                <h3>Select a chat to start messaging.</h3>
                </div>)}
            </div>
            {profileSettingsOpen && (
              <UpdateProfile
                fetchAgain={fetchAgain}
                setFetchAgain={setFetchAgain}
                onClose={() => setProfileSettingsOpen(false)}
              />
            )}
            {groupCreateOpen && <GroupChatCreate onClose={closeGroupCreation} />}
            <NavigationDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              onOpenSettings={() => setProfileSettingsOpen(true)}
              onCreateGroup={() => setGroupCreateOpen(true)}
              groupCreateTriggerRef={groupCreateTriggerRef}
            />
          </div>
        )}
      </div>
      <ToastContainer />
    </>
  );
};

export default Chat;
