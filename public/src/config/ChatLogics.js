export const extractId = (entity) => {
  if (!entity) return "";
  if (typeof entity === "string") return entity.trim();
  if (typeof entity === "number") return String(entity);
  if (typeof entity === "object") {
    if (entity._id) return extractId(entity._id);
    if (entity.id) return extractId(entity.id);
    if (typeof entity.toString === "function" && entity.toString !== Object.prototype.toString) {
      const str = entity.toString();
      if (str && str !== "[object Object]") return str.trim();
    }
  }
  return "";
};

export const isSameSenderMargin = (messages, m, i, userId) => {
  if (!messages || i < 0 || i >= messages.length) return "auto";
  const currentSender = extractId(m?.sender);
  const currentUserId = extractId(userId);
  const nextSender = i < messages.length - 1 ? extractId(messages[i + 1]?.sender) : null;
  const thisSender = extractId(messages[i]?.sender);

  if (
    i < messages.length - 1 &&
    nextSender === currentSender &&
    thisSender !== currentUserId
  ) {
    return 33;
  } else if (
    (i < messages.length - 1 &&
      nextSender !== currentSender &&
      thisSender !== currentUserId) ||
    (i === messages.length - 1 && thisSender !== currentUserId)
  ) {
    return 0;
  } else {
    return "auto";
  }
};

export const isAnotherSender = (message, userId) => {
  const senderId = extractId(message?.sender);
  const currentUserId = extractId(userId);
  if (!senderId || !currentUserId) return false;
  return senderId !== currentUserId;
};

export const isGroupRecieved = (message, chat, userId) => {
  const isGroup = Boolean(chat?.isGroupChat);
  return isGroup && isAnotherSender(message, userId);
};

export const getSender = (loggedUser, users) => {
  if (!users || users.length < 2) return "";
  const loggedId = extractId(loggedUser);
  return extractId(users[0]) === loggedId ? users[1]?.username : users[0]?.username;
};

export const getSenderProfilePic = (loggedUser, users) => {
  if (!users || users.length < 2) return undefined;
  const loggedId = extractId(loggedUser);
  return extractId(users[0]) === loggedId ? users[1]?.profilePic : users[0]?.profilePic;
};

export const getSenderFull = (loggedUser, users) => {
  if (!users || users.length < 2) return undefined;
  const loggedId = extractId(loggedUser);
  return extractId(users[0]) === loggedId ? users[1] : users[0];
};

export const isLastMessage = (messages, message, i) => {
  if (!messages || i < 0 || i >= messages.length) return false;
  if (i === 0) return true;
  const prevSenderId = extractId(messages[i - 1]?.sender);
  const currentSenderId = extractId(message?.sender);
  return !prevSenderId || !currentSenderId || prevSenderId !== currentSenderId;
};
