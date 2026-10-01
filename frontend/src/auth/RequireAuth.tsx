import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import "./RequireAuth.css";

import {
  useAuth,
} from "./AuthContext";

function RequireAuth() {
  const {
    user,
    loading,
    authError,
    retryAuth,
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
    authError
  ) {
    return (
      <div className="auth-loading-screen auth-service-screen">
        <div className="auth-loading-mark auth-service-mark">
          !
        </div>

        <div className="auth-service-copy">
          <h1>
            Unable to reach XYZ Management
          </h1>

          <p>
            The server is taking longer than expected or is temporarily unavailable.
            Your account has not been signed out.
          </p>

          <p className="auth-service-detail">
            {authError}
          </p>
        </div>

        <button
          className="auth-service-retry"
          type="button"
          onClick={() => {
            void retryAuth();
          }}
        >
          Try again
        </button>
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
