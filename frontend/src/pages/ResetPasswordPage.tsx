import { useToast } from "../components/ToastProvider";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
} from "react-router-dom";

import AuthShell from "../components/AuthShell";
import PasswordField from "../components/PasswordField";

import {
  ApiError,
  apiRequest,
} from "../lib/api";

type ValidationState =
  | "checking"
  | "valid"
  | "invalid";

function getTokenFromFragment() {
  const fragment =
    window.location.hash.replace(
      /^#/,
      ""
    );

  return (
    new URLSearchParams(
      fragment
    ).get(
      "token"
    ) ?? ""
  );
}

function ResetPasswordPage() {
  const toast = useToast();
  const [
    token,
  ] =
    useState(
      getTokenFromFragment
    );

  const [
    validation,
    setValidation,
  ] =
    useState<ValidationState>(
      "checking"
    );

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmation,
    setConfirmation,
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

  const [
    completed,
    setCompleted,
  ] =
    useState(false);

  useEffect(
    () => {
      let active =
        true;

      async function validate() {
        if (
          !token
        ) {
          setValidation(
            "invalid"
          );

          return;
        }

        try {
          await apiRequest(
            "/api/auth/password-reset/validate",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  token,
                }),
            }
          );

          if (
            active
          ) {
            setValidation(
              "valid"
            );
          }
        } catch {
          if (
            active
          ) {
            setValidation(
              "invalid"
            );
          }
        }
      }

      void validate();

      return () => {
        active =
          false;
      };
    },
    [
      token,
    ]
  );

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError(
      null
    );

    if (
      password.length <
      12
    ) {
      setError(
        "Your password must contain at least 12 characters."
      );

      return;
    }

    if (
      password !==
      confirmation
    ) {
      setError(
        "The passwords do not match."
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      await apiRequest(
        "/api/auth/password-reset/complete",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              token,

              password,
            }),
        }
      );

      window.history.replaceState(
        null,
        "",
        window.location.pathname
      );

      toast.success("Password updated. You can sign in with your new password.");
      setCompleted(
        true
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
          "Unable to reset your password."
        );
      }
    } finally {
      setSubmitting(
        false
      );
    }
  }

  if (
    validation ===
    "checking"
  ) {
    return (
      <AuthShell
        eyebrow="Account recovery"
        title="Checking reset link"
        description="Please wait while XYZ Management validates your password-reset request."
      >
        <div className="auth-message auth-message-info">
          Validating your reset link...
        </div>
      </AuthShell>
    );
  }

  if (
    validation ===
    "invalid"
  ) {
    return (
      <AuthShell
        eyebrow="Account recovery"
        title="Reset link unavailable"
        description="This password-reset link is invalid, expired, or has already been used."
        footer={
          <Link to="/forgot-password">
            Request a new reset link
          </Link>
        }
      >
        <div className="auth-message auth-message-error">
          This reset link can no longer be used.
        </div>
      </AuthShell>
    );
  }

  if (
    completed
  ) {
    return (
      <AuthShell
        eyebrow="Account recovery"
        title="Password updated"
        description="Your password has been changed and your previous sessions have been revoked."
        footer={
          <Link to="/login">
            Continue to sign in
          </Link>
        }
      >
        <p>Continue below to sign in.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Create a new password containing at least 12 characters."
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

        <PasswordField
          label="New password"
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
          autoComplete="new-password"
          minLength={
            12
          }
          placeholder="Create a new password"
          helper="At least 12 characters."
        />

        <PasswordField
          label="Confirm new password"
          value={
            confirmation
          }
          onChange={(
            event
          ) =>
            setConfirmation(
              event.target
                .value
            )
          }
          autoComplete="new-password"
          minLength={
            12
          }
          placeholder="Re-enter your new password"
        />

        <button
          className="auth-submit"
          type="submit"
          disabled={
            submitting
          }
        >
          {submitting
            ? "Updating password..."
            : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default ResetPasswordPage;