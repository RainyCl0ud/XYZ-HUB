import { NavLink, Outlet } from "react-router-dom";

function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">X</div>

          <div className="brand-copy">
            <h1 className="brand-name">XYZ Hub</h1>

            <p className="brand-subtitle">
              Agency Operation Management
            </p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/incidents"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Incidents
          </NavLink>

          <NavLink
            to="/rules"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Rules & Strike Reasons
          </NavLink>

          <NavLink
            to="/chatters"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Chatters
          </NavLink>

          <NavLink
            to="/configuration"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Configuration
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <span className="environment-dot" />
          <span>Development</span>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;