import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "../lib/api";
import { formatCentralDateTime } from "../lib/time";
import { useToast } from "./ToastProvider";

type Status = { authenticator: { enabled: boolean; since: string | null }; recoveryCodesLeft: number };
type Setup = { key: string; otpauthUrl: string; qrSvg: string; accountLabel: string };
type Step =
  | { kind: "idle" }
  | { kind: "password"; purpose: "setup" | "recovery" | "disable" }
  | { kind: "scan"; setup: Setup }
  | { kind: "codes"; codes: string[] };

const message = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

/** My Account: sign in with an authenticator app instead of waiting for an
 * emailed code. Free apps work (Google Authenticator, Apple Passwords,
 * Bitwarden Authenticator). Emailed codes stay available as a backup. */
export default function AccountTwoFactor() {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setStatus(await apiRequest<Status>("/api/auth/two-factor")); }
    catch (e) { setError(message(e, "Two-step sign-in settings couldn’t be loaded.")); }
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  const reset = () => { setStep({ kind: "idle" }); setPassword(""); setCode(""); setSaved(false); setError(""); };

  async function submitPassword(event: FormEvent, purpose: "setup" | "recovery" | "disable") {
    event.preventDefault();
    if (!password) return;
    setBusy(true); setError("");
    try {
      if (purpose === "setup") {
        const setup = await apiRequest<Setup>("/api/auth/two-factor/authenticator/setup", { method: "POST", body: JSON.stringify({ password }) });
        setStep({ kind: "scan", setup });
      } else if (purpose === "recovery") {
        const result = await apiRequest<{ recoveryCodes: string[] }>("/api/auth/two-factor/recovery-codes", { method: "POST", body: JSON.stringify({ password }) });
        setStep({ kind: "codes", codes: result.recoveryCodes });
      } else {
        await apiRequest("/api/auth/two-factor/authenticator/disable", { method: "POST", body: JSON.stringify({ password }) });
        toast.success("Authenticator app turned off. Sign-in codes will come by email.");
        reset(); await load();
      }
      setPassword("");
    } catch (e) { setError(message(e, "That didn’t work. Try again.")); }
    finally { setBusy(false); }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ recoveryCodes: string[] }>("/api/auth/two-factor/authenticator/confirm", { method: "POST", body: JSON.stringify({ code }) });
      setCode(""); setStep({ kind: "codes", codes: result.recoveryCodes });
      toast.success("Authenticator app turned on.");
      void load();
    } catch (e) { setError(message(e, "That code didn’t work. Try the newest code.")); }
    finally { setBusy(false); }
  }

  function copyCodes(codes: string[]) {
    void navigator.clipboard?.writeText(codes.join("\n")).then(() => toast.success("Recovery codes copied."), () => setError("Copying isn’t available here. Write the codes down instead."));
  }
  function downloadCodes(codes: string[]) {
    const text = ["XYZ Hub recovery codes", "Each code works once, for signing in without your authenticator app.", "", ...codes, ""].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    link.download = "xyz-hub-recovery-codes.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const enabled = !!status?.authenticator.enabled;
  const passwordStep = step.kind === "password" ? step : null;
  return <section className="content-card account-two-factor" aria-labelledby="account-2fa-title">
    <div className="account-2fa-heading">
      <div>
        <h3 id="account-2fa-title">Two-step sign-in</h3>
        <p>{!status ? "Loading…" : enabled
          ? (status.authenticator.since ? `Authenticator app · on since ${formatCentralDateTime(status.authenticator.since)}` : "Authenticator app · on")
          : "Sign-in codes come by email."}</p>
      </div>
      {status && step.kind === "idle" && (enabled
        ? <div className="account-2fa-actions">
            <button type="button" className="secondary-button" onClick={() => setStep({ kind: "password", purpose: "recovery" })}>Get new recovery codes</button>
            <button type="button" className="secondary-button" onClick={() => setStep({ kind: "password", purpose: "disable" })}>Turn off</button>
          </div>
        : <button type="button" className="primary-button" onClick={() => setStep({ kind: "password", purpose: "setup" })}>Set up authenticator app</button>)}
    </div>

    {error && <p className="account-2fa-error" role="alert">! {error}</p>}

    {status && step.kind === "idle" && (enabled
      ? <p className={`account-2fa-note${status.recoveryCodesLeft <= 3 ? " is-warning" : ""}`}>
          {status.recoveryCodesLeft <= 3 ? "! " : ""}{status.recoveryCodesLeft} recovery {status.recoveryCodesLeft === 1 ? "code" : "codes"} left. If you lose your phone, sign in with a recovery code or an emailed code, or ask an Owner to reset two-step sign-in.
        </p>
      : <p className="account-2fa-note">Sign in faster with a free authenticator app such as Google Authenticator, Apple Passwords or Bitwarden Authenticator. Emailed codes stay available as a backup.</p>)}

    {passwordStep && <form className="account-2fa-step" onSubmit={(event) => void submitPassword(event, passwordStep.purpose)}>
      <label className="form-field">
        <span>{passwordStep.purpose === "disable" ? "Enter your password to turn off the authenticator app" : passwordStep.purpose === "recovery" ? "Enter your password to get new recovery codes (the old ones stop working)" : "Enter your password to start"}</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </label>
      <div className="account-2fa-actions">
        <button type="submit" className={passwordStep.purpose === "disable" ? "secondary-button account-2fa-danger" : "primary-button"} disabled={busy || !password}>
          {busy ? "Checking…" : passwordStep.purpose === "disable" ? "! Turn off" : "Continue"}
        </button>
        <button type="button" className="secondary-button" onClick={reset} disabled={busy}>Cancel</button>
      </div>
    </form>}

    {step.kind === "scan" && <form className="account-2fa-step" onSubmit={(event) => void confirm(event)}>
      <ol className="account-2fa-steps">
        <li>Open your authenticator app and add an account.</li>
        <li>Scan this QR code, or enter the key by hand. On a phone, you can also <a href={step.setup.otpauthUrl}>open it in your app</a>.</li>
        <li>Enter the six-digit code the app shows.</li>
      </ol>
      <div className="account-2fa-scan">
        <img className="account-2fa-qr" src={`data:image/svg+xml;utf8,${encodeURIComponent(step.setup.qrSvg)}`} alt="QR code to add XYZ Hub to your authenticator app" width={184} height={184} />
        <div className="account-2fa-key">
          <span>Key</span>
          <strong>{step.setup.key}</strong>
          <span>Account: {step.setup.accountLabel}</span>
        </div>
      </div>
      <label className="form-field">
        <span>Six-digit code from the app</span>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required autoFocus />
      </label>
      <div className="account-2fa-actions">
        <button type="submit" className="primary-button" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on"}</button>
        <button type="button" className="secondary-button" onClick={reset} disabled={busy}>Cancel</button>
      </div>
    </form>}

    {step.kind === "codes" && <div className="account-2fa-step">
      <p className="account-2fa-note">Save these recovery codes somewhere safe, such as your password manager. Each one signs you in once if you don’t have your authenticator app. They won’t be shown again.</p>
      <ul className="account-2fa-codes" aria-label="Recovery codes">{step.codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="account-2fa-actions">
        <button type="button" className="secondary-button" onClick={() => copyCodes(step.codes)}>Copy codes</button>
        <button type="button" className="secondary-button" onClick={() => downloadCodes(step.codes)}>Download as text file</button>
      </div>
      <label className="account-2fa-check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I’ve saved my recovery codes</label>
      <button type="button" className="primary-button" disabled={!saved} onClick={() => { reset(); void load(); }}>Done</button>
    </div>}
  </section>;
}
