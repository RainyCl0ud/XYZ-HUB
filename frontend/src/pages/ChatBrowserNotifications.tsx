import { useEffect, useRef } from 'react';
import { useBrowserNotifications } from '../components/BrowserNotificationsContext';
import BackgroundPushSettings from '../components/BackgroundPushSettings';
import './ChatBrowserNotifications.css';

export default function ChatBrowserNotifications({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controls = useBrowserNotifications();
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);
  if (!controls) return null;
  const enabled = controls.enabled && controls.permission === 'granted';
  const blocked = controls.permission === 'denied';
  const status = !controls.supported ? 'Not supported' : blocked ? 'Blocked' : !controls.available ? 'Unavailable' : enabled ? 'On' : 'Off';
  const explanation = !controls.supported ? 'Not supported in this browser.'
    : blocked ? 'Blocked in your browser settings. Allow notifications for this site, then reopen these settings.'
    : !controls.available ? 'Notifications are unavailable right now. Reopen these settings to try again.'
    : enabled ? 'On for your account in this browser.'
    : 'Off for your account in this browser. Enable them when you’re ready.';

  return <dialog ref={dialog} className="browser-notifications-dialog" aria-labelledby="chat-browser-alert-title" aria-describedby="notification-settings-description" onCancel={onClose}>
    <header className="notification-settings-header">
      <div>
        <p className="notification-settings-eyebrow">MY ACCOUNT / PREFERENCES</p>
        <h2 id="chat-browser-alert-title">Browser notifications</h2>
        <p id="notification-settings-description">Choose how the Hub gets your attention.</p>
      </div>
      <button type="button" className="notification-settings-close" aria-label="Close notification settings" title="Close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div className="notification-settings-content">
      <section aria-labelledby="desktop-alerts-title">
        <div className="notification-settings-status-row">
          <span className="notification-settings-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          </span>
          <div><h3 id="desktop-alerts-title">Desktop alerts</h3><p>Unread Chat messages, even when you’re in another tab.</p></div>
          <span className="notification-settings-status" data-enabled={enabled && controls.available && controls.supported} role="status"><span aria-hidden="true" />{status}</span>
        </div>
        <p className="notification-settings-explanation">{explanation}</p>
        {controls.limitedScope && <p className="notification-settings-scope">Alerts are limited to conversations where you’ve been specifically added.</p>}
      </section>
      {controls.error && <p className="notification-settings-error" role="alert">{controls.error}</p>}
      <BackgroundPushSettings />
    </div>
    <footer className="notification-settings-footer">
      <p>Applies to this account in this browser.</p>
      <div className="notification-settings-actions">
      {controls.enabled && <button type="button" disabled={controls.busy} onClick={controls.disable}>Turn off</button>}
      {enabled ? <button type="button" className="notification-settings-primary" disabled={controls.busy || !controls.available || !controls.supported} onClick={() => void controls.test()}>{controls.busy ? 'Checking…' : 'Show test notification'}</button> : <button type="button" className="notification-settings-primary" disabled={controls.busy || !controls.available || !controls.supported || blocked} onClick={() => void controls.enable()}>{controls.busy ? 'Enabling…' : 'Enable notifications'}</button>}
      </div>
    </footer>
  </dialog>;
}
