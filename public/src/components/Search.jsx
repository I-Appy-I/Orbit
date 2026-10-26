import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";
import axios from "axios";
import { accessChatRoute, allUsersRoute, blocksRoute } from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";
import { ChatState } from "../context/ChatProvider";
import UserListItem from "./Aux/UserListItem";
import { useEffect, useRef, useState } from "react";

function Search({ searchResults, setSearchResult, socket, searchQuery }) {
  const {
    setSelectedChat,
    user,
    setChats,
  } = ChatState();
  const [unblockingId, setUnblockingId] = useState(null);
  const statusRevision = useRef(0);

  useEffect(() => {
    const activeSocket = socket?.current;
    if (!activeSocket) return undefined;
    const handleBlockStatus = (event) => {
      statusRevision.current += 1;
      setSearchResult((current) => current.map((contact) => {
        if (event.blockerId === user._id && event.blockedUserId === contact._id) {
          return { ...contact, blockedByMe: event.blocked };
        }
        if (event.blockedUserId === user._id && event.blockerId === contact._id) {
          return { ...contact, blockedMe: event.blocked };
        }
        return contact;
      }));
    };
    const refreshSearchStatus = () => {
      const revision = statusRevision.current;
      axios.get(`${allUsersRoute}?search=${encodeURIComponent(searchQuery || "")}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      }).then(({ data }) => {
        if (revision === statusRevision.current) setSearchResult(data);
      }).catch(() => {});
    };
    const handleUserUpdated = (event) => {
      if (!event?.userId || !event?.username) return;
      setSearchResult((current) => current.map((contact) => {
        if (String(contact._id) === String(event.userId)) {
          return { ...contact, username: event.username };
        }
        return contact;
      }));
    };
    activeSocket.on("block status", handleBlockStatus);
    activeSocket.on("user updated", handleUserUpdated);
    activeSocket.on("connect", refreshSearchStatus);
    refreshSearchStatus();
    return () => {
      activeSocket.off("block status", handleBlockStatus);
      activeSocket.off("user updated", handleUserUpdated);
      activeSocket.off("connect", refreshSearchStatus);
    };
  }, [socket, setSearchResult, user._id, user.token, searchQuery]);

  const accessChat = async (userId) => {
    const result = searchResults.find((contact) => contact._id === userId);
    try {
      const config = { headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`
        }
      };
      const { data } = await axios.post(`${accessChatRoute}`, { userId }, config);
      setChats((current) => [data, ...(current || []).filter((chat) => chat._id !== data._id)]);
      setSelectedChat(data);
    } catch (error) {
      if (result?.blockedByMe && error.response?.status === 403) {
        openContactPreview(result);
        return;
      }
      toast.error(error.response?.data?.message || "Unable to open this conversation", toastOptions);
    }
  };

  const openContactPreview = (contact) => setSelectedChat({
    _id: `contact-${contact._id}`,
    chatName: contact.username,
    isGroupChat: false,
    isContactPreview: true,
    users: [user, contact],
  });

  const unblockContact = async (contactId) => {
    if (unblockingId) return;
    setUnblockingId(contactId);
    try {
      await axios.delete(`${blocksRoute}/${contactId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setSearchResult((current) => current.map((contact) => contact._id === contactId
        ? { ...contact, blockedByMe: false }
        : contact));
      toast.success("Contact unblocked.", toastOptions);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to unblock this contact", toastOptions);
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <>
      <div className="contacts-container search">
        {searchResults.length !== 0 ? (
          <div className="contacts">
            {searchResults?.map((result) => (
              <UserListItem handleFunction={() => accessChat(result._id)}
                actionLabel={result.blockedByMe ? "Unblock" : undefined}
                actionDisabled={unblockingId === result._id}
                onAction={() => unblockContact(result._id)}
                result={result}
                key={result._id} />
            ))}
          </div>
        ) : (
          <div className="chat-loading">
            <b>No users found</b>
          </div>
        )}
      </div>
      <ToastContainer />
    </>
  );
}

export default Search;
