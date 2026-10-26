import { useNavigate } from "react-router-dom";
import { BiPowerOff } from "react-icons/bi";
import { RxPencil2 } from "react-icons/rx";
import { IoAdd, IoSunnyOutline, IoMoonOutline } from "react-icons/io5";

import { ChatState } from "../context/ChatProvider";
import Avatar from "./Avatar";


function UserInfo({ onOpenSettings, onCreateGroup, groupCreateTriggerRef }) {
    const { user, logout, theme, toggleTheme } = ChatState();
    const navigate = useNavigate();

    const handleLogout = async () => {
        logout();
        navigate("/auth", { replace: true });
    };

    const isDark = theme === "dark";

    return (
        <div className="user-info">
            <div className="user-data tooltip">
                <Avatar image={user.profilePic}
                    alt={user.username}
                    className="icon-button" />
                <span className="user-name-label">{user.username}</span>
                <span className="tooltiptext">{user.username}</span>
            </div>
            <div className="user-info buttons">
                <div className="tooltip">
                    <button
                        type="button"
                        className="icon-button theme-toggle-btn"
                        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                        onClick={toggleTheme}
                    >
                        {isDark ? <IoSunnyOutline /> : <IoMoonOutline />}
                    </button>
                    <span className="tooltiptext">{isDark ? "Light mode" : "Dark mode"}</span>
                </div>
                <div className="tooltip">
                    <button className="icon-button" aria-label="Edit profile" onClick={onOpenSettings}>
                        <RxPencil2 />
                    </button>
                    <span className="tooltiptext">Update info</span>
                </div>
                <div className="tooltip">
                    <button
                        ref={groupCreateTriggerRef}
                        type="button"
                        className="icon-button create-group-button"
                        aria-label="Create group"
                        title="Create group"
                        onClick={onCreateGroup}
                    >
                        <IoAdd />
                    </button>
                    <span className="tooltiptext">Create group</span>
                </div>
                <div className="tooltip">
                    <button className="icon-button logout-btn" aria-label="Logout" onClick={handleLogout}>
                        <BiPowerOff />
                    </button>
                    <span className="tooltiptext">Logout</span>
                </div>
            </div>
        </div>
    );
}

export default UserInfo;
