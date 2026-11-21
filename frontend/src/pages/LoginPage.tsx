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
import PasswordField from "../components/PasswordField";

import {
  ApiError,
  SIGNED_OUT_STORAGE_KEY,
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

  // AUTHENTICATOR: enter the app's code (email
  // available as a backup). EMAIL: a code was sent.
  method?:
    "EMAIL" | "AUTHENTICATOR";
};

const SIGNED_OUT_MESSAGES = [
  "Nice work today. Your workspace will be ready when you return.",
  "A short reset can make the next session sharper.",
  "Good progress compounds. Pick things up again when you are ready.",
  "Your session is closed securely. Enjoy the rest of your day.",
  "One task at a time is still forward progress.",
  "You are all signed out. Come back whenever the next task is ready.",
] as const;

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
    signedOutAt,
    setSignedOutAt,
  ] =
    useState<string | null>(
      () =>
        window.sessionStorage.getItem(
          SIGNED_OUT_STORAGE_KEY
        )
    );

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

  const signedOutValue =
    Number(
      signedOutAt ??
        "0"
    );

  const signedOutMessage =
    SIGNED_OUT_MESSAGES[
      Number.isFinite(
        signedOutValue
      )
        ? Math.abs(
            signedOutValue
          ) %
          SIGNED_OUT_MESSAGES.length
        : 0
    ];

  function showSignIn() {
    window.sessionStorage.removeItem(
      SIGNED_OUT_STORAGE_KEY
    );

    setSignedOutAt(
      null
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
        "xyz_pending_2fa_method",

        result.method ??
          "EMAIL"
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

  if (
    signedOutAt
  ) {
    return (
      <AuthShell
        eyebrow="Signed out"
        title="You are signed out"
        description="Your session has been closed and this browser no longer has access to the workspace."
        footer={
          <>
            XYZ Management will be ready when you return.
          </>
        }
      >
        <div className="auth-signed-out">
          <div
            className="auth-signed-out-avatar-wrap"
            aria-hidden="true"
          >
            <div className="auth-signed-out-avatar">
              XYZ
            </div>

            <span className="auth-signed-out-check">
              ✓
            </span>
          </div>

          <p className="auth-signed-out-message">
            {signedOutMessage}
          </p>

          <p className="auth-signed-out-note">
            Sign in again whenever you need to continue.
          </p>

          <button
            className="auth-submit"
            type="button"
            onClick={
              showSignIn
            }
          >
            Sign in again
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Secure access"
      title="Sign in to XYZ Management"
      description="Enter your agency account credentials. A verification code will be required before access is granted."
      footer={
        <>
          Accounts are created through an
          invitation from XYZ Management.
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
            Email address
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

        <PasswordField
          label="Password"
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
          autoComplete="current-password"
          placeholder="Enter your password"
          below={
            <Link
              className="auth-link auth-forgot-link"
              to="/forgot-password"
            >
              Forgot password?
            </Link>
          }
        />

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
