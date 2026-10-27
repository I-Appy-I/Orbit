import { useRef, useState } from "react";
import { IoIosArrowBack } from "react-icons/io";
import { useNavigate } from "react-router-dom";
import { BsPencil } from "react-icons/bs";
import { RxEyeOpen, RxEyeClosed } from "react-icons/rx";
import { FiMail, FiLock, FiUnlock } from "react-icons/fi";
import { ToastContainer, toast } from "react-toastify";

import axios from "axios";

import { ChatState } from "../context/ChatProvider";
import Avatar from "./Avatar";
import SubmitModal from "./Aux/SubmitModal";
import {
    renameUserRoute,
    emailUpdateRoute,
    profilePicUpdateRoute,
    passwordUpdateRoute,
    deleteUserRoute
} from "../utils/APIRoutes";
import { toastOptions } from "../utils/constants";


function UpdateProfile({ fetchAgain, setFetchAgain, onClose }) {
    const { user, setUser, logout } = ChatState();
    const navigate = useNavigate();
    const [deleteActive, setDeleteActive] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const deleteRequestInFlight = useRef(false);
    //new values 
    const [newUsername, setNewUsername] = useState();
    const [newEmail, setNewEmail] = useState("");
    const [emailLoading, setEmailLoading] = useState(false);
    const [oldPassword, setOldPassword] = useState();
    const [newPassword, setNewPassword] = useState();
    const [newPasswordConfirm, setNewPasswordConfirm] = useState();
    //show inputs
    const [showEmailInput, setShowEmailInput] = useState(false);
    const [showUsernameInput, setShowUsernameInput] = useState(false);
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    //show password
    const [showOld, setShowOld] = useState(false);
    const [show, setShow] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleLocalStorage = (data) => {
        if (data.status === true) {
            localStorage.setItem(
                process.env.REACT_APP_LOCALHOST_KEY,
                JSON.stringify(data.updatedUser)
            );
        }
    }

    const handleRename = async () => {
        setShowUsernameInput(false);
        if (!newUsername) return;
        try {
            const config = {
                headers:
                {
                    Authorization: `Bearer ${user.token}`
                }
            };
            const { data } = await axios.put(
                `${renameUserRoute}`,
                {
                    userId: user._id, newUsername: newUsername
                }, config
            );
            setUser(data.updatedUser);
            handleLocalStorage(data);
            setFetchAgain(!fetchAgain);
            toast.success("your username was changed successfully", toastOptions);
        } catch (error) {
            toast.error(error.response.data.message, toastOptions);
        }
        setNewUsername("");
    };

    const handleEmail = async () => {
        if (!newEmail || typeof newEmail !== "string" || !newEmail.trim()) {
            toast.error("Please enter a new email address", toastOptions);
            return;
        }

        const cleanEmail = newEmail.trim().toLowerCase();
        if (cleanEmail === (user?.email || "").toLowerCase()) {
            toast.error("New email cannot be the same as your current email", toastOptions);
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            toast.error("Please provide a valid email address", toastOptions);
            return;
        }

        try {
            setEmailLoading(true);
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`,
                },
            };
            const { data } = await axios.put(
                `${emailUpdateRoute}`,
                {
                    newEmail: cleanEmail,
                },
                config
            );

            if (data.status) {
                toast.success(data.msg || "Verification code sent to your new email!", toastOptions);
                setShowEmailInput(false);
                setNewEmail("");
                if (typeof onClose === "function") {
                    onClose();
                }
                navigate(`/verify-email?mode=email-change&email=${encodeURIComponent(cleanEmail)}`);
            } else {
                toast.error(data.msg || "Failed to request email change", toastOptions);
            }
        } catch (error) {
            const errorMsg =
                error.response?.data?.msg ||
                error.response?.data?.message ||
                "Failed to send verification code. Please try again.";
            toast.error(errorMsg, toastOptions);
        } finally {
            setEmailLoading(false);
        }
    };

    const imageUpload = async (event) => {
        event.preventDefault();
        const profilePic = event.target.files[0];
        const formData = new FormData();
        const config = {
            headers:
            {
                Authorization: `Bearer ${user.token}`
            }
        };
        try {
            formData.append("userId", user._id);
            if (profilePic) formData.append("profilePic", profilePic, profilePic.name);
            const { data } = await axios.put(
                `${profilePicUpdateRoute}`,
                formData,
                config
            );
            setUser(data.updatedUser);
            handleLocalStorage(data);
            setFetchAgain(!fetchAgain);
        } catch (error) {
            toast.error("something went wrong", toastOptions);
        }
    };

    const handlePassword = async () => {
        setShowPasswordInput(false);
        if (!newPassword || !oldPassword) return;
        if (newPassword !== newPasswordConfirm) {
            toast.error("Password and confirm password should be same.", toastOptions);
            return;
        }
        try {
            const config = { headers: { Authorization: `Bearer ${user.token}` } };
            const { data } = await axios.put(
                `${passwordUpdateRoute}`, { userId: user._id, oldPassword: oldPassword, newPassword: newPassword }, config
            );
            if (data.status === true) toast.success("your password was changed successfully", toastOptions);
            else toast.error("response.data.message", toastOptions);
            setFetchAgain(!fetchAgain);
        } catch (error) {
            toast.error(error.response.data.message, toastOptions);
        }
        setOldPassword("");
        setNewPassword("");
        setNewPasswordConfirm("");
    };

    const handleDelete = async () => {
        if (deleteRequestInFlight.current) return;
        deleteRequestInFlight.current = true;
        setDeleteLoading(true);
        try {
            const { data } = await axios.put(
                deleteUserRoute,
                { userId: user._id },
                { headers: { Authorization: `Bearer ${user.token}` } }
            );
            if (data.status === true) {
                logout();
                navigate("/auth", { replace: true });
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Unable to delete account", toastOptions);
        } finally {
            deleteRequestInFlight.current = false;
            setDeleteLoading(false);
        }
    };

    return (
        <>
            <section className="right-side profile-settings-panel user-update">
                <div className={`modal-container ${showPasswordInput ? "smaller" : ""}`}>
                    <div className="settings-panel-header">
                        <button className="icon-button" onClick={onClose} aria-label="Back to chats">
                            <IoIosArrowBack />
                        </button>
                        <div>
                            <h2>Profile settings</h2>
                            <p>Manage your account and profile.</p>
                        </div>
                    </div>
                    <div className="modal-header">
                        <div className="avatar">
                            <label>
                                <input
                                    type="file"
                                    name="profilePic"
                                    accept="image/*"
                                    onChange={(event) => imageUpload(event)} />
                                <Avatar image={user.profilePic}
                                    alt={user.username} />
                                <div className="hover-text">Update profile picture</div>
                            </label>
                        </div>
                    </div>
                    <div className="modal-content">
                        <div className="inputs">
                            {showUsernameInput
                                ? (<div className="modal-input">
                                    <input
                                        type="text"
                                        placeholder={user.username}
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                    />
                                    <BsPencil />
                                    <button className="button-submit" onClick={handleRename}>Save</button>
                                </div>)
                                : (<div className="modal-input not-show">
                                    <span>Username: </span>
                                    <span>{user.username}</span>
                                    <button className="button-submit" onClick={() => setShowUsernameInput(true)}>
                                        Update
                                    </button>
                                </div>)
                            }
                            {showEmailInput
                                ? (<div className="modal-input">
                                    <input
                                        type="email"
                                        placeholder={user.email}
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        disabled={emailLoading}
                                    />
                                    <FiMail />
                                    <button
                                        className="button-submit"
                                        onClick={handleEmail}
                                        disabled={emailLoading}
                                    >
                                        {emailLoading ? "Sending..." : "Save"}
                                    </button>
                                </div>)
                                : (<div className="modal-input not-show">
                                    <span>Email: </span>
                                    <span>{user.email}</span>
                                    <button className="button-submit" onClick={() => setShowEmailInput(true)}>Update</button>
                                </div>)
                            }
                            {showPasswordInput
                                ? (<>
                                    <div className="modal-input">
                                        <input
                                            type={`${showOld ? "text" : "password"}`}
                                            placeholder="Old password"
                                            value={oldPassword}
                                            onChange={(e) => setOldPassword(e.target.value)}
                                        />
                                        <FiUnlock />
                                        <RxEyeOpen
                                            className={`${showOld ? "password-icon" : "none"}`}
                                            onClick={() => { setShowOld(false) }}
                                        />
                                        <RxEyeClosed
                                            className={`${!showOld ? "password-icon" : "none"}`}
                                            onClick={() => { setShowOld(true) }}
                                        />
                                    </div>
                                    <div className="modal-input">
                                        <input
                                            type={`${show ? "text" : "password"}`}
                                            placeholder="New password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                        <FiUnlock />
                                        <RxEyeOpen
                                            className={`${show ? "password-icon" : "none"}`}
                                            onClick={() => { setShow(false) }}
                                        />
                                        <RxEyeClosed
                                            className={`${!show ? "password-icon" : "none"}`}
                                            onClick={() => { setShow(true) }}
                                        />
                                    </div>
                                    <div className="modal-input">
                                        <input
                                            type={`${showConfirm ? "text" : "password"}`}
                                            placeholder="Confirm new password"
                                            name="confirmPassword"
                                            value={newPasswordConfirm}
                                            onChange={(e) => setNewPasswordConfirm(e.target.value)}
                                        />
                                        <FiLock />
                                        <RxEyeOpen
                                            className={`${showConfirm ? "password-icon" : "none"}`}
                                            onClick={() => { setShowConfirm(false) }}
                                        />
                                        <RxEyeClosed
                                            className={`${showConfirm ? "none" : "password-icon"}`}
                                            onClick={() => { setShowConfirm(true) }}
                                        />
                                        <button className="button-submit" onClick={handlePassword}>Save</button>
                                    </div>
                                </>)
                                : (<div className="modal-input not-show">
                                    <span>Password: </span>
                                    <span>********</span>
                                    <button className="button-submit" onClick={() => setShowPasswordInput(true)}>Update</button>
                                </div>)
                            }
                        </div>
                        <div className="delete">
                            <button type="button" onClick={() => setDeleteActive(true)}>Delete account</button>
                        </div>
                    </div>
                </div>
            </section>
            {deleteActive && (
                <SubmitModal
                    setModalActive={(value) => setDeleteActive(value === "active")}
                    warnText="You cannot restore your account. All your chats and messages will be permanently deleted."
                    submText="Are you sure you want to delete your account?"
                    handleFunction={handleDelete}
                    isSubmitting={deleteLoading}
                />
            )}
            <ToastContainer />
        </>
    );
}

export default UpdateProfile;
