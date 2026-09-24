import {
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

function AppLayout() {
  const navigate =
    useNavigate();

  const {
    user,
    access,
    logout,
  } =
    useAuth();

  const [
    signingOut,
    setSigningOut,
  ] =
    useState(false);

  const canManagePeople =
    access?.permissions.includes(
      "people.manage"
    ) ??
    false;

  const canManageModels =
    canManagePeople &&
    (
      access?.roles.some(
        (
          role
        ) =>
          role.systemKey ===
            "OWNER" ||
          role.systemKey ===
            "OPS_MANAGER"
      ) ??
      false
    );

  const canManageRoles =
    (
      access?.permissions.includes(
        "roles.manage"
      ) ??
      false
    ) &&
    (
      access?.roles.some(
        (
          role
        ) =>
          role.systemKey ===
          "OWNER"
      ) ??
      false
    );

  const roleNames =
    access?.roles
      .map(
        (role) =>
          role.name
      )
      .join(", ") ||
    "XYZ Hub User";

  async function handleLogout() {
    setSigningOut(
      true
    );

    try {
      await logout();

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">
            X
          </div>

          <div className="brand-copy">
            <h1 className="brand-name">
              XYZ Hub
            </h1>

            <p className="brand-subtitle">
              Agency Operation Management
            </p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({
              isActive,
            }) =>
              isActive
                ? "nav-link active"
                : "nav-link"
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/incidents"
            className={({
              isActive,
            }) =>
              isActive
                ? "nav-link active"
                : "nav-link"
            }
          >
            Incidents
          </NavLink>

          <NavLink
            to="/rules"
            className={({
              isActive,
            }) =>
              isActive
                ? "nav-link active"
                : "nav-link"
            }
          >
            Rules & Strike Reasons
          </NavLink>

          <NavLink
            to="/chatters"
            className={({
              isActive,
            }) =>
              isActive
                ? "nav-link active"
                : "nav-link"
            }
          >
            Chatters
          </NavLink>

          <NavLink
            to="/configuration"
            className={({
              isActive,
            }) =>
              isActive
                ? "nav-link active"
                : "nav-link"
            }
          >
            Configuration
          </NavLink>

          {canManagePeople && (
            <NavLink
              to="/people"
              className={({
                isActive,
              }) =>
                isActive
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              People
            </NavLink>
          )}

          {canManageModels && (
            <NavLink
              to="/models"
              className={({
                isActive,
              }) =>
                isActive
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              Models
            </NavLink>
          )}

          {canManageRoles && (
            <NavLink
              to="/roles"
              className={({
                isActive,
              }) =>
                isActive
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              Roles
            </NavLink>
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
            disabled={
              signingOut
            }
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
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;