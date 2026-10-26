import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ChatProvider from './context/ChatProvider';

import Chat from "./pages/Chat";
import Authorization from "./pages/Authorization";
import VerifyEmail from "./pages/VerifyEmail";
import { PublicOnly, RequireAuth } from "./components/RouteGuards";

export default function App() {
  return (
    <BrowserRouter>
    <ChatProvider>
      <Routes>
        <Route path="/auth" element={<PublicOnly><Authorization /></PublicOnly>} />
        <Route path="/login" element={<PublicOnly><Authorization initialMode="yes" /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Authorization initialMode="no" /></PublicOnly>} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="*" element={<RequireAuth><Chat /></RequireAuth>} />
      </Routes>
      </ChatProvider>
    </BrowserRouter>
  );
}
