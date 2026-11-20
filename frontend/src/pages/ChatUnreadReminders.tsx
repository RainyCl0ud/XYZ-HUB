import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';

type Delivery = { id: string; personName: string; status: string; unreadCount: number; createdAt: string; lastError: string | null;
  previewEmail: { to: string; subject: string; text: string } | null };
type ReminderLog = { emailMode: string; deliveries: Delivery[]; nextBefore: string | null };
const time = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const statusLabel: Record<string, string> = { SENDING: 'Sending email', SENT: 'Email sent', CAPTURED: 'Preview saved', SKIPPED: 'Email skipped', REVIEW: 'Delivery needs review · reminders paused' };

/** Owner-only log of unread reminder emails across all staff. */
export default function ChatUnreadReminders({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | null>(null);
  const [data, setData] = useState<ReminderLog | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async (before?: string) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try {
      const result = await apiRequest<ReminderLog>(`/api/chat/unread-reminders/log${before ? `?before=${encodeURIComponent(before)}` : ''}`, { signal: request.signal });
      if (!request.signal.aborted) setData((old) => before && old ? { ...result, deliveries: [...old.deliveries, ...result.deliveries] } : result);
    } catch (e) { if (!request.signal.aborted) { if (!before) setData(null); setError(e instanceof Error ? e.message : 'Unable to load the email reminder log.'); } }
    finally { if (!request.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => { dialog.current?.showModal(); const initial = setTimeout(() => void load(), 0); return () => { clearTimeout(initial); controller.current?.abort(); }; }, [load]);
  const deliverySummary = data?.emailMode === 'capture'
    ? 'Preview mode · no emails are sent'
    : data?.emailMode === 'gmail' ? 'Sending to the configured test recipients only' : 'Reminders off';

  return <dialog ref={dialog} className="creator-chat-settings creator-chat-reminder-dialog" aria-labelledby="chat-reminder-title" onCancel={onClose}>
    <header><h2 id="chat-reminder-title">Email reminder log</h2><button type="button" onClick={onClose}>Close</button></header>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {busy && !data && <p role="status">Loading the reminder log…</p>}
    {data && <>
      <div className="creator-chat-reminder-status" role="status"><strong>{deliverySummary}</strong></div>
      <details className="creator-chat-reminder-policy">
        <summary>How email reminders work</summary>
        <p>A person gets one email once a message has been unread for 30 minutes, at most once an hour. Staff announcements don’t count, because they send their own email.</p>
        <p>Emails show only the number of unread messages and a link to the Hub.</p>
      </details>
      <h3>Recent reminders</h3>
      {!data.deliveries.length ? <p className="creator-chat-reminder-empty">No reminders recorded yet.</p> : <ul className="creator-chat-reminder-activity">{data.deliveries.map(d => <li key={d.id}>
        <strong>{d.personName} · {statusLabel[d.status] ?? d.status}</strong>
        <span>{time(d.createdAt)} · {d.unreadCount} unread {d.unreadCount === 1 ? 'message' : 'messages'}</span>
        {d.lastError && <p>{d.lastError}</p>}
        {d.previewEmail && <details><summary>View email preview</summary><p>Recipient: {d.previewEmail.to}</p><strong>{d.previewEmail.subject}</strong><pre>{d.previewEmail.text}</pre></details>}
      </li>)}</ul>}
    </>}
    <div className="creator-chat-dialog-actions">
      {data?.nextBefore && <button type="button" disabled={busy} onClick={() => void load(data.nextBefore!)}>{busy ? 'Loading…' : 'Load older reminders'}</button>}
      <button type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : 'Refresh'}</button>
    </div>
  </dialog>;
}
