import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';

type ReminderHistory = {
  emailMode: string; eligibleUnread: number; limitedScope: boolean; oldestUnreadAt: string | null; nextReminderAfter: string | null;
  deliveries: { id: string; status: string; unreadCount: number; createdAt: string; lastError: string | null;
    previewEmail: { to: string; subject: string; text: string } | null }[];
};
const time = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const statusLabel: Record<string, string> = { SENDING: 'Sending email', SENT: 'Email sent', CAPTURED: 'Preview saved · no email sent', SKIPPED: 'Email skipped', REVIEW: 'Delivery needs review · reminders paused' };

export default function ChatUnreadReminders({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | null>(null);
  const [data, setData] = useState<ReminderHistory | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try { const result = await apiRequest<ReminderHistory>('/api/chat/unread-reminders', { signal: request.signal }); if (!request.signal.aborted) setData(result); }
    catch (e) { if (!request.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : 'Unable to load your email reminders.'); } }
    finally { if (!request.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => { dialog.current?.showModal(); const initial = setTimeout(() => void refresh(), 0); return () => { clearTimeout(initial); controller.current?.abort(); }; }, [refresh]);
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-announcements" aria-labelledby="chat-reminder-title" onCancel={onClose}>
    <header><h2 id="chat-reminder-title">Your email reminders</h2><button type="button" onClick={onClose}>Close</button></header>
    <p>A reminder is due at 10 unread messages or after a message has been unread for 30 minutes. You receive at most one reminder per hour across all your chats.</p>
    <p>Emails contain only the unread count and a link to the Hub.</p>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {data && <>
      <p role="status">{data.emailMode === 'capture' ? 'Test mode: previews are saved here. No reminder emails are sent.' : data.emailMode === 'gmail' ? 'Staging email testing is limited to approved test recipients.' : 'Email reminders are currently off.'}</p>
      <p><strong>{data.eligibleUnread} unread {data.eligibleUnread === 1 ? 'message counts' : 'messages count'} toward your email reminders.</strong></p>
      {data.limitedScope && <p>Your role receives reminders for standing private chats and channels where you were added by name. Other channels still show unread badges.</p>}
      {data.nextReminderAfter && <p>Next reminder can be considered after {time(data.nextReminderAfter)}, if unread messages still qualify.</p>}
      <h3>Recent reminders</h3>
      {!data.deliveries.length ? <p>No reminders recorded yet. New reminders are checked automatically; refreshing this list does not send an email.</p> : <ul className="creator-chat-announcement-deliveries">{data.deliveries.map(d => <li key={d.id}>
        <strong>{statusLabel[d.status] ?? d.status}</strong><span>{time(d.createdAt)} · {d.unreadCount} unread</span>
        {d.lastError && <p>{d.lastError}</p>}
        {d.previewEmail && <details><summary>Individual email preview</summary><p>To: {d.previewEmail.to} · No CC or BCC</p><strong>{d.previewEmail.subject}</strong><pre>{d.previewEmail.text}</pre></details>}
      </li>)}</ul>}
    </>}
    <div className="creator-chat-dialog-actions"><button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Loading…' : 'Refresh status'}</button></div>
  </dialog>;
}
