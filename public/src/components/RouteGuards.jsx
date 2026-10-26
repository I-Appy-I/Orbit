import { Navigate } from "react-router-dom";
import { ChatState } from "../context/ChatProvider";

export function RequireAuth({ children }) {
  const { user, authLoading } = ChatState();

  if (authLoading) return null;
  return user ? children : <Navigate to="/auth" replace />;
}

export function PublicOnly({ children }) {
  const { user, authLoading } = ChatState();

  if (authLoading) return null;
  return user ? <Navigate to="/" replace /> : children;
}
