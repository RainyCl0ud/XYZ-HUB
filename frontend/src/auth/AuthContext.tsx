import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  apiRequest,
} from "../lib/api";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastSignInAt:
    string | null;
};

type AuthRole = {
  id: string;
  name: string;
  systemKey:
    string | null;
  rank:
    number | null;
  dataScope: string;
};

type AuthAccess = {
  roles:
    AuthRole[];
  highestRank:
    number | null;
  effectiveDataScope:
    string | null;
  permissions:
    string[];
  assignedModelIds:
    string[];
  canSeeAllModels:
    boolean;
};

type AuthMeResponse = {
  user:
    AuthUser;
  access:
    AuthAccess;
};

type AuthContextValue = {
  user:
    AuthUser | null;
  access:
    AuthAccess | null;
  loading:
    boolean;
  refreshAuth:
    () => Promise<boolean>;
  logout:
    () => Promise<void>;
};

const AuthContext =
  createContext<
    AuthContextValue | undefined
  >(
    undefined
  );

export function AuthProvider({
  children,
}: {
  children:
    ReactNode;
}) {
  const [
    user,
    setUser,
  ] =
    useState<
      AuthUser | null
    >(
      null
    );

  const [
    access,
    setAccess,
  ] =
    useState<
      AuthAccess | null
    >(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const clearAuth =
    useCallback(
      () => {
        setUser(
          null
        );

        setAccess(
          null
        );
      },
      []
    );

  const refreshAuth =
    useCallback(
      async () => {
        try {
          const result =
            await apiRequest<AuthMeResponse>(
              "/api/auth/me"
            );

          setUser(
            result.user
          );

          setAccess(
            result.access
          );

          return true;
        } catch (
          error
        ) {
          if (
            error instanceof
              ApiError &&
            error.status ===
              401
          ) {
            clearAuth();

            return false;
          }

          throw error;
        }
      },
      [
        clearAuth,
      ]
    );

  /*
   * Protected API calls can discover an expired,
   * revoked or deactivated session before /auth/me
   * is called again. Listen for the shared API event
   * so route guards react immediately.
   */
  useEffect(
    () => {
      const handleAuthExpired =
        () => {
          clearAuth();
        };

      window.addEventListener(
        AUTH_EXPIRED_EVENT,
        handleAuthExpired
      );

      return () => {
        window.removeEventListener(
          AUTH_EXPIRED_EVENT,
          handleAuthExpired
        );
      };
    },
    [
      clearAuth,
    ]
  );

  useEffect(
    () => {
      let active =
        true;

      async function load() {
        try {
          await refreshAuth();
        } catch (
          error
        ) {
          console.error(
            "Unable to restore authentication:",
            error
          );

          if (
            active
          ) {
            clearAuth();
          }
        } finally {
          if (
            active
          ) {
            setLoading(
              false
            );
          }
        }
      }

      void load();

      return () => {
        active =
          false;
      };
    },
    [
      clearAuth,
      refreshAuth,
    ]
  );

  const logout =
    useCallback(
      async () => {
        try {
          await apiRequest<{
            status:
              string;
          }>(
            "/api/auth/logout",
            {
              method:
                "POST",
            }
          );
        } finally {
          clearAuth();
        }
      },
      [
        clearAuth,
      ]
    );

  const value =
    useMemo(
      () => ({
        user,
        access,
        loading,
        refreshAuth,
        logout,
      }),
      [
        user,
        access,
        loading,
        refreshAuth,
        logout,
      ]
    );

  return (
    <AuthContext.Provider
      value={
        value
      }
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(
      AuthContext
    );

  if (
    !context
  ) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}
