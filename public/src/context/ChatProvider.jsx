import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { currentUserRoute } from "../utils/APIRoutes";

const ChatContext = createContext();

const ChatProvider = ({ children }) => {
  const [selectedChat, setSelectedChat] = useState();
  const [user, setUser] = useState();
  const [authLoading, setAuthLoading] = useState(true);
  const [notification, setNotification] = useState([]);
  const [chats, setChats] = useState();
  const [chts, setChts] = useState();
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("chat_app_theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch (e) {
      return "light";
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("chat_app_theme", theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    let isMounted = true;
    const storageKey = process.env.REACT_APP_LOCALHOST_KEY;

    const initializeAuthentication = async () => {
      let storedUser;
      try {
        storedUser = JSON.parse(localStorage.getItem(storageKey));
      } catch (error) {
        localStorage.removeItem(storageKey);
      }

      if (!storedUser?.token) {
        if (isMounted) setAuthLoading(false);
        return;
      }

      try {
        // Validate the token and current account on the server before routes
        // treat a persisted browser value as an authenticated session.
        const { data } = await axios.get(currentUserRoute, {
          headers: { Authorization: `Bearer ${storedUser.token}` },
        });
        const authenticatedUser = { ...storedUser, ...data.user, token: storedUser.token };
        localStorage.setItem(storageKey, JSON.stringify(authenticatedUser));
        if (isMounted) setUser(authenticatedUser);
      } catch (error) {
        localStorage.removeItem(storageKey);
        if (isMounted) setUser(undefined);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    };

    initializeAuthentication();
    return () => { isMounted = false; };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(process.env.REACT_APP_LOCALHOST_KEY);
    setSelectedChat(undefined);
    setChats(undefined);
    setUser(undefined);
  }, []);


  return (
    <ChatContext.Provider
      value={{
        selectedChat,
        setSelectedChat,
        user,
        setUser,
        authLoading,
        logout,
        notification,
        setNotification,
        chats,
        setChats,
        chts, 
        setChts,
        theme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const ChatState = () => {
  return useContext(ChatContext);
};

export default ChatProvider;
