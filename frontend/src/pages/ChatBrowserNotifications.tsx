import { useEffect, useRef } from 'react';
import { useBrowserNotifications } from '../components/BrowserNotificationsContext';
import BackgroundPushSettings from '../components/BackgroundPushSettings';
import './ChatPage.css';

export default function ChatBrowserNotifications({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controls = useBrowserNotifications();
  useEffect(() => { dialog.current?.showModal(); }, []);
  if (!controls) return null;
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-announcements" aria-labelledby="chat-browser-alert-title" onCancel={onClose}>
    <header><h2 id="chat-browser-alert-title">Browser notifications</h2><button type="button" onClick={onClose}>Close</button></header>
    <p>Get a pop-up for new messages while you have the Hub open, including when you are using another tab.</p>
    <p>Open-tab alerts contain no message text or names. Messages already visible in a focused conversation do not trigger a pop-up.</p>
    <p>Open-tab alerts may be delayed when your browser pauses the Hub tab.</p>
    {controls.limitedScope && <p>Your role receives notifications for standing private chats and channels where you were added by name. Other channels still show unread badges.</p>}
    <p role="status"><strong>{!controls.supported ? 'Not supported in this browser.' : controls.permission === 'denied' ? 'Blocked in your browser settings.' : controls.enabled && controls.permission === 'granted' ? 'On for your account in this browser.' : 'Off for your account in this browser.'}</strong></p>
    {!controls.supported && <p>Try a supported desktop browser. You can still use unread badges and email reminders.</p>}
    {controls.error && <p className="creator-chat-error" role="alert">{controls.error}</p>}
    <p>This choice applies to your account in this browser. Enabling starts with new messages, without replaying old unread messages.</p>
    <div className="creator-chat-dialog-actions">
      {controls.enabled && <button type="button" disabled={controls.busy} onClick={controls.disable}>Turn off</button>}
      {controls.enabled && controls.permission === 'granted' ? <button type="button" disabled={controls.busy} onClick={() => void controls.test()}>{controls.busy ? 'Checking…' : 'Show test notification'}</button> : <button type="button" disabled={controls.busy || !controls.supported || controls.permission === 'denied'} onClick={() => void controls.enable()}>{controls.busy ? 'Enabling…' : 'Enable notifications'}</button>}
    </div>
    <BackgroundPushSettings />
  </dialog>;
}
