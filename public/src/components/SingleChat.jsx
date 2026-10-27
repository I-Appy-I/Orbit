import { useEffect, useState, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";

import axios from "axios";

import { ChatState } from "../context/ChatProvider";
import { recieveMessageRoute, sendMessageRoute, getAttachmentUrl } from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";
import {
    isGroupRecieved,
    isAnotherSender,
    isLastMessage
} from "../config/ChatLogics";

import ChatInput from "./ChatInput";
import Avatar from "./Avatar";

const getChatId = (message) => String(message?.chat?._id || message?.chat || "");

const mergeMessages = (messages) => {
    const byId = new Map();
    messages.forEach((message) => {
        if (message?._id) byId.set(String(message._id), message);
    });

    return [...byId.values()].sort((left, right) => {
        const timeDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return timeDifference || String(left._id).localeCompare(String(right._id));
    });
};


function SingleChat({ fetchAgain, socket, setFetchAgain, selectedChat, blocked, onBlockedByPeer, onUnblockedByPeer }) {
    const [messages, setMessages] = useState([]);
    const [newAttach, setNewAttach] = useState();
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const messageListRef = useRef();
    const activeChatIdRef = useRef();
    const shouldScrollToBottomRef = useRef(true);
    const pendingPrependScrollRef = useRef();
    const { user } = ChatState();

    const sendMessage = async (msg) => {
        const chatId = selectedChat?._id;
        if (!chatId || sending) return false;

        setSending(true);
        try {
            const formData = new FormData();
            formData.append("chatId", chatId);

            if (newAttach) formData.append("attachment", newAttach, newAttach.name);

            if (msg.length > 0) {
                formData.append("content", msg)
            } else {
                formData.append("content", '')
            }
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                }
            };
            const { data } = await axios.put(
                `${sendMessageRoute}`,
                formData,
                config
            );
            // A reply can arrive after the user has switched conversations.
            // Keep it persisted, but never put it into the newly selected chat.
            if (activeChatIdRef.current === chatId && getChatId(data) === String(chatId)) {
                shouldScrollToBottomRef.current = true;
                setMessages((currentMessages) => mergeMessages([...currentMessages, data]));
            }
            setNewAttach();
            return true;
        } catch (error) {
            if (error.response?.data?.code === "DIRECT_MESSAGE_BLOCKED") {
                onBlockedByPeer?.();
                toast.info("You can't message this contact.", toastOptions);
            } else {
                toast.error("Failed to send the Message", toastOptions);
            }
            return false;
        } finally {
            setSending(false);
        }
    };

    const fetchMessages = async (requestedPage = 1) => {
        const chatId = selectedChat?._id;
        if (!chatId) return;
        try {
            if (requestedPage === 1) {
                setLoading(true);
            } else {
                const messageList = messageListRef.current;
                if (messageList) {
                    pendingPrependScrollRef.current = {
                        scrollHeight: messageList.scrollHeight,
                        scrollTop: messageList.scrollTop,
                    };
                }
                shouldScrollToBottomRef.current = false;
                setLoadingMore(true);
            }
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                }
            };
            const { data } = await axios.get(
                `${recieveMessageRoute}/${chatId}?paginated=true&page=${requestedPage}&limit=50`,
                config
            );
            const nextMessages = data.messages || data;
            if (activeChatIdRef.current !== chatId) return;
            setMessages((currentMessages) => mergeMessages(
                requestedPage === 1
                    ? [...currentMessages, ...nextMessages]
                    : [...nextMessages, ...currentMessages]
            ));
            setPage(requestedPage);
            setHasNextPage(Boolean(data.hasNextPage));
        } catch (error) {
            toast.error("Failed to Load the Messages", toastOptions);
        } finally {
            if (activeChatIdRef.current === chatId) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    };


    useEffect(() => {
        activeChatIdRef.current = selectedChat?._id;
        shouldScrollToBottomRef.current = true;
        pendingPrependScrollRef.current = undefined;
        setNewAttach(undefined);
        setMessages([]);
        setPage(1);
        setHasNextPage(false);
        fetchMessages(); // eslint-disable-next-line
    }, [selectedChat?._id]);

    useEffect(() => {
        const activeSocket = socket.current;
        const chatId = selectedChat?._id;
        if (!activeSocket || !chatId) return;

        const joinActiveChat = () => {
            activeSocket.emit("join chat", chatId);
        };

        const handleMessageReceived = (newMessageReceived) => {
            if (getChatId(newMessageReceived) === String(chatId)) {
                if (!selectedChat?.isGroupChat && isAnotherSender(newMessageReceived, user)) {
                    onUnblockedByPeer?.();
                }
                const messageList = messageListRef.current;
                shouldScrollToBottomRef.current = !messageList ||
                    messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 64;
                setMessages((currentMessages) => mergeMessages([...currentMessages, newMessageReceived]));
            }
        };

        const handleUserUpdated = ({ userId, username }) => {
            if (!userId || !username) return;
            setMessages((currentMessages) => {
                if (!currentMessages || !currentMessages.length) return currentMessages;
                let hasChanged = false;
                const nextMessages = currentMessages.map((msg) => {
                    const senderId = String(msg.sender?._id || msg.sender);
                    if (senderId === String(userId) && msg.sender?.username !== username) {
                        hasChanged = true;
                        return typeof msg.sender === "object"
                            ? { ...msg, sender: { ...msg.sender, username } }
                            : msg;
                    }
                    return msg;
                });
                return hasChanged ? nextMessages : currentMessages;
            });
        };

        activeSocket.on("message recieved", handleMessageReceived);
        activeSocket.on("user updated", handleUserUpdated);
        activeSocket.on("connect", joinActiveChat);
        if (activeSocket.connected) joinActiveChat();

        return () => {
            activeSocket.off("message recieved", handleMessageReceived);
            activeSocket.off("user updated", handleUserUpdated);
            activeSocket.off("connect", joinActiveChat);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChat?._id, socket]);

    useEffect(() => {
        const messageList = messageListRef.current;
        if (!messageList) return;

        const pendingPrepend = pendingPrependScrollRef.current;
        if (pendingPrepend) {
            messageList.scrollTop = pendingPrepend.scrollTop +
                (messageList.scrollHeight - pendingPrepend.scrollHeight);
            pendingPrependScrollRef.current = undefined;
        } else if (shouldScrollToBottomRef.current) {
            messageList.scrollTop = messageList.scrollHeight;
        }
    }, [messages]);

    return (
        <>
            <div className={`messages-container ${newAttach ? 'grid' : ''}`}>
                <div className="chat-messages" ref={messageListRef}>
                    {loading ? (
                        <div className="spinner-container chat-loading" role="status">
                            <div className="loading-spinner" />
                            <span>Loading messages…</span>
                        </div>
                    ) : (
                        <>
                            {hasNextPage && (
                                <div className="load-more-wrapper">
                                    <button
                                        type="button"
                                        className="load-more-btn"
                                        onClick={() => fetchMessages(page + 1)}
                                        disabled={loadingMore}
                                    >
                                        {loadingMore ? "Loading older messages…" : "Load older messages"}
                                    </button>
                                </div>
                            )}
                            {messages.length === 0 && (
                                <div className="chat-loading">
                                    <b>No messages yet</b>
                                    <span>Send the first message to start the conversation.</span>
                                </div>
                            )}
                            {messages.map((message, i) => {
                                const isIncoming = isAnotherSender(message, user);
                                const isGroupIncoming = isGroupRecieved(message, selectedChat, user);
                                const isLast = isLastMessage(messages, message, i);
                                const timeText = message.createdAt
                                    ? (typeof message.createdAt === "string" && message.createdAt.includes("T")
                                        ? message.createdAt.split(".")[0].split("T")[1]?.split(":", 2).join(":")
                                        : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }))
                                    : "";

                                return (
                                    <div
                                        key={message._id}
                                        className={`message-wrapper ${isIncoming ? "incoming" : "outgoing"}`}
                                    >
                                        <div
                                            className={`message ${isGroupIncoming ? "recieved-group" : ""} ${
                                                isIncoming
                                                    ? (isLast ? "recieved margin-top" : "recieved")
                                                    : "sended"
                                            }`}
                                        >
                                            <div className={`${isGroupIncoming ? "sender-pic" : ""}`}>
                                                {isGroupIncoming && isLast && (
                                                    <Avatar
                                                        image={message.sender?.profilePic}
                                                        alt={message.sender?.username || "Avatar"}
                                                    />
                                                )}
                                            </div>
                                            <div className="content">
                                                <div className="text-group">
                                                    {isGroupIncoming && isLast && (
                                                        <div className="sender-username">
                                                            <span>{message.sender?.username}</span>
                                                        </div>
                                                    )}
                                                    {message.content && message.content.length > 0 ? (
                                                        <p className={`text ${isLast ? "triangle" : ""}`}>
                                                            {message.content}
                                                        </p>
                                                    ) : null}
                                                    {message.attachment && message.attachment.length > 0 ? (
                                                        <img
                                                            src={getAttachmentUrl(message.attachment, user?.token)}
                                                            alt={message.sender?.username || "attachment"}
                                                        />
                                                    ) : null}
                                                </div>
                                                {timeText ? (
                                                    <p className="time">
                                                        {timeText}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
                <ChatInput
                    key={selectedChat?._id}
                    conversationId={selectedChat?._id}
                    handleSendMsg={sendMessage}
                    setNewAttach={setNewAttach}
                    newAttach={newAttach}
                    isSending={sending}
                    disabled={blocked}
                />
            </div>
            <ToastContainer />
        </>
    );
};

export default SingleChat;
