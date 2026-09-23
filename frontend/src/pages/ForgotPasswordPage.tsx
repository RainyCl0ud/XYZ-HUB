import {
  useState,
  type FormEvent,
} from "react";

import {
  Link,
} from "react-router-dom";

import AuthShell from "../components/AuthShell";

import {
  ApiError,
  apiRequest,
} from "../lib/api";

type ResetRequestResponse = {
  status:
    "PASSWORD_RESET_REQUEST_ACCEPTED";

  message:
    string;
};

function ForgotPasswordPage() {
  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

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

    setMessage(
      null
    );

    try {
      const result =
        await apiRequest<ResetRequestResponse>(
          "/api/auth/password-reset/request",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                email,
              }),
          }
        );

      setMessage(
        result.message
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
          "Unable to process the password-reset request."
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
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter the email address attached to your XYZ Hub account."
      footer={
        <>
          Remembered your password?{" "}
          <Link to="/login">
            Return to sign in
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

        {message && (
          <div className="auth-message auth-message-success">
            {message}
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

        <button
          className="auth-submit"
          type="submit"
          disabled={
            submitting
          }
        >
          {submitting
            ? "Sending..."
            : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}

export default ForgotPasswordPage;