import { useState, useCallback, useEffect } from "react";
// import { trpc } from "../lib/trpc"; // Temporarily comment out trpc import

export interface AuthUser {
  userId: string;
  email: string;
  name: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

const TOKEN_STORAGE_KEY = "auth_token";

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  // Temporarily set static auth state to bypass trpc calls
  useEffect(() => {
    setAuthState({
      user: {
        userId: "static-user-id",
        email: "test@example.com",
        name: "Test User",
      },
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    console.log("Register (static):", { email, password, name });
    return { success: true, user: { userId: "static-user-id", email, name: name || null } };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    console.log("Login (static):", { email, password });
    return { success: true, user: { userId: "static-user-id", email, name: "Test User" } };
  }, []);

  const logout = useCallback(async () => {
    console.log("Logout (static)");
    return { success: true };
  }, []);

  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    console.log("Update Password (static):", { currentPassword, newPassword });
    return { success: true, message: "Password updated (static)" };
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    console.log("Delete Account (static):", { password });
    return { success: true };
  }, []);

  const getToken = useCallback(() => {
    console.log("Get Token (static)");
    return "static-token";
  }, []);

  return {
    ...authState,
    register,
    login,
    logout,
    updatePassword,
    deleteAccount,
    getToken,
  };
}

