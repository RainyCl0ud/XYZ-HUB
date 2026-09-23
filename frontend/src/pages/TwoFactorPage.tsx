import {
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  Navigate,
  useNavigate,
} from "react-router-dom";

import AuthShell from "../components/AuthShell";

import {
  ApiError,
  apiRequest,
} from "../lib/api";

import {
  useAuth,
} from "../auth/AuthContext";

type VerifyResponse = {
  status:
    "AUTHENTICATED";

  user: {
    id:
      string;

    name:
      string;

    email:
      string;
  };
};

function TwoFactorPage() {
  const navigate =
    useNavigate();

  const {
    user,
    loading,
    refreshAuth,
  } =
    useAuth();

  const challengeId =
    sessionStorage.getItem(
      "xyz_pending_2fa_challenge"
    );

  const email =
    sessionStorage.getItem(
      "xyz_pending_2fa_email"
    );

  const [
    code,
    setCode,
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

  if (
    !challengeId
  ) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      code.length !==
      6
    ) {
      setError(
        "Enter the six-digit verification code."
      );

      return;
    }

    setSubmitting(
      true
    );

    setError(
      null
    );

    try {
      await apiRequest<VerifyResponse>(
        "/api/auth/verify-2fa",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              challengeId,

              code,
            }),
        }
      );

      const authenticated =
        await refreshAuth();

      if (
        !authenticated
      ) {
        throw new Error(
          "The session could not be established."
        );
      }

      const destination =
        sessionStorage.getItem(
          "xyz_after_login"
        ) ??
        "/";

      sessionStorage.removeItem(
        "xyz_pending_2fa_challenge"
      );

      sessionStorage.removeItem(
        "xyz_pending_2fa_email"
      );

      sessionStorage.removeItem(
        "xyz_after_login"
      );

      navigate(
        destination,
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

        if (
          caught.code ===
            "TWO_FACTOR_EXPIRED" ||
          caught.code ===
            "TWO_FACTOR_LOCKED" ||
          caught.code ===
            "INVALID_TWO_FACTOR_CHALLENGE"
        ) {
          sessionStorage.removeItem(
            "xyz_pending_2fa_challenge"
          );
        }
      } else {
        setError(
          "Unable to complete verification."
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
      eyebrow="Two-factor authentication"
      title="Check your email"
      description={
        email
          ? `Enter the six-digit verification code sent to ${email}.`
          : "Enter the six-digit verification code sent to your email."
      }
      footer={
        <>
          Need a new code?{" "}
          <Link
            to="/login"
            onClick={() => {
              sessionStorage.removeItem(
                "xyz_pending_2fa_challenge"
              );

              sessionStorage.removeItem(
                "xyz_pending_2fa_email"
              );
            }}
          >
            Sign in again
          </Link>
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
            Verification code
          </span>

          <input
            className="auth-input auth-code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={
              6
            }
            value={
              code
            }
            onChange={(
              event
            ) =>
              setCode(
                event.target.value
                  .replace(
                    /\D/g,
                    ""
                  )
                  .slice(
                    0,
                    6
                  )
              )
            }
            placeholder="000000"
            required
            autoFocus
          />
        </label>

        <button
          className="auth-submit"
          type="submit"
          disabled={
            submitting ||
            code.length !==
              6
          }
        >
          {submitting
            ? "Verifying..."
            : "Verify and sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

export default TwoFactorPage;