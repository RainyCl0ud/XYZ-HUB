import { useBrowserNotifications } from "./BrowserNotificationsContext";

/** "header": top right of the desktop page header. "row": a settings row on phones. */
export default function AccountNotificationToggle({ variant = "header" }: { variant?: "header" | "row" }) {
  const controls = useBrowserNotifications();
  const enabled = !!controls?.enabled && controls.permission === "granted";
  const help = controls?.error
    || (controls?.permission === "denied" ? "Notifications are blocked in this browser's site settings. Allow them there to turn notifications on."
      : controls && !controls.supported ? "Notifications aren't supported in this browser."
        : controls && !controls.available ? "Notifications are unavailable right now." : "");

  return <section className={`account-notification-card ${variant === "row" ? "account-settings-row" : "account-header-notifications"}`} aria-labelledby="account-notification-title">
    <h3 id="account-notification-title">Notification</h3>
    <div className="account-notification-controls">
      <button type="button" role="switch" className="account-notification-toggle"
        aria-label="Notification" aria-checked={enabled}
        aria-describedby={help ? "account-notification-help" : undefined}
        title={enabled ? "Turn notifications off" : "Turn notifications on"}
        disabled={!controls || !controls.available || !controls.supported || controls.permission === "denied" || controls.busy}
        onClick={() => {
          if (!controls) return;
          if (enabled) controls.disable();
          else void controls.enable();
        }}>
        <span className="account-notification-knob" aria-hidden="true" />
      </button>
    </div>
    {help && <p id="account-notification-help" className="account-notification-error" role="status">{help}</p>}
  </section>;
}
