/**
 * Resolves the backend base URL dynamically from environment variables,
 * with http://localhost:5000 as the local development fallback.
 */
export function getBackendOrigin() {
  const envUrl = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "http://localhost:5000";
}

/**
 * Resolves the Socket.IO server URL from process.env.REACT_APP_SOCKET_URL when provided,
 * falling back to REACT_APP_API_URL, and then the local development URL.
 */
export function getSocketUrl() {
  const socketUrl = process.env.REACT_APP_SOCKET_URL;
  if (socketUrl && typeof socketUrl === "string" && socketUrl.trim()) {
    return socketUrl.trim().replace(/\/+$/, "");
  }
  return getBackendOrigin();
}

export const host = getBackendOrigin();
export const socketHost = getSocketUrl();

/**
 * Constructs a safe URL for message attachments with authenticated access support.
 */
export const getAttachmentUrl = (filename, token) => {
  if (!filename) return "";
  if (process.env.REACT_APP_ATTACHMENT_PATHS) {
    const base = process.env.REACT_APP_ATTACHMENT_PATHS.endsWith("/")
      ? process.env.REACT_APP_ATTACHMENT_PATHS
      : `${process.env.REACT_APP_ATTACHMENT_PATHS}/`;
    return `${base}${encodeURIComponent(filename)}`;
  }
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${host}/api/messages/attachment/${encodeURIComponent(filename)}${tokenQuery}`;
};

// Authentication routes
export const loginRoute = `${host}/api/auth/login`;
export const registerRoute = `${host}/api/auth/register`;
export const currentUserRoute = `${host}/api/auth/me`;

// User directory and profile routes
export const allUsersRoute = `${host}/api/auth/allUsers`;
export const deleteUserRoute = `${host}/api/auth/deleteUser`;
export const renameUserRoute = `${host}/api/auth/renameUser`;
export const emailUpdateRoute = `${host}/api/auth/emailUpdate`;
export const profilePicUpdateRoute = `${host}/api/auth/profilePicUpdate`;
export const passwordUpdateRoute = `${host}/api/auth/passwordUpdate`;

// Messaging and attachment routes
export const sendMessageRoute = `${host}/api/messages/addmsg`;
export const recieveMessageRoute = `${host}/api/messages/getmsg`;
export const attachmentRoute = `${host}/api/messages/attachment`;

// Direct and group conversation routes
export const accessChatRoute = `${host}/api/chats/accessChat`;
export const fetchChatsRoute = `${host}/api/chats/fetchChats`;
export const deleteChatRoute = `${host}/api/chats/deleteChat`;
export const groupChatRoute = `${host}/api/chats/group`;
export const renameGroupChatRoute = `${host}/api/chats/rename`;
export const removeGroupChatRoute = `${host}/api/chats/groupremove`;
export const exitGroupChatRoute = `${host}/api/chats/groupexit`;
export const addGroupChatRoute = `${host}/api/chats/groupadd`;
export const groupAdminRoute = `${host}/api/chats/groupadmin`;
export const updateGroupPicChatRoute = `${host}/api/chats/grouppic`;

// Blocking routes
export const blocksRoute = `${host}/api/blocks`;
