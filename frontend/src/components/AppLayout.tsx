import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  getPortalCapabilities,
} from "../auth/portalAccess";

import {
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
} from "../lib/api";

import {
  getCurrentUserAvatarUrl,
} from "../lib/profile-avatar";

import UserAvatar from "./UserAvatar";
import NotificationBell from "./NotificationBell";

import xyzManagementLogo from "../assets/xyz-management-logo.svg";

import "./PortalAccess.css";
import { CENTRAL_TIME_ZONE } from "../lib/central-time";
import SidebarNavigation from "./SidebarNavigation";

const MODEL_CONTEXT_STORAGE_KEY =
  "xyz_active_model_id";


type AccessModel = {
  id: string;
  name: string;
  isActive: boolean;
};

type AccessModelsResponse = {
  models:
    AccessModel[];

  canSeeAllModels:
    boolean;

  canConfigureQa:
    boolean;
};

const QA_PATHS =
  new Set([
    "/incidents",
    "/chatters",
    "/rules",
    "/rules/settings",
  ]);

const PAGE_TITLES:
  Record<
    string,
    string
  > = {
  "/":
    "Dashboard",
  "/clock": "Clock & Hours",
  "/incidents":
    "Incidents",
  "/chatters":
    "Chatters",
  "/rules":
    "Rules",
  "/rules/settings":
    "Rule Settings",
  "/strikes":
    "Strike Management",
  "/my-strikes":
    "My Strikes",
  "/strikes/reasons":
    "Strike Reasons",
  "/strikes/settings":
    "Strike Ladder Configuration",
  "/people":
    "Employee Management",
  "/models":
    "Creators",
  "/roles":
    "Role Settings",
  "/audit":
    "Audit Log",
  "/account":
    "My Account",
};

function formatCentralClock(
  value:
    Date
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      hour:
        "numeric",
      minute:
        "2-digit",
    }
  ).format(
    value
  );
}

// The header button shows just the first name; the full name is in its
// tooltip, its spoken label and the account menu.
function firstNameOf(
  name?: string | null
) {
  const first = (name ?? "").trim().split(/\s+/).find((word) => /[\p{L}\p{N}]/u.test(word));
  return first ?? (name ?? "").trim();
}

// Short US Central zone name for the header: CST or CDT.
function formatCentralZone(
  value:
    Date
) {
  return (
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          CENTRAL_TIME_ZONE,
        timeZoneName:
          "short",
      }
    )
      .formatToParts(
        value
      )
      .find(
        (
          part
        ) =>
          part.type ===
          "timeZoneName"
      )
      ?.value ??
    "CT"
  );
}

// Header date under the time, e.g. "Sun, Nov 22". The zone sits on the
// time itself, and the full date is in the tooltip.
function formatCentralDay(
  value:
    Date,
  long = false
) {
  return new Intl.DateTimeFormat(
    "en-US",
    long
      ? { timeZone: CENTRAL_TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { timeZone: CENTRAL_TIME_ZONE, weekday: "short", month: "short", day: "numeric" }
  ).format(
    value
  );
}

function AppLayout() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const {
    user,
    access,
    logout,
  } =
    useAuth();

  const capabilities =
    getPortalCapabilities(
      access
    );

  const [
    signingOut,
    setSigningOut,
  ] =
    useState(false);

  const [
    accountMenuOpen,
    setAccountMenuOpen,
  ] =
    useState(false);

  const [
    logoutConfirmOpen,
    setLogoutConfirmOpen,
  ] =
    useState(false);

  const accountMenuRef =
    useRef<
      HTMLDivElement |
      null
    >(
      null
    );

  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] =
    useState(false);

  const [
    now,
    setNow,
  ] =
    useState(
      () =>
        new Date()
    );

  const [
    models,
    setModels,
  ] =
    useState<
      AccessModel[]
    >([]);

  const [
    activeModelId,
    setActiveModelId,
  ] =
    useState(
      () =>
        localStorage.getItem(
          MODEL_CONTEXT_STORAGE_KEY
        ) ??
        "ALL"
    );

  const [
    modelContextReady,
    setModelContextReady,
  ] =
    useState(
      !capabilities.canViewQa
    );

  const isChatterDetailPage =
    location.pathname.startsWith(
      "/chatters/"
    );

  const isPeopleDetailPage =
    location.pathname.startsWith(
      "/people/"
    );
  const isClockRequestDetailPage =
    location.pathname.startsWith("/clock/requests/");



  const pageTitle =
    isChatterDetailPage
      ? "Chatter QA"
      : isPeopleDetailPage
        ? "Employee Profile"
        : isClockRequestDetailPage
          ? "Correction Details"
          : PAGE_TITLES[
            location.pathname
          ] ??
          "XYZ Management";

  const isQaPage =
    QA_PATHS.has(
      location.pathname
    ) ||
    isChatterDetailPage;

  useEffect(
    () => {
      const timer =
        window.setInterval(
          () => {
            setNow(
              new Date()
            );
          },
          30_000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    []
  );

  useEffect(
    () => {
      let active =
        true;

      async function loadModels() {
        setModelContextReady(
          false
        );

        if (
          !capabilities.canViewQa
        ) {
          if (
            active
          ) {
            setModels([]);
            setActiveModelId(
              "ALL"
            );
          }

          localStorage.removeItem(
            MODEL_CONTEXT_STORAGE_KEY
          );

          if (
            active
          ) {
            setModelContextReady(
              true
            );
          }

          return;
        }

        try {
          const response =
            await apiRequest<AccessModelsResponse>(
              "/api/access/models"
            );

          if (
            !active
          ) {
            return;
          }

          setModels(
            response.models
          );

          const stored =
            localStorage.getItem(
              MODEL_CONTEXT_STORAGE_KEY
            );

          const storedExists =
            stored &&
            stored !== "ALL" &&
            response.models.some(
              (
                model
              ) =>
                model.id ===
                stored
            );

          let next =
            "ALL";

          if (
            storedExists
          ) {
            next =
              stored as string;
          } else if (
            !response.canSeeAllModels &&
            response.models.length ===
              1
          ) {
            next =
              response.models[0].id;
          }

          setActiveModelId(
            next
          );

          localStorage.setItem(
            MODEL_CONTEXT_STORAGE_KEY,
            next
          );
        } catch (
          error
        ) {
          console.error(
            "Unable to load model context:",
            error
          );
        } finally {
          if (
            active
          ) {
            setModelContextReady(
              true
            );
          }
        }
      }

      void loadModels();

      return () => {
        active =
          false;
      };
    },
    [
      capabilities.canViewQa,
      access?.canSeeAllModels,
    ]
  );

  const roleNames =
    access?.roles
      .map(
        (
          role
        ) =>
          role.name
      )
      .join(
        ", "
      ) ||
    "XYZ Management";

  useEffect(
    () => {
      if (
        !accountMenuOpen
      ) {
        return;
      }

      const handlePointerDown =
        (
          event:
            MouseEvent
        ) => {
          const target =
            event.target;

          if (
            target instanceof
              Node &&
            accountMenuRef.current &&
            !accountMenuRef.current.contains(
              target
            )
          ) {
            setAccountMenuOpen(
              false
            );
          }
        };

      const handleKeyDown =
        (
          event:
            KeyboardEvent
        ) => {
          if (
            event.key ===
              "Escape"
          ) {
            setAccountMenuOpen(
              false
            );
          }
        };

      document.addEventListener(
        "mousedown",
        handlePointerDown
      );

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () => {
        document.removeEventListener(
          "mousedown",
          handlePointerDown
        );

        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      accountMenuOpen,
    ]
  );

  useEffect(
    () => {
      const mediaQuery =
        window.matchMedia(
          "(max-width: 720px)"
        );

      const handleViewportChange =
        (
          event:
            MediaQueryListEvent
        ) => {
          if (
            !event.matches
          ) {
            setMobileNavOpen(
              false
            );
          }
        };

      mediaQuery.addEventListener(
        "change",
        handleViewportChange
      );

      return () => {
        mediaQuery.removeEventListener(
          "change",
          handleViewportChange
        );
      };
    },
    []
  );

  useEffect(
    () => {
      if (
        !logoutConfirmOpen
      ) {
        return;
      }

      const handleKeyDown =
        (
          event:
            KeyboardEvent
        ) => {
          if (
            event.key ===
              "Escape" &&
            !signingOut
          ) {
            setLogoutConfirmOpen(
              false
            );
          }
        };

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () => {
        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      logoutConfirmOpen,
      signingOut,
    ]
  );

  useEffect(
    () => {
      if (
        !mobileNavOpen
      ) {
        return;
      }

      const previousOverflow =
        document.body.style
          .overflow;

      document.body.style
        .overflow =
        "hidden";

      const handleKeyDown =
        (
          event:
            KeyboardEvent
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            setMobileNavOpen(
              false
            );
          }
        };

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () => {
        document.body.style
          .overflow =
          previousOverflow;

        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      mobileNavOpen,
    ]
  );

  async function handleLogout() {
    setSigningOut(
      true
    );

    try {
      await logout();

      localStorage.removeItem(
        MODEL_CONTEXT_STORAGE_KEY
      );

      navigate(
        "/login",
        {
          replace:
            true,
        }
      );
    } finally {
      setSigningOut(
        false
      );
    }
  }

  function changeModelContext(
    value:
      string
  ) {
    setActiveModelId(
      value
    );

    localStorage.setItem(
      MODEL_CONTEXT_STORAGE_KEY,
      value
    );

    window.dispatchEvent(
      new CustomEvent(
        MODEL_CONTEXT_CHANGED_EVENT,
        {
          detail: {
            modelId:
              value,
          },
        }
      )
    );
  }

  const supportsCreatorContext =
    location.pathname ===
      "/" ||
    isQaPage;

  const showModelContext =
    supportsCreatorContext &&
    capabilities.canViewQa &&
    (
      models.length >
        0 ||
      access?.canSeeAllModels
    );

  const canSwitchModelContext =
    Boolean(
      access?.canSeeAllModels
    ) ||
    models.length >
      1;

  const fixedModel =
    !canSwitchModelContext &&
    models.length ===
      1
      ? models[0]
      : null;

  const centralClock =
    useMemo(
      () =>
        formatCentralClock(
          now
        ),
      [
        now,
      ]
    );

  const centralDay =
    useMemo(
      () =>
        formatCentralDay(
          now
        ),
      [
        now,
      ]
    );

  const centralDayLong =
    useMemo(
      () =>
        formatCentralDay(
          now,
          true
        ),
      [
        now,
      ]
    );

  const centralZone =
    useMemo(
      () =>
        formatCentralZone(
          now
        ),
      [
        now,
      ]
    );

  return (
    <div
      className={
        `app-shell portal-shell${showModelContext
          ? " portal-shell-context"
          : ""}`
      }
    >
      <header className="portal-command-bar portal-command-bar-v2">
        <button
          type="button"
          className="portal-mobile-menu-button"
          aria-label="Open navigation"
          aria-controls="portal-mobile-navigation"
          aria-expanded={
            mobileNavOpen
          }
          onClick={() =>
            setMobileNavOpen(
              true
            )
          }
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M4 7h16M4 12h16M4 17h16"
            />
          </svg>
        </button>

        <div className="portal-page-context">
          <span className="portal-command-label">
            XYZ Management
          </span>

          <strong>
            {pageTitle}
          </strong>
        </div>

        {showModelContext ? (
          <div className="portal-command-context portal-command-context-v2">
            <span className="portal-command-label">
              Creator
            </span>

            {canSwitchModelContext ? (
              <select
                id="portal-model-context"
                aria-label="Creator"
                value={
                  activeModelId
                }
                onChange={(
                  event
                ) =>
                  changeModelContext(
                    event.target.value
                  )
                }
              >
                {(access?.canSeeAllModels ||
                  models.length >
                    1) && (
                  <option value="ALL">
                    {access?.canSeeAllModels
                      ? "All creators"
                      : "All assigned creators"}
                  </option>
                )}

                {models.map(
                  (
                    model
                  ) => (
                    <option
                      key={
                        model.id
                      }
                      value={
                        model.id
                      }
                    >
                      {model.name}
                      {model.isActive
                        ? ""
                        : " (Inactive)"}
                    </option>
                  )
                )}
              </select>
            ) : fixedModel ? (
              <div className="portal-command-context-static">
                {fixedModel.name}
                {fixedModel.isActive
                  ? ""
                  : " (Inactive)"}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="portal-command-context-spacer" />
        )}

        <div className="portal-command-meta">
          <NotificationBell />
          <div className="portal-command-time">
            <strong className="portal-clock-time">
              {centralClock}
              <span className="portal-clock-zone">
                {" "}
                {centralZone}
              </span>
            </strong>

            <small
              className="portal-clock-date"
              title={
                centralDayLong
              }
            >
              {centralDay}
            </small>
          </div>

          <div
            className="portal-account-menu"
            ref={
              accountMenuRef
            }
          >
            <button
              type="button"
              className="portal-account-avatar-button"
              aria-label={`${user?.name ?? "Account"}, ${roleNames}: open account menu`}
              aria-haspopup="menu"
              aria-expanded={
                accountMenuOpen
              }
              onClick={() =>
                setAccountMenuOpen(
                  (
                    current
                  ) =>
                    !current
                )
              }
            >
              <UserAvatar
                name={
                  user?.name
                }
                src={
                  getCurrentUserAvatarUrl(
                    user?.avatarUpdatedAt
                  )
                }
                className="portal-account-avatar"
              />

              {/* Desktop shows who is signed in; phones keep the avatar only. */}
              <span className="portal-account-identity">
                <strong
                  title={
                    user?.name
                  }
                >
                  {firstNameOf(
                    user?.name
                  )}
                </strong>

                <small
                  title={
                    roleNames
                  }
                >
                  {roleNames}
                </small>
              </span>

              <svg
                className="portal-account-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {accountMenuOpen && (
              <div
                className="portal-account-dropdown"
                role="menu"
              >
                <div className="portal-account-dropdown-profile">
                  <UserAvatar
                    name={
                      user?.name
                    }
                    src={
                      getCurrentUserAvatarUrl(
                        user?.avatarUpdatedAt
                      )
                    }
                    className="portal-account-dropdown-avatar"
                  />

                  <div>
                    <strong>
                      {user?.name ??
                        "Account"}
                    </strong>

                    <small>
                      {user?.email}
                    </small>

                    <span>
                      {roleNames}
                    </span>
                  </div>
                </div>

                <div className="portal-account-dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="portal-account-dropdown-item"
                  onClick={() => {
                    setAccountMenuOpen(
                      false
                    );

                    navigate(
                      "/account"
                    );
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"
                    />
                  </svg>

                  <span>
                    Manage profile
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="portal-account-dropdown-item danger"
                  onClick={() => {
                    setAccountMenuOpen(
                      false
                    );

                    setLogoutConfirmOpen(
                      true
                    );
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"
                    />
                  </svg>

                  <span>
                    Sign out
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="portal-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() =>
            setMobileNavOpen(
              false
            )
          }
        />
      )}

      <aside
        id="portal-mobile-navigation"
        className={
          `sidebar portal-sidebar${mobileNavOpen
            ? " mobile-open"
            : ""}`
        }
        onClick={(
          event
        ) => {
          const target =
            event.target;

          if (
            target instanceof
              Element &&
            target.closest(
              "a"
            )
          ) {
            setMobileNavOpen(
              false
            );
          }
        }}
      >
        <div className="sidebar-header portal-workspace-header portal-brand-header">
          <img
            src={
              xyzManagementLogo
            }
            alt=""
            className="portal-sidebar-logo"
          />

          <div className="brand-copy">
            <h1 className="brand-name">
              XYZ Management
            </h1>

            <p className="brand-subtitle">
              Management Hub
            </p>
          </div>

          <button
            type="button"
            className="portal-mobile-drawer-close"
            aria-label="Collapse navigation"
            onClick={() =>
              setMobileNavOpen(
                false
              )
            }
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="m15 6-6 6 6 6"
              />
            </svg>
          </button>
        </div>

        <SidebarNavigation
          access={
            access
          }
        />

      </aside>

      {logoutConfirmOpen && (
        <div
          className="portal-account-confirm-overlay"
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setLogoutConfirmOpen(
                false
              );
            }
          }}
        >
          <section
            className="portal-account-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm sign out"
          >
            <span className="page-eyebrow">
              Account
            </span>

            <h3>
              Sign out?
            </h3>

            <p>
              You will need to sign in again to access XYZ Management.
            </p>

            <div className="portal-account-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setLogoutConfirmOpen(
                    false
                  )
                }
                disabled={
                  signingOut
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  setLogoutConfirmOpen(
                    false
                  );

                  void handleLogout();
                }}
                disabled={
                  signingOut
                }
              >
                {signingOut
                  ? "Signing out…"
                  : "Sign out"}
              </button>
            </div>
          </section>
        </div>
      )}

      <main className="main-content">
        {modelContextReady ? (
          <Outlet
            key={
              isQaPage
                ? activeModelId
                : location.pathname
            }
          />
        ) : (
          <div className="page">
            <div className="empty-state">
              <strong>
                Loading workspace…
              </strong>
            </div>
          </div>
        )}
      </main>

      <footer
        className="hub-confidentiality-footer portal-persistent-footer"
        aria-label="Confidentiality notice"
      >
        XYZ MGMT &mdash; Confidential &amp; For Internal Use Only
      </footer>
    </div>
  );
}

export default AppLayout;
