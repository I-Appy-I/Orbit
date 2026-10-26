import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  IoPersonOutline,
  IoPeopleOutline,
  IoSunnyOutline,
  IoMoonOutline,
  IoLogOutOutline,
  IoSettingsOutline,
} from "react-icons/io5";

import { ChatState } from "../context/ChatProvider";
import Avatar from "./Avatar";

function NavigationDrawer({
  isOpen,
  onClose,
  onOpenSettings,
  onCreateGroup,
  groupCreateTriggerRef,
}) {
  const { user, logout, theme, toggleTheme } = ChatState();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleProfileClick = () => {
    onClose();
    onOpenSettings();
  };

  const handleCreateGroupClick = () => {
    onClose();
    onCreateGroup();
  };

  const handleThemeToggle = () => {
    toggleTheme();
    onClose();
  };

  const handleLogout = () => {
    onClose();
    logout();
    navigate("/auth", { replace: true });
  };

  return (
    <div
      className="drawer-overlay"
      data-testid="drawer-overlay"
      onClick={onClose}
    >
      <aside
        className="drawer-content"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile Section */}
        <div
          className="drawer-profile"
          role="button"
          tabIndex={0}
          aria-label="Open profile settings"
          onClick={handleProfileClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleProfileClick();
            }
          }}
        >
          <div className="drawer-avatar-wrapper">
            <Avatar
              image={user?.profilePic}
              alt={user?.username}
              className="drawer-avatar"
            />
          </div>
          <div className="drawer-user-meta">
            <div className="drawer-username" title={user?.username}>
              {user?.username}
            </div>
            <div className="drawer-action-hint">
              <span>Settings</span>
              <IoSettingsOutline className="drawer-settings-icon" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="drawer-nav" aria-label="Menu actions">
          <ul className="drawer-menu-list">
            <li>
              <button
                type="button"
                className="drawer-menu-item"
                onClick={handleProfileClick}
              >
                <span className="drawer-icon" aria-hidden="true">
                  <IoPersonOutline />
                </span>
                <span className="drawer-label">My Profile</span>
              </button>
            </li>
            <li>
              <button
                ref={groupCreateTriggerRef}
                type="button"
                className="drawer-menu-item"
                onClick={handleCreateGroupClick}
              >
                <span className="drawer-icon" aria-hidden="true">
                  <IoPeopleOutline />
                </span>
                <span className="drawer-label">New Group</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="drawer-menu-item drawer-menu-item--theme"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                onClick={handleThemeToggle}
              >
                <span className="drawer-icon" aria-hidden="true">
                  {isDark ? <IoSunnyOutline /> : <IoMoonOutline />}
                </span>
                <span className="drawer-label">Night Mode</span>
                <span
                  className={`drawer-toggle-switch ${isDark ? "is-dark" : "is-light"}`}
                  aria-hidden="true"
                >
                  <span className="drawer-toggle-thumb" />
                </span>
              </button>
            </li>
            <li className="drawer-divider" role="separator" />
            <li>
              <button
                type="button"
                className="drawer-menu-item drawer-menu-item--danger"
                onClick={handleLogout}
              >
                <span className="drawer-icon" aria-hidden="true">
                  <IoLogOutOutline />
                </span>
                <span className="drawer-label">Log Out</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>
    </div>
  );
}

export default NavigationDrawer;
