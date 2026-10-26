import { useState } from "react";
import { GrFormClose } from "react-icons/gr";
import { BsPencil } from "react-icons/bs";
import { BsPencilFill } from "react-icons/bs";
import { AiOutlineUserAdd } from "react-icons/ai";
import { RxExit } from "react-icons/rx";
import { ToastContainer, toast } from "react-toastify";

import axios from "axios";

import { ChatState } from "../../context/ChatProvider";
import {
    allUsersRoute,
    updateGroupPicChatRoute,
    renameGroupChatRoute,
    addGroupChatRoute,
    removeGroupChatRoute,
    groupAdminRoute
} from "../../utils/APIRoutes";
import { toastOptions } from "../../utils/constants";
import UserListItem from "../Aux/UserListItem";
import Avatar from "../Avatar";

const UpdateGroupChat = ({ fetchAgain, setFetchAgain, setModalActive, onLeaveGroup }) => {
    const [groupChatName, setGroupChatName] = useState();
    const [search, setSearch] = useState("");
    const [searchResult, setSearchResult] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeSearch, setActiveSearch] = useState(false);
    const [showChatNameInput, setShowChatNameInput] = useState(false);

    const { selectedChat, setSelectedChat, user } = ChatState();
    const admins = selectedChat.groupAdmins?.length ? selectedChat.groupAdmins : (selectedChat.groupAdmin ? [selectedChat.groupAdmin] : []);
    const isAdmin = admins.some((admin) => admin._id === user._id || admin === user._id);

    const imageUpload = async (event) => {
        event.preventDefault();
        const groupPic = event.target.files[0];
        const formData = new FormData();
        const config = {
            headers: {
                Authorization: `Bearer ${user.token}`,
            },
        };
        try {
            formData.append("chatId", selectedChat._id);
            if (groupPic) formData.append("groupPic", groupPic, groupPic.name);
            const { data } = await axios.put(`${updateGroupPicChatRoute}`, formData, config);
            setSelectedChat(data);
            setFetchAgain(!fetchAgain);
        } catch (error) {
            toast.error(error.response.data.message, toastOptions);
        }
    };

    const handleSearch = async (query) => {
        setSearch(query);
        if (!query) return
        try {
            setActiveSearch(true);
            setLoading(true);
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`,
                },
            };
            const getUsers = async () => {
                const { data } = await axios.get(`${allUsersRoute}?search=${query}`, config);
                setLoading(false);
                setSearchResult(data);
            };
            getUsers();
        } catch (error) {
            toast.error("Failed to load the Search Results", toastOptions);
        }
    };

    const handleRename = async () => {
        setShowChatNameInput(false);
        if (!groupChatName) return;
        try {
            setShowChatNameInput(!showChatNameInput)
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`,
                },
            };
            const { data } = await axios.put(`${renameGroupChatRoute}`, {chatId: selectedChat._id, chatName: groupChatName}, config);
            setSelectedChat(data);
            setFetchAgain(!fetchAgain);
        } catch (error) {
            toast.error(error.response.data.message, toastOptions);
        }
        setGroupChatName("");
    };

    const handleAddUser = async (user1) => {
        if (selectedChat.users.find((u) => u._id === user1._id)) {
            toast.error("User Already in group!", toastOptions);
            return;
        }
        if (!isAdmin) {
            toast.error("Only admins can add new users", toastOptions);
            return;
        }
        try {
            setLoading(true);
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`,
                },
            };
            const { data } = await axios.put(
                `${addGroupChatRoute}`,
                {
                    chatId: selectedChat._id,
                    userId: user1._id,
                },
                config
            );
            setSelectedChat(data);
            setFetchAgain(!fetchAgain);
            setLoading(false);
            setActiveSearch(false);
            toast.success("User is successfully added to the group", toastOptions);
        } catch (error) {
            toast.error(error.response.data.message, toastOptions);
            setLoading(false);
        }
        setGroupChatName("");
    };

    const handleRemove = async (user1) => {
        if (!isAdmin && user1._id !== user._id) {
            toast.error("Only admins can remove users from group chat", toastOptions);
            return;
        }
        try {
            setLoading(true);
            const config = {headers: { Authorization: `Bearer ${user.token}`}};
            const { data } = await axios.put(`${removeGroupChatRoute}`,{ chatId: selectedChat._id, userId: user1._id}, config);
            user1._id === user._id ? setSelectedChat() : setSelectedChat(data);
            setFetchAgain(!fetchAgain);
            setLoading(false);
        } catch (error) {
            toast.error(error.response.data.message, toastOptions);
            setLoading(false);
        }
        setGroupChatName("");
    };

    const handleAdminChange = async (member) => {
        try {
            setLoading(true);
            const promote = !admins.some((admin) => (admin._id || admin) === member._id);
            const { data } = await axios.put(groupAdminRoute, {
                chatId: selectedChat._id,
                userId: member._id,
                action: promote ? "promote" : "demote",
            }, { headers: { Authorization: `Bearer ${user.token}` } });
            setSelectedChat(data);
        } catch (error) {
            toast.error(error.response?.data?.message || "Unable to update administrator role", toastOptions);
        } finally { setLoading(false); }
    };

    return (
        <>
            <div className="update-group modal-wrapper">
                <div className={`modal-container ${activeSearch ? 'active-search' : ''}`}>
                    <div className='close-button-wrapper'>
                        <button
                            type="button"
                            className='close-button'
                            onClick={() => { setModalActive('not') }}
                            aria-label="Close group details"
                            title="Close group details"
                        >
                            <GrFormClose />
                        </button>
                    </div>
                    <div className='modal-header'>
                        <div className="avatar">
                            <label>
                                <input
                                    type="file"
                                    name="groupPic"
                                    accept="image/*"
                                    onChange={(event) => imageUpload(event)}
                                    disabled={!isAdmin}
                                />
                                <Avatar image={selectedChat.groupPic}
                                    alt={selectedChat.chatName}
                                />
                                {isAdmin && <div className="hover-text">Update chat picture</div>}
                            </label>
                        </div>
                        <div className="center">
                            {showChatNameInput
                                ? (<div className='modal-input'>
                                        <input
                                            placeholder={selectedChat.chatName}
                                            value={groupChatName}
                                            onChange={(e) => setGroupChatName(e.target.value)}
                                        />
                                        <BsPencil />
                                        <button className="button-submit" onClick={handleRename}>Save</button>
                                    </div>)
                                : (<>
                                    <h2>{selectedChat.chatName}</h2>
                                    {isAdmin && <BsPencilFill onClick={() => { setShowChatNameInput(true) }} />}
                                </>)
                            }
                        </div>
                    </div>
                    <div className="modal-content group-details-content" >
                        {isAdmin && <section className="inputs group-add-section" aria-label="Add group members">
                            <h3>Add people</h3>
                            <div className='modal-input'>
                                <input
                                    placeholder="Add new user"
                                    value={search}
                                    onChange={(e) => handleSearch(e.target.value)}
                                />
                                <AiOutlineUserAdd />
                            </div>
                            {activeSearch && search && <div className="width-100 search-users">
                                {loading ? <p className="group-search-state">Searching…</p> : searchResult.length
                                    ? searchResult.slice(0, 8).map((result) => (
                                        <UserListItem key={result._id} result={result} handleFunction={() => handleAddUser(result)} />
                                    ))
                                    : <p className="group-search-state">No users found.</p>}
                            </div>}
                        </section>}

                        <section className="group-members-section" aria-label="Group members">
                            <h3>Members <span>{selectedChat.users.length}</span></h3>
                            <div className="group-members-list">
                                {selectedChat.users.map((member) => {
                                    const memberIsAdmin = admins.some((admin) => (admin._id || admin) === member._id);
                                    return <div className="group-member-row" key={member._id}>
                                        <Avatar image={member.profilePic} alt={member.username} />
                                        <span className="group-member-name" title={member.username}>{member.username}{member._id === user._id ? " (you)" : ""}</span>
                                        {memberIsAdmin && <span className="group-admin-label">Admin</span>}
                                        <div className="group-member-actions">
                                            {isAdmin && member._id !== user._id && <button type="button" disabled={loading} onClick={() => handleAdminChange(member)}>
                                                {memberIsAdmin ? "Demote" : "Make admin"}
                                            </button>}
                                            {isAdmin && member._id !== user._id && <button type="button" className="remove-member-button" disabled={loading} onClick={() => handleRemove(member)} aria-label={`Remove ${member.username}`}>
                                                <GrFormClose />
                                            </button>}
                                        </div>
                                    </div>;
                                })}
                            </div>
                        </section>
                        <div className="group-exit-section">
                            <button type="button" className="group-exit-button" onClick={onLeaveGroup}>
                                <RxExit /> Exit Group
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <ToastContainer />
        </>
    );
};

export default UpdateGroupChat;
