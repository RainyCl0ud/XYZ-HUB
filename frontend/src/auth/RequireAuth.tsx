import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import {
  useAuth,
} from "./AuthContext";

function RequireAuth() {
  const {
    user,
    loading,
  } =
    useAuth();

  const location =
    useLocation();

  if (
    loading
  ) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-mark">
          X
        </div>

        <p>
          Checking your session...
        </p>
      </div>
    );
  }

  if (
    !user
  ) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  return (
    <Outlet />
  );
}

export default RequireAuth;