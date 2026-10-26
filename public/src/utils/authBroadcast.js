/**
 * Cross-tab communication for authentication events using BroadcastChannel
 * with a localStorage storage-event fallback.
 */

const CHANNEL_NAME = "orbit_auth_channel";
const STORAGE_KEY = "orbit_auth_event";

/**
 * Broadcasts an auth event (e.g. email verification success) to all open tabs on the same origin.
 * Does NOT broadcast tokens, passwords, or sensitive information.
 * @param {Object} payload - Non-sensitive event payload
 */
export function broadcastAuthEvent(payload) {
  const eventData = {
    ...payload,
    _timestamp: Date.now(),
  };

  // 1. BroadcastChannel API
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(eventData);
      channel.close();
    } catch (e) {
      // Fall through to localStorage fallback
    }
  }

  // 2. localStorage fallback (triggers 'storage' event across other tabs on the same origin)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(eventData));
    // Clear quickly so future identical events also trigger storage change events if needed
    setTimeout(() => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }, 500);
  } catch (e) {}
}

/**
 * Subscribes to cross-tab auth events.
 * @param {Function} onEvent - Callback receiving the event payload
 * @returns {Function} Cleanup function to unsubscribe and close channels
 */
export function subscribeToAuthEvents(onEvent) {
  let channel = null;

  const handleMessage = (data) => {
    if (data && typeof onEvent === "function") {
      onEvent(data);
    }
  };

  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        handleMessage(event.data);
      };
    } catch (e) {
      channel = null;
    }
  }

  const handleStorage = (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        handleMessage(parsed);
      } catch (e) {}
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    if (channel) {
      try {
        channel.close();
      } catch (e) {}
    }
    window.removeEventListener("storage", handleStorage);
  };
}
