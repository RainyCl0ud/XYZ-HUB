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
  const deliverySummary = data?.emailMode === 'capture'
    ? 'Preview mode — no emails are sent'
    : data?.emailMode === 'gmail' ? 'Email delivery enabled for approved Staging test recipients' : 'Email reminders are currently off';

  return <dialog ref={dialog} className="creator-chat-settings creator-chat-reminder-dialog" aria-labelledby="chat-reminder-title" onCancel={onClose}>
    <header><h2 id="chat-reminder-title">Email reminder activity</h2><button type="button" onClick={onClose}>Close</button></header>
    <p className="creator-chat-reminder-intro">A quick view of automatic reminders for unread chat messages. Refreshing this page never sends an email.</p>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {busy && !data && <p role="status">Loading your reminder activity…</p>}
    {data && <>
      <div className="creator-chat-reminder-status" role="status"><strong>{deliverySummary}</strong></div>
      <div className="creator-chat-reminder-summary">
        <div><small>Messages eligible</small><strong>{data.eligibleUnread}</strong></div>
        <div><small>Next possible reminder</small><strong className="creator-chat-reminder-time">{data.nextReminderAfter ? time(data.nextReminderAfter) : 'Not scheduled'}</strong></div>
      </div>
      <details className="creator-chat-reminder-policy">
        <summary>How email reminders work</summary>
        <p>A reminder becomes eligible at 10 unread messages or when one has been unread for 30 minutes. Only one email reminder is allowed per person per hour.</p>
        <p>Reminders include an unread count and a link to the Hub, never message text, fan names or attachments.</p>
        {data.limitedScope && <p>For your role, email alerts cover standing private chats and channels you were added to individually. Other channels still show unread badges.</p>}
        <p>Email delivery is managed by XYZ. This page shows status and history, not a personal email on/off switch.</p>
      </details>
      <h3>Recent reminder activity</h3>
      {!data.deliveries.length ? <p className="creator-chat-reminder-empty">No reminder activity recorded yet.</p> : <ul className="creator-chat-reminder-activity">{data.deliveries.map(d => <li key={d.id}>
        <strong>{statusLabel[d.status] ?? d.status}</strong>
        <span>{time(d.createdAt)} · {d.unreadCount} unread {d.unreadCount === 1 ? 'message' : 'messages'}</span>
        {d.lastError && <p>{d.lastError}</p>}
        {d.previewEmail && <details><summary>View email preview</summary><p>Recipient: {d.previewEmail.to}</p><strong>{d.previewEmail.subject}</strong><pre>{d.previewEmail.text}</pre></details>}
      </li>)}</ul>}
    </>}
    <div className="creator-chat-dialog-actions"><button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh activity'}</button></div>
  </dialog>;
}
