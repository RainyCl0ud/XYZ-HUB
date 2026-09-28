import {
  useEffect,
  useState,
} from "react";

import {
  Outlet,
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

import xyzManagementLogo from "../assets/xyz-management-logo.svg";

import "./PortalAccess.css";
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

function AppLayout() {
  const navigate =
    useNavigate();

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
    mobileNavOpen,
    setMobileNavOpen,
  ] =
    useState(false);

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
    "XYZ Hub User";

  /*
   * Mobile navigation behaves as an off-canvas drawer.
   * Route links close the drawer from the click event;
   * viewport changes are handled by the media-query
   * subscription below.
   */

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

  const showModelContext =
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

  return (
    <div className="app-shell portal-shell">
      <header className="portal-command-bar">
        <div className="portal-command-context">
          <span className="portal-command-label">
            Model context
          </span>

          {showModelContext ? (
            canSwitchModelContext ? (
              <select
                id="portal-model-context"
                aria-label="Model context"
                value={activeModelId}
                onChange={(event) =>
                  changeModelContext(
                    event.target.value
                  )
                }
              >
                {(access?.canSeeAllModels ||
                  models.length > 1) && (
                  <option value="ALL">
                    {access?.canSeeAllModels
                      ? "All models"
                      : "All assigned models"}
                  </option>
                )}

                {models.map((model) => (
                  <option
                    key={model.id}
                    value={model.id}
                  >
                    {model.name}
                    {model.isActive
                      ? ""
                      : " (Inactive)"}
                  </option>
                ))}
              </select>
            ) : fixedModel ? (
              <div className="portal-command-context-static">
                {fixedModel.name}
                {fixedModel.isActive
                  ? ""
                  : " (Inactive)"}
              </div>
            ) : null
          ) : (
            <div className="portal-command-context-static">
              No model context
            </div>
          )}
        </div>

        <div className="portal-command-brand">
          <img
            src={xyzManagementLogo}
            alt=""
            className="portal-command-logo"
          />

          <strong>
            XYZ MANAGEMENT
          </strong>
        </div>

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

        <div className="portal-command-user">
          <span className="portal-command-label">
            Signed in
          </span>

          <strong>
            {roleNames}
          </strong>
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
        onClick={(event) => {
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
            src={xyzManagementLogo}
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
            aria-label="Close navigation"
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
                d="M6 6l12 12M18 6 6 18"
              />
            </svg>
          </button>
        </div>

        <SidebarNavigation access={access} />

        <div className="sidebar-account">
          <div className="sidebar-account-name">
            {user?.name ??
              "Signed in"}
          </div>

          <div className="sidebar-account-email">
            {user?.email}
          </div>

          <div className="sidebar-account-role">
            {roleNames}
          </div>

          <button
            className="sidebar-signout-button"
            type="button"
            onClick={() => {
              void handleLogout();
            }}
            disabled={signingOut}
          >
            {signingOut
              ? "Signing out..."
              : "Sign out"}
          </button>
        </div>

        <div className="sidebar-footer">
          <span className="environment-dot" />

          <span>
            {import.meta.env
              .VITE_APP_ENV ??
              "Development"}
          </span>
        </div>
      </aside>

      <main className="main-content">
        {modelContextReady ? (
          <Outlet
            key={activeModelId}
          />
        ) : (
          <div className="page">
            <div className="empty-state">
              <strong>
                Loading portal access…
              </strong>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AppLayout;
