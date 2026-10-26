const idOf = (id) => String(id?._id || id || "");

function getGroupAdminIds(chat) {
  const admins = (chat.groupAdmins || []).map(idOf).filter(Boolean);
  const legacyAdmin = idOf(chat.groupAdmin);
  if (legacyAdmin && !admins.includes(legacyAdmin)) admins.push(legacyAdmin);
  const participants = new Set((chat.users || []).map(idOf));
  return [...new Set(admins.filter((adminId) => participants.has(adminId)))];
}

function isGroupAdmin(chat, userId) {
  const targetId = idOf(userId);
  return (chat.users || []).map(idOf).includes(targetId) && getGroupAdminIds(chat).includes(targetId);
}

async function normalizeGroupAdmins(chat) {
  const admins = getGroupAdminIds(chat);
  const members = new Set((chat.users || []).map(idOf));
  chat.groupAdmins = admins.filter((id) => members.has(id));
  if (!chat.groupAdmins.length && chat.groupAdmin && members.has(idOf(chat.groupAdmin))) {
    chat.groupAdmins = [chat.groupAdmin._id || chat.groupAdmin];
  }
  return chat;
}

module.exports = { getGroupAdminIds, isGroupAdmin, normalizeGroupAdmins, idOf };
