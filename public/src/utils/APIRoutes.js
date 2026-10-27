/**
 * Resolves the backend base URL dynamically from environment variables,
 * with production diagnostics and a safe local development fallback.
 */
export function getBackendOrigin() {
  const envUrl = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL;
  if (envUrl && typeof envUrl === "string") {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // When deployed in production without an explicit API URL:
  if (process.env.NODE_ENV === "production") {
    if (
      typeof window !== "undefined" &&
      window.location &&
      window.location.origin &&
      !window.location.origin.includes("localhost")
    ) {
      return window.location.origin;
    }
    console.error(
      "[Orbit Configuration Warning] REACT_APP_API_URL is not configured in production. " +
        "Please configure REACT_APP_API_URL in your deployment environment."
    );
  }

  // Safe local development default
  return "http://localhost:5000";
}

export const host = getBackendOrigin();
export const socketHost = (process.env.REACT_APP_SOCKET_URL || host).trim().replace(/\/+$/, "");

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

export const loginRoute = `${host}/api/auth/login`;
export const registerRoute = `${host}/api/auth/register`;
export const currentUserRoute = `${host}/api/auth/me`;

export const allUsersRoute = `${host}/api/auth/allUsers`;
export const deleteUserRoute = `${host}/api/auth/deleteUser`;

export const renameUserRoute = `${host}/api/auth/renameUser`;
export const emailUpdateRoute = `${host}/api/auth/emailUpdate`;
export const profilePicUpdateRoute = `${host}/api/auth/profilePicUpdate`;
export const passwordUpdateRoute = `${host}/api/auth/passwordUpdate`;

export const sendMessageRoute = `${host}/api/messages/addmsg`;
export const recieveMessageRoute = `${host}/api/messages/getmsg`;
export const attachmentRoute = `${host}/api/messages/attachment`;

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
export const blocksRoute = `${host}/api/blocks`;
