import {
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AuthShell from "../components/AuthShell";

import "./LoginImmersive.css";

import {
  ApiError,
  apiRequest,
} from "../lib/api";

import {
  useAuth,
} from "../auth/AuthContext";

type LoginResponse = {
  status:
    "TWO_FACTOR_REQUIRED";

  challengeId:
    string;

  expiresAt:
    string;
};

function LoginPage() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const {
    user,
    loading,
  } =
    useAuth();

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

  if (
    !loading &&
    user
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSubmitting(
      true
    );

    setError(
      null
    );

    try {
      const result =
        await apiRequest<LoginResponse>(
          "/api/auth/login",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                email,

                password,
              }),
          }
        );

      const routeState =
        location.state as
          | {
              from?: string;
            }
          | null;

      sessionStorage.setItem(
        "xyz_pending_2fa_challenge",

        result.challengeId
      );

      sessionStorage.setItem(
        "xyz_pending_2fa_email",

        email.trim()
      );

      sessionStorage.setItem(
        "xyz_after_login",

        routeState?.from ??
          "/"
      );

      navigate(
        "/verify-2fa",
        {
          replace:
            true,
        }
      );
    } catch (
      caught
    ) {
      if (
        caught instanceof
        ApiError
      ) {
        setError(
          caught.message
        );
      } else {
        setError(
          "Unable to sign in. Please try again."
        );
      }
    } finally {
      setSubmitting(
        false
      );
    }
  }

  return (
    <AuthShell
      immersive
      brandSubtitle="Internal Operations Portal"
      eyebrow="Secure sign in"
      title="Sign in to XYZ Hub"
      description="Sign in with your staff account to access the internal workspace. Verification may be required before access is granted."
      footer={
        <>
          This portal is for authorized
          internal staff only.
        </>
      }
    >
      <form
        className="auth-form"
        onSubmit={
          handleSubmit
        }
      >
        {error && (
          <div className="auth-message auth-message-error">
            {error}
          </div>
        )}

        <label className="auth-field">
          <span className="auth-label">
            Work email
          </span>

          <input
            className="auth-input"
            type="email"
            autoComplete="email"
            value={
              email
            }
            onChange={(
              event
            ) =>
              setEmail(
                event.target
                  .value
              )
            }
            placeholder="name@company.com"
            required
          />
        </label>

        <label className="auth-field">
          <div className="auth-field-header">
            <span className="auth-label">
              Password
            </span>

            <Link
              className="auth-link"
              to="/forgot-password"
            >
              Forgot password?
            </Link>
          </div>

          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={
              password
            }
            onChange={(
              event
            ) =>
              setPassword(
                event.target
                  .value
              )
            }
            placeholder="Enter your password"
            required
          />
        </label>

        <button
          className="auth-submit"
          type="submit"
          disabled={
            submitting
          }
        >
          {submitting
            ? "Checking credentials..."
            : "Continue"}
        </button>
      </form>
    </AuthShell>
  );
}

export default LoginPage;