export const host = "http://localhost:5000";
export const loginRoute = `${host}/api/auth/login`;
export const registerRoute = `${host}/api/auth/register`;
export const currentUserRoute = `${host}/api/auth/me`;
export const verifyEmailRoute = `${host}/api/auth/verify-email`;
export const verifyCodeRoute = `${host}/api/auth/verify-code`;
export const resendVerificationRoute = `${host}/api/auth/resend-verification`;

export const allUsersRoute = `${host}/api/auth/allUsers`;
export const deleteUserRoute = `${host}/api/auth/deleteUser`;

export const renameUserRoute = `${host}/api/auth/renameUser`;
export const emailUpdateRoute = `${host}/api/auth/emailUpdate`;
export const profilePicUpdateRoute = `${host}/api/auth/profilePicUpdate`;
export const passwordUpdateRoute = `${host}/api/auth/passwordUpdate`;

export const sendMessageRoute = `${host}/api/messages/addmsg`;
export const recieveMessageRoute = `${host}/api/messages/getmsg`;

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
