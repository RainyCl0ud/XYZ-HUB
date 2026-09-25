import {
  useEffect,
  useState,
} from "react";

import {
  NavLink,
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

  const showManagementNavigation =
    capabilities.canManagePeople ||
    capabilities.canManageModels;

  const showSystemNavigation =
    capabilities.canManageRoles ||
    capabilities.canViewAudit;

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

        <div className="portal-command-user">
          <span className="portal-command-label">
            Signed in
          </span>

          <strong>
            {roleNames}
          </strong>
        </div>
      </header>

      <aside className="sidebar portal-sidebar">
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
        </div>

        <nav className="sidebar-nav">
          {capabilities.canViewQa ? (
            <>
              <div className="sidebar-nav-label">
                Quality
              </div>

              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive
                    ? "nav-link active"
                    : "nav-link"
                }
              >
                Overview
              </NavLink>

              <NavLink
                to="/incidents"
                className={({ isActive }) =>
                  isActive
                    ? "nav-link active"
                    : "nav-link"
                }
              >
                Incidents
              </NavLink>

              <NavLink
                to="/chatters"
                className={({ isActive }) =>
                  isActive
                    ? "nav-link active"
                    : "nav-link"
                }
              >
                Chatters
              </NavLink>

              {capabilities.canConfigureQa && (
                <>
                  <NavLink
                    to="/rules"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-link active"
                        : "nav-link"
                    }
                  >
                    Rules & Strike Reasons
                  </NavLink>

                  <NavLink
                    to="/configuration"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-link active"
                        : "nav-link"
                    }
                  >
                    Configuration
                  </NavLink>
                </>
              )}
            </>
          ) : (
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              Home
            </NavLink>
          )}

          {showManagementNavigation && (
            <>
              <div className="sidebar-nav-label sidebar-nav-label-system">
                Management
              </div>

              {capabilities.canManagePeople && (
                <NavLink
                  to="/people"
                  className={({ isActive }) =>
                    isActive
                      ? "nav-link active"
                      : "nav-link"
                  }
                >
                  People
                </NavLink>
              )}

              {capabilities.canManageModels && (
                <NavLink
                  to="/models"
                  className={({ isActive }) =>
                    isActive
                      ? "nav-link active"
                      : "nav-link"
                  }
                >
                  Models
                </NavLink>
              )}
            </>
          )}

          {showSystemNavigation && (
            <>
              <div className="sidebar-nav-label sidebar-nav-label-system">
                System
              </div>

              {capabilities.canManageRoles && (
                <NavLink
                  to="/roles"
                  className={({ isActive }) =>
                    isActive
                      ? "nav-link active"
                      : "nav-link"
                  }
                >
                  Role Builder
                </NavLink>
              )}

              {capabilities.canViewAudit && (
                <NavLink
                  to="/audit"
                  className={({ isActive }) =>
                    isActive
                      ? "nav-link active"
                      : "nav-link"
                  }
                >
                  Audit Log
                </NavLink>
              )}
            </>
          )}
        </nav>

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
