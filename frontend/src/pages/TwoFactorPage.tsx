import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { ApiError, apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

type VerifyResponse = { status: "AUTHENTICATED"; user: { id: string; name: string; email: string } };
type ChallengeResponse = { status: "TWO_FACTOR_REQUIRED"; method: "EMAIL"; challengeId: string; expiresAt: string };
type Method = "EMAIL" | "AUTHENTICATOR";

const KEYS = { challenge: "xyz_pending_2fa_challenge", email: "xyz_pending_2fa_email", method: "xyz_pending_2fa_method", notice: "xyz_pending_2fa_notice", after: "xyz_after_login" };
const RECOVERY_PATTERN = /^[2-9A-HJKMNP-Z]{4}-?[2-9A-HJKMNP-Z]{4}$/;
const clearPending = () => { sessionStorage.removeItem(KEYS.challenge); sessionStorage.removeItem(KEYS.email); sessionStorage.removeItem(KEYS.method); sessionStorage.removeItem(KEYS.notice); };

/** Second sign-in step: an emailed code, or a code from an authenticator
 * app (with a recovery code or an emailed code as backups). */
function TwoFactorPage() {
  const navigate = useNavigate();
  const { user, loading, refreshAuth } = useAuth();
  const email = sessionStorage.getItem(KEYS.email);
  const [challengeId, setChallengeId] = useState(() => sessionStorage.getItem(KEYS.challenge));
  const [method, setMethod] = useState<Method>(() => sessionStorage.getItem(KEYS.method) === "AUTHENTICATOR" ? "AUTHENTICATOR" : "EMAIL");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => sessionStorage.getItem(KEYS.notice) === "app-paused"
    ? "There were too many wrong authenticator codes in the last hour, so we emailed you a code instead. If that wasn’t you, change your password."
    : null);

  if (!loading && user) return <Navigate to="/" replace />;
  if (!challengeId) return <Navigate to="/login" replace />;

  const recovery = method === "AUTHENTICATOR" && useRecovery;
  const ready = recovery ? RECOVERY_PATTERN.test(code) : code.length === 6;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) { setError(recovery ? "Enter a recovery code, like 7K4M-9QRT." : "Enter the six-digit code."); return; }
    setSubmitting(true); setError(null);
    try {
      await apiRequest<VerifyResponse>("/api/auth/verify-2fa", { method: "POST", body: JSON.stringify({ challengeId, code }) });
      const authenticated = await refreshAuth();
      if (!authenticated) throw new Error("The session could not be established.");
      const destination = sessionStorage.getItem(KEYS.after) ?? "/";
      clearPending(); sessionStorage.removeItem(KEYS.after);
      navigate(destination, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (["TWO_FACTOR_EXPIRED", "TWO_FACTOR_LOCKED", "INVALID_TWO_FACTOR_CHALLENGE"].includes(caught.code ?? "")) sessionStorage.removeItem(KEYS.challenge);
      } else setError("Unable to complete verification.");
    } finally { setSubmitting(false); }
  }

  async function emailInstead() {
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const result = await apiRequest<ChallengeResponse>("/api/auth/two-factor/email-instead", { method: "POST", body: JSON.stringify({ challengeId }) });
      sessionStorage.setItem(KEYS.challenge, result.challengeId); sessionStorage.setItem(KEYS.method, "EMAIL");
      setChallengeId(result.challengeId); setMethod("EMAIL"); setUseRecovery(false); setCode("");
      setNotice(email ? `We emailed a code to ${email}.` : "We emailed you a code.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "An emailed code couldn’t be sent. Try again in a moment.");
      if (caught instanceof ApiError && caught.code === "INVALID_TWO_FACTOR_CHALLENGE") sessionStorage.removeItem(KEYS.challenge);
    } finally { setSubmitting(false); }
  }

  const authenticator = method === "AUTHENTICATOR";
  return <AuthShell
    eyebrow="Two-factor authentication"
    title={authenticator ? (recovery ? "Use a recovery code" : "Enter your authenticator code") : "Check your email"}
    description={authenticator
      ? recovery
        ? "Enter one of the recovery codes you saved when you set up your authenticator app. Each code works once."
        : "Open your authenticator app (such as Google Authenticator, Apple Passwords or Bitwarden Authenticator) and enter the six-digit code for XYZ Hub."
      : email ? `Enter the six-digit verification code sent to ${email}.` : "Enter the six-digit verification code sent to your email."}
    footer={<>
      Need to start over?{" "}
      <Link to="/login" onClick={clearPending}>Sign in again</Link>
    </>}
  >
    <form className="auth-form" onSubmit={handleSubmit}>
      {notice && <div className="auth-message auth-message-info" role="status">{notice}</div>}
      {error && <div className="auth-message auth-message-error" role="alert">{error}</div>}
      <label className="auth-field">
        <span className="auth-label">{recovery ? "Recovery code" : authenticator ? "Authenticator code" : "Verification code"}</span>
        {recovery
          ? <input key="recovery" className="auth-input auth-code-input" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9}
              value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 9))} placeholder="XXXX-XXXX" required autoFocus />
          : <input key="digits" className="auth-input auth-code-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required autoFocus />}
      </label>
      <button className="auth-submit" type="submit" disabled={submitting || !ready}>{submitting ? "Verifying..." : "Verify and sign in"}</button>
      {authenticator && <div className="auth-alternatives">
        <button type="button" className="auth-text-button" disabled={submitting} onClick={() => { setUseRecovery((on) => !on); setCode(""); setError(null); }}>
          {recovery ? "Use my authenticator app" : "Use a recovery code"}
        </button>
        <button type="button" className="auth-text-button" disabled={submitting} onClick={() => void emailInstead()}>Email me a code instead</button>
      </div>}
    </form>
  </AuthShell>;
}

export default TwoFactorPage;
