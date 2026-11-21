import { useRef, useState, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { ApiError, apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

type VerifyResponse = { status: "AUTHENTICATED"; user: { id: string; name: string; email: string } };
type ChallengeResponse = { status: "TWO_FACTOR_REQUIRED"; method: "EMAIL"; challengeId: string; expiresAt: string };
type Method = "EMAIL" | "AUTHENTICATOR";

const KEYS = { challenge: "xyz_pending_2fa_challenge", email: "xyz_pending_2fa_email", method: "xyz_pending_2fa_method", notice: "xyz_pending_2fa_notice", after: "xyz_after_login" };
const RECOVERY_PATTERN = /^[2-9A-HJKMNP-Z]{4}-?[2-9A-HJKMNP-Z]{4}$/;
const CODE_LENGTH = 6;
// The pending sign-in can't be used again: only "Sign in again" helps.
const ENDED_CODES = ["TWO_FACTOR_EXPIRED", "TWO_FACTOR_LOCKED", "INVALID_TWO_FACTOR_CHALLENGE"];
const clearPending = () => { sessionStorage.removeItem(KEYS.challenge); sessionStorage.removeItem(KEYS.email); sessionStorage.removeItem(KEYS.method); sessionStorage.removeItem(KEYS.notice); };

const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="auth-alt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
);
const KeyIcon = () => <Icon><circle cx="8" cy="15" r="4" /><path d="M10.9 12.1 19 4M16 7l3 3M13.5 9.5l2 2" /></Icon>;
const MailIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></Icon>;
const PhoneIcon = () => <Icon><rect x="7" y="2.5" width="10" height="19" rx="1.5" /><path d="M11 18h2" /></Icon>;

/** Second sign-in step: an emailed code, or a code from an authenticator
 * app (with a recovery code or an emailed code as backups). Six-digit codes
 * go in one real input drawn as six boxes, so pasting and autofill work, and
 * the code is checked as soon as the sixth digit is in. */
function TwoFactorPage() {
  const navigate = useNavigate();
  const { user, loading, refreshAuth } = useAuth();
  const email = sessionStorage.getItem(KEYS.email);
  const [challengeId, setChallengeId] = useState(() => sessionStorage.getItem(KEYS.challenge));
  const [method, setMethod] = useState<Method>(() => sessionStorage.getItem(KEYS.method) === "AUTHENTICATOR" ? "AUTHENTICATOR" : "EMAIL");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => sessionStorage.getItem(KEYS.notice) === "app-paused"
    ? "There were too many wrong authenticator codes in the last hour, so we emailed you a code instead. If that wasn’t you, change your password."
    : null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  if (!loading && user) return <Navigate to="/" replace />;
  if (!challengeId) return <Navigate to="/login" replace />;

  const authenticator = method === "AUTHENTICATOR";
  const recovery = authenticator && useRecovery;
  const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);
  const selectInput = () => window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);

  async function verify(value: string) {
    if (inFlight.current) return;
    const ready = recovery ? RECOVERY_PATTERN.test(value) : value.length === CODE_LENGTH;
    if (!ready) { setError(recovery ? "Enter a recovery code, like 7K4M-9QRT." : "Enter the 6-digit code."); focusInput(); return; }
    inFlight.current = true; setSubmitting(true); setError(null);
    try {
      await apiRequest<VerifyResponse>("/api/auth/verify-2fa", { method: "POST", body: JSON.stringify({ challengeId, code: value }) });
      const authenticated = await refreshAuth();
      if (!authenticated) throw new Error("The session could not be established.");
      const destination = sessionStorage.getItem(KEYS.after) ?? "/";
      clearPending(); sessionStorage.removeItem(KEYS.after);
      navigate(destination, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (ENDED_CODES.includes(caught.code ?? "")) { sessionStorage.removeItem(KEYS.challenge); setEnded(true); return; }
      } else setError("Unable to complete verification.");
      // A recovery code stays, selected, to fix a typo. Six-digit codes start
      // again from empty boxes (an app's code changes every 30 seconds).
      if (recovery) selectInput(); else { setCode(""); focusInput(); }
    } finally { inFlight.current = false; setSubmitting(false); }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(code);
  }

  // The drawn boxes fill from the left, so the real caret always stays at
  // the end, where the ring is. Selecting everything is allowed, so a whole
  // code can still be replaced.
  function keepCaretAtEnd(event: SyntheticEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const end = input.value.length;
    const all = input.selectionStart === 0 && input.selectionEnd === end;
    if (!all && (input.selectionStart !== end || input.selectionEnd !== end)) input.setSelectionRange(end, end);
  }

  function changeDigits(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(next);
    if (error) setError(null);
    // Typing or pasting the sixth digit signs in right away.
    if (next.length === CODE_LENGTH && code.length !== CODE_LENGTH) void verify(next);
  }

  function toggleRecovery() {
    setUseRecovery((on) => !on); setCode(""); setError(null); setNotice(null); focusInput();
  }

  async function emailInstead() {
    if (inFlight.current) return;
    inFlight.current = true; setSubmitting(true); setError(null); setNotice(null);
    try {
      const result = await apiRequest<ChallengeResponse>("/api/auth/two-factor/email-instead", { method: "POST", body: JSON.stringify({ challengeId }) });
      sessionStorage.setItem(KEYS.challenge, result.challengeId); sessionStorage.setItem(KEYS.method, "EMAIL");
      setChallengeId(result.challengeId); setMethod("EMAIL"); setUseRecovery(false); setCode("");
      setNotice(email ? `We emailed a code to ${email}.` : "We emailed you a code.");
      focusInput();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "An emailed code couldn’t be sent. Try again in a moment.");
      if (caught instanceof ApiError && caught.code === "INVALID_TWO_FACTOR_CHALLENGE") { sessionStorage.removeItem(KEYS.challenge); setEnded(true); }
    } finally { inFlight.current = false; setSubmitting(false); }
  }

  const active = Math.min(code.length, CODE_LENGTH - 1);
  return <AuthShell
    className="auth-card-two-step"
    eyebrow="Two-step sign-in"
    title={recovery ? "Use a recovery code" : authenticator ? "Enter your code" : "Check your email"}
    description={<>
      {recovery
        ? "Enter one of the recovery codes you saved when you set up your authenticator app. Each one works once."
        : authenticator
          ? "Open your authenticator app and enter the 6-digit code for XYZ Hub."
          : email ? `Enter the 6-digit code we sent to ${email}.` : "Enter the 6-digit code we sent to your email."}
      {authenticator && email && <span className="auth-identity">Signing in as {email}</span>}
    </>}
    footer={ended ? undefined : <>
      {email ? "Not you?" : "Need to start over?"}{" "}
      <Link to="/login" onClick={clearPending}>Sign in again</Link>
    </>}
  >
    <form className="auth-form auth-two-step-form" onSubmit={handleSubmit} noValidate>
      {notice && !ended && <div className="auth-message auth-message-info" role="status">{notice}</div>}
      {error && <div className="auth-message auth-message-error" role="alert"><span aria-hidden="true">! </span>{error}</div>}
      {ended
        ? <Link className="auth-submit auth-restart" to="/login" onClick={clearPending}>Sign in again</Link>
        : <>
          {recovery
            ? <label className="auth-field">
                <span className="auth-label">Recovery code</span>
                <input key="recovery" ref={inputRef} className="auth-input auth-code-input" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9}
                  value={code} onChange={(event) => { setCode(event.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 9)); if (error) setError(null); }}
                  placeholder="XXXX-XXXX" readOnly={submitting} autoFocus />
              </label>
            : <div className="auth-field">
                <label className="auth-sr" htmlFor="two-step-code">{authenticator ? "6-digit code from your authenticator app" : "6-digit code from your email"}</label>
                <div className={`auth-code-boxes${focused ? " is-focused" : ""}`}>
                  <input key="digits" ref={inputRef} id="two-step-code" className="auth-code-boxes-input" type="text" inputMode="numeric" pattern="[0-9]*"
                    autoComplete="one-time-code" value={code} onChange={(event) => changeDigits(event.target.value)} onSelect={keepCaretAtEnd}
                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} readOnly={submitting} autoFocus />
                  {Array.from({ length: CODE_LENGTH }, (_, index) => (
                    <span key={index} aria-hidden="true"
                      className={`auth-code-box${code[index] ? " is-filled" : ""}${focused && index === active ? " is-active" : ""}`}>{code[index] ?? ""}</span>
                  ))}
                </div>
              </div>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Verifying…" : "Verify"}</button>
          {authenticator && <section className="auth-other-ways" aria-labelledby="auth-other-ways-title">
            <h2 id="auth-other-ways-title" className="auth-other-ways-title">Other ways to sign in</h2>
            <button type="button" className="auth-alt-button" disabled={submitting} onClick={toggleRecovery}>
              {recovery ? <><PhoneIcon />Use my authenticator app</> : <><KeyIcon />Use a recovery code</>}
            </button>
            <button type="button" className="auth-alt-button" disabled={submitting} onClick={() => void emailInstead()}><MailIcon />Email me a code</button>
          </section>}
        </>}
    </form>
  </AuthShell>;
}

export default TwoFactorPage;
