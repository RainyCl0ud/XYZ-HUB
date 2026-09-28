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

  /*
   * Keep effective access synchronized across open
   * sessions. Role Builder changes are pushed by the
   * backend and /auth/me remains the source of truth.
   *
   * The same stream forwards People Management changes
   * as a browser event so open management screens can
   * refresh without a hard reload.
   */
  useEffect(
    () => {
      const currentUserId =
        user?.id;

      if (
        !currentUserId
      ) {
        return;
      }

      const source =
        new EventSource(
          `${API_BASE_URL}/api/live`,
          {
            withCredentials:
              true,
          }
        );

      const handleAccessChanged =
        (
          event:
            Event
        ) => {
          let targetUserId:
            string | null =
            null;

          if (
            event instanceof
              MessageEvent &&
            typeof event.data ===
              "string" &&
            event.data
          ) {
            try {
              const payload =
                JSON.parse(
                  event.data
                ) as {
                  userId?:
                    string;
                };

              targetUserId =
                payload.userId ??
                null;
            } catch {
              // Ignore malformed optional event metadata.
            }
          }

          if (
            targetUserId &&
            targetUserId !==
              currentUserId
          ) {
            return;
          }

          void refreshAuth()
            .catch(
              (
                error
              ) => {
                console.error(
                  "Unable to refresh live access:",
                  error
                );
              }
            );
        };

      const handlePeopleChanged =
        (
          event:
            Event
        ) => {
          let detail:
            unknown =
            null;

          if (
            event instanceof
              MessageEvent &&
            typeof event.data ===
              "string" &&
            event.data
          ) {
            try {
              detail =
                JSON.parse(
                  event.data
                );
            } catch {
              detail =
                null;
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

      source.addEventListener(
        "access.changed",
        handleAccessChanged
      );

      source.addEventListener(
        "people.changed",
        handlePeopleChanged
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

        source.close();
      };
    },
    [
      refreshAuth,
      user?.id,
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
