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

type InviteDetails = {
  name:
    string;

  email:
    string;

  expiresAt:
    string;
};

type InviteValidationResponse = {
  status:
    "VALID_INVITE";

  invite:
    InviteDetails;
};

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

function InviteSetupPage() {
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
    invite,
    setInvite,
  ] =
    useState<
      InviteDetails | null
    >(
      null
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
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

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
          const result =
            await apiRequest<InviteValidationResponse>(
              "/api/invites/validate",
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
            setInvite(
              result.invite
            );

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
        "/api/invites/accept",
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
          "Unable to complete account setup."
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
        eyebrow="Account invitation"
        title="Checking invitation"
        description="Please wait while XYZ Management validates your invitation."
      >
        <div className="auth-message auth-message-info">
          Validating invitation...
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
        eyebrow="Account invitation"
        title="Invitation unavailable"
        description="This invitation is invalid, expired, revoked, or has already been used."
        footer={
          <Link to="/login">
            Return to sign in
          </Link>
        }
      >
        <div className="auth-message auth-message-error">
          Ask XYZ Management for a new invitation if you still need access.
        </div>
      </AuthShell>
    );
  }

  if (
    completed
  ) {
    return (
      <AuthShell
        eyebrow="Account invitation"
        title="Your account is ready"
        description="Account setup is complete. You can now sign in using the password you created."
        footer={
          <Link to="/login">
            Continue to sign in
          </Link>
        }
      >
        <div className="auth-message auth-message-success">
          XYZ Management account activated successfully.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Account invitation"
      title="Set up your account"
      description="Create your private XYZ Management password. Management will never receive or see this password."
    >
      {invite && (
        <div className="auth-account-preview">
          <div className="auth-account-name">
            {invite.name}
          </div>

          <div className="auth-account-email">
            {invite.email}
          </div>
        </div>
      )}

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
          label="Create password"
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
          placeholder="Create your password"
          helper="At least 12 characters."
        />

        <PasswordField
          label="Confirm password"
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
          placeholder="Re-enter your password"
        />

        <button
          className="auth-submit"
          type="submit"
          disabled={
            submitting
          }
        >
          {submitting
            ? "Creating account..."
            : "Complete account setup"}
        </button>
      </form>
    </AuthShell>
  );
}

export default InviteSetupPage;