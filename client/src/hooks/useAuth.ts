import { useState, useCallback, useEffect } from "react";
import { trpc } from "../lib/trpc";

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

  // Initialize auth state from stored token
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!token) {
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
        return;
      }

      try {
        const verifyResult = await trpc.auth.verifyToken.query({ token });

        if (!verifyResult.valid || !verifyResult.userId) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            error: null,
          });
          return;
        }

        const session = await trpc.auth.getSession.query({ token });

        if (session) {
          setAuthState({
            user: {
              userId: session.userId,
              email: session.email || "",
              name: session.name,
            },
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            error: null,
          });
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: "Failed to initialize authentication",
        });
      }
    };

    initializeAuth();
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await trpc.auth.registerUser.mutate({
          email,
          password,
          name,
        });

        localStorage.setItem(TOKEN_STORAGE_KEY, result.token);

        setAuthState({
          user: {
            userId: result.userId,
            email: result.email,
            name: name || null,
          },
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });

        return { success: true, user: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Registration failed";
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await trpc.auth.loginUser.mutate({
        email,
        password,
      });

      localStorage.setItem(TOKEN_STORAGE_KEY, result.token);

      setAuthState({
        user: {
          userId: result.userId,
          email: result.email,
          name: result.name,
        },
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });

      return { success: true, user: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, isLoading: true }));

    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (token) {
        // await trpc.auth.logout.mutate({ token }); // Logout is handled client-side by clearing token
      }

      localStorage.removeItem(TOKEN_STORAGE_KEY);

      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Logout failed";
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, []);

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);

        if (!token || !authState.user) {
          throw new Error("Not authenticated");
        }

        const result = await trpc.auth.updatePassword.mutate({
          userId: authState.user.userId,
          currentPassword,
          newPassword,
          token,
        });

        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return { success: true, message: result.message };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Password update failed";
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        return { success: false, error: errorMessage };
      }
    },
    [authState.user]
  );

  const deleteAccount = useCallback(async (password: string) => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!token || !authState.user) {
        throw new Error("Not authenticated");
      }

      await trpc.auth.deleteAccount.mutate({
        userId: authState.user.userId,
        password,
        token,
      });

      localStorage.removeItem(TOKEN_STORAGE_KEY);

      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Account deletion failed";
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [authState.user]);

  const getToken = useCallback(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
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

