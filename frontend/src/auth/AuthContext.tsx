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
  API_BASE_URL,
  AUTH_EXPIRED_EVENT,
  PEOPLE_CHANGED_EVENT,
  ApiError,
  apiRequest,
} from "../lib/api";
import { releaseBackgroundPush } from "../lib/background-push";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastSignInAt: string | null;
  avatarUpdatedAt: string | null;
};

type AuthRole = {
  id: string;
  name: string;
  systemKey: string | null;
  rank: number | null;
  dataScope: string;
};

type AuthAccess = {
  roles: AuthRole[];
  highestRank: number | null;
  effectiveDataScope: string | null;
  permissions: string[];
  assignedModelIds: string[];
  canSeeAllModels: boolean;
};

type AuthMeResponse = {
  user: AuthUser;
  access: AuthAccess;
};

type AuthContextValue = {
  user: AuthUser | null;
  access: AuthAccess | null;
  loading: boolean;
  authError: string | null;
  refreshAuth: () => Promise<boolean>;
  retryAuth: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined
  );

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<AuthUser | null>(
      null
    );
  const [access, setAccess] =
    useState<AuthAccess | null>(
      null
    );
  const [loading, setLoading] =
    useState(true);
  const [authError, setAuthError] =
    useState<string | null>(
      null
    );

  const clearAuth =
    useCallback(
      () => {
        setUser(null);
        setAccess(null);
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

          setUser(result.user);
          setAccess(result.access);
          setAuthError(null);
          return true;
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status === 401
          ) {
            clearAuth();
            setAuthError(null);
            return false;
          }

          throw error;
        }
      },
      [clearAuth]
    );

  const retryAuth =
    useCallback(
      async () => {
        setLoading(true);
        setAuthError(null);

        try {
          await refreshAuth();
        } catch (error) {
          console.error(
            "Unable to restore authentication:",
            error
          );

          setAuthError(
            error instanceof Error
              ? error.message
              : "Unable to reach the XYZ Management API."
          );
        } finally {
          setLoading(false);
        }
      },
      [refreshAuth]
    );

  useEffect(
    () => {
      const handleAuthExpired =
        () => {
          clearAuth();
          setAuthError(null);
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
    [clearAuth]
  );

  useEffect(
    () => {
      let active = true;

      async function load() {
        try {
          await refreshAuth();
        } catch (error) {
          console.error(
            "Unable to restore authentication:",
            error
          );

          if (active) {
            clearAuth();
            setAuthError(
              error instanceof Error
                ? error.message
                : "Unable to reach the XYZ Management API."
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void load();

      return () => {
        active = false;
      };
    },
    [clearAuth, refreshAuth]
  );

  /*
   * Keep access, People Management, and security state synchronized
   * across open browser sessions.
   *
   * session.invalidated is targeted by user ID and is emitted after a
   * 2FA reset, account deactivation, or permanent deletion. Clearing
   * local auth here causes RequireAuth to remove an actively logged-in
   * user from the portal immediately instead of waiting for a later API
   * request to discover the revoked session.
   */
  useEffect(
    () => {
      const currentUserId =
        user?.id;

      if (!currentUserId) {
        return;
      }

      const source =
        new EventSource(
          `${API_BASE_URL}/api/live`,
          {
            withCredentials: true,
          }
        );

      const readUserId =
        (event: Event) => {
          if (
            !(event instanceof MessageEvent) ||
            typeof event.data !== "string" ||
            !event.data
          ) {
            return null;
          }

          try {
            const payload =
              JSON.parse(event.data) as {
                userId?: string;
              };

            return payload.userId ?? null;
          } catch {
            return null;
          }
        };

      const handleAccessChanged =
        (event: Event) => {
          const targetUserId =
            readUserId(event);

          if (
            targetUserId &&
            targetUserId !== currentUserId
          ) {
            return;
          }

          void refreshAuth().catch(
            (error) => {
              console.error(
                "Unable to refresh live access:",
                error
              );
            }
          );
        };

      const handlePeopleChanged =
        (event: Event) => {
          let detail: unknown = null;

          if (
            event instanceof MessageEvent &&
            typeof event.data === "string" &&
            event.data
          ) {
            try {
              detail =
                JSON.parse(event.data);
            } catch {
              detail = null;
            }
          }

          window.dispatchEvent(
            new CustomEvent(
              PEOPLE_CHANGED_EVENT,
              {
                detail,
              }
            )
          );
        };

      const handleSessionInvalidated =
        (event: Event) => {
          const targetUserId =
            readUserId(event);

          if (
            targetUserId ===
            currentUserId
          ) {
            clearAuth();
            setAuthError(null);
          }
        };

      source.addEventListener(
        "access.changed",
        handleAccessChanged
      );
      source.addEventListener(
        "people.changed",
        handlePeopleChanged
      );
      source.addEventListener(
        "session.invalidated",
        handleSessionInvalidated
      );

      return () => {
        source.removeEventListener(
          "access.changed",
          handleAccessChanged
        );
        source.removeEventListener(
          "people.changed",
          handlePeopleChanged
        );
        source.removeEventListener(
          "session.invalidated",
          handleSessionInvalidated
        );
        source.close();
      };
    },
    [clearAuth, refreshAuth, user?.id]
  );

  const logout =
    useCallback(
      async () => {
        if (user?.id) void releaseBackgroundPush(user.id).catch(() => {});
        try {
          await apiRequest<{
            status: string;
          }>(
            "/api/auth/logout",
            {
              method: "POST",
            }
          );
        } finally {
          clearAuth();
          setAuthError(null);
        }
      },
      [clearAuth, user?.id]
    );

  const value =
    useMemo(
      () => ({
        user,
        access,
        loading,
        authError,
        refreshAuth,
        retryAuth,
        logout,
      }),
      [
        user,
        access,
        loading,
        authError,
        refreshAuth,
        retryAuth,
        logout,
      ]
    );

  return (
    <AuthContext.Provider
      value={value}
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

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}
