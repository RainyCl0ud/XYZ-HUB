import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, apiRequest } from '../lib/api';
type Preview = { title: string; text: string; previewToken: string; staffCount: number; creatorCount: number; privateCopyCount: number; emailMode: string; blockers: { name: string; reason: string }[]; recipients: { name: string; privateCopies: number }[] };
type Delivery = { personName: string; status: string; lastError: string | null; previewEmail: { to: string; subject: string; text: string } | null };
type Announcement = { id: string; title: string; text: string; createdAt: string; authorName: string; deliveries: Delivery[] };
type History = { id: string; title: string; createdAt: string; authorName: string };
const time = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const statusLabel: Record<string,string> = { PENDING: 'Email waiting', SENDING: 'Sending email', SENT: 'Email sent', CAPTURED: 'Preview saved · no email sent', SKIPPED: 'Email skipped', REVIEW: 'Check delivery · resend paused' };
export default function ChatAnnouncements({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | null>(null), requestId = useRef(crypto.randomUUID());
  const [title, setTitle] = useState(''), [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [posted, setPosted] = useState<Announcement | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [history, setHistory] = useState<History[]>([]), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const modal = dialog.current; modal?.showModal(); const request = new AbortController();
    void apiRequest<{ announcements: History[] }>('/api/chat/announcements', { signal: request.signal }).then(result => setHistory(result.announcements)).catch(() => { if (!request.signal.aborted) setError('Recent announcements could not be loaded. Close and reopen this screen to try again.'); });
    return () => { request.abort(); controller.current?.abort(); modal?.close(); };
  }, []);
  async function review(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setError('');
    try { const result = await apiRequest<Preview>('/api/chat/announcements/preview', { method: 'POST', body: JSON.stringify({ title: title.trim(), text: text.trim() }), signal: request.signal });
      if (!request.signal.aborted) { setPreview(result); setConfirmed(false); requestId.current = crypto.randomUUID(); }
    } catch (e) { if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to prepare the announcement.'); }
    finally { setBusy(false); }
  }
  async function details(id: string) {
    setPublishedId(id); setPosted(null);
    const request = new AbortController(); controller.current = request; setBusy(true); setError('');
    try { const result = await apiRequest<{ announcement: Announcement }>(`/api/chat/announcements/${id}`, { signal: request.signal }); if (!request.signal.aborted) {
      setPosted(result.announcement);
      setHistory(current => [result.announcement, ...current.filter(a => a.id !== id)].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,20));
    } }
    catch (e) { if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load delivery status.'); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!preview || busy || !confirmed || preview.blockers.length) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setError('');
    try {
      const result = await apiRequest<{ id: string }>('/api/chat/announcements', { method: 'POST', body: JSON.stringify({ title: preview.title, text: preview.text, previewToken: preview.previewToken, requestId: requestId.current }), signal: request.signal });
      if (request.signal.aborted) return;
      setUncertain(false); setPreview(null); setConfirmed(false); onPublished(); await details(result.id);
    } catch (e) {
      if (request.signal.aborted) return;
      if (e instanceof ApiError && [400,401,403,404,409].includes(e.status)) { setUncertain(false); setPreview(null); setConfirmed(false); }
      else setUncertain(true);
      setError(e instanceof ApiError && e.status === 409 ? 'The audience changed. Review it again before posting.' : e instanceof Error ? e.message : 'We could not confirm publication. Check the same submission before starting another.');
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-announcements" aria-labelledby="chat-announce-title" onCancel={e => { if (busy || uncertain) e.preventDefault(); else onClose(); }}>
    <header><h2 id="chat-announce-title">Staff announcements</h2><button type="button" disabled={busy || uncertain} onClick={onClose}>Close</button></header>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {publishedId ? <>
      <p role="status">Posted in the Hub. Email delivery is tracked separately below.</p>
      {!posted && <p>{busy ? 'Loading delivery status…' : 'The announcement was posted. Retry loading its delivery status below; do not publish it again.'}</p>}
      {posted && <>
      <article className="creator-chat-announcement-body"><h3>{posted.title}</h3><small>{posted.authorName} · {time(posted.createdAt)}</small><p>{posted.text}</p></article>
      <ul className="creator-chat-announcement-deliveries">{posted.deliveries.map((d,i) => <li key={i}><strong>{d.personName}</strong><span>{statusLabel[d.status] ?? d.status}</span>{d.lastError && <p>{d.lastError}</p>}{d.previewEmail && <details><summary>Individual email preview</summary><p>To: {d.previewEmail.to} · No CC or BCC</p><strong>{d.previewEmail.subject}</strong><pre>{d.previewEmail.text}</pre></details>}</li>)}</ul>
      </>}
      <div className="creator-chat-dialog-actions"><button type="button" disabled={busy} onClick={() => void details(publishedId)}>Refresh delivery status</button><button type="button" disabled={busy || !posted} onClick={() => { setPublishedId(null); setPosted(null); setPreview(null); setTitle(''); setText(''); setConfirmed(false); setError(''); }}>New announcement</button></div>
    </> : preview ? <>
      <p>This goes to <strong>{preview.staffCount} active staff</strong> across the agency, through <strong>{preview.creatorCount} creator Updates channels</strong> and <strong>{preview.privateCopyCount} protected private copies</strong>. Creators and deactivated accounts are excluded.</p>
      <article className="creator-chat-announcement-body"><h3>{preview.title}</h3><p>{preview.text}</p></article>
      <p>{preview.emailMode === 'capture' ? 'Test mode: individual email previews will be saved. No emails will be sent.' : preview.emailMode === 'gmail' ? 'Each email contains the full announcement and is addressed to one person. Staging sends only to the configured test list.' : 'Email delivery is off. Hub posts will publish, and individual emails will wait in the queue.'}</p>
      <details><summary>Review {preview.staffCount} recipients</summary><ul>{preview.recipients.map((r,i) => <li key={i}>{r.name}{r.privateCopies ? ' · Private Hub copy' : ''}</li>)}</ul></details>
      {!!preview.blockers.length && <div className="creator-chat-error" role="alert"><strong>Resolve these before posting:</strong><ul>{preview.blockers.map((b,i) => <li key={i}>{b.name}: {b.reason}</li>)}</ul></div>}
      <label className="creator-chat-announcement-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy || uncertain || !!preview.blockers.length}/>I reviewed the full announcement and agency-wide audience.</label>
      {uncertain && <p role="alert">Publication could not be confirmed. “Check submission” checks the same request without creating a duplicate. Don’t start another announcement yet.</p>}
      <div className="creator-chat-dialog-actions"><button type="button" disabled={busy || uncertain} onClick={() => setPreview(null)}>Back to editing</button><button type="button" disabled={busy || !confirmed || !!preview.blockers.length} onClick={() => void publish()}>{busy ? 'Checking…' : uncertain ? 'Check submission' : 'Publish announcement'}</button></div>
    </> : <>
      <p>Post one announcement to active staff across the agency. Staff who can’t open Updates receive a copy in their current permitted private chat. This doesn’t change anyone’s channel access.</p>
      <form onSubmit={e => void review(e)}><label htmlFor="announcement-title">Announcement title</label><input id="announcement-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} disabled={busy} required/>
        <label htmlFor="announcement-text">Full announcement</label><textarea id="announcement-text" value={text} onChange={e=>setText(e.target.value)} maxLength={7800} rows={7} disabled={busy} required/><small>{text.length.toLocaleString()} / 7,800 characters · Review before posting</small>
        <div className="creator-chat-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !title.trim() || !text.trim()}>{busy ? 'Preparing…' : 'Preview announcement'}</button></div>
      </form>
      {!!history.length && <details><summary>Recent announcements</summary><ul className="creator-chat-announcement-deliveries">{history.map(a => <li key={a.id}><strong>{a.title}</strong><small>{a.authorName} · {time(a.createdAt)}</small><button type="button" disabled={busy} onClick={() => void details(a.id)}>View delivery status</button></li>)}</ul></details>}
    </>}
  </dialog>;
}
