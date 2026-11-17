import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, apiRequest } from '../lib/api';
type Preview = { title: string; text: string; previewToken: string; staffCount: number; creatorCount: number; privateCopyCount: number; emailMode: string; blockers: { name: string; reason: string }[]; recipients: { name: string; privateCopies: number }[] };
type Delivery = { personName: string; status: string; lastError: string | null; previewEmail: { to: string; subject: string; text: string } | null };
type Announcement = { id: string; title: string; text: string; createdAt: string; authorName: string; deliveries: Delivery[] };
type History = { id: string; title: string; createdAt: string; authorName: string };
const time = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const statusLabel: Record<string,string> = { PENDING: 'Waiting to send', SENDING: 'Sending', SENT: 'Sent', CAPTURED: 'Not sent (test)', SKIPPED: 'Not sent', REVIEW: 'Needs review' };
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
  const stage = publishedId ? "published" : preview ? "review" : "compose";
  // Email is required by Block 2, but the Staging environment must never
  // suggest email was sent when it only saved a test copy.
  const emailNotice = (mode: string) =>
    mode === "capture"
      ? "No emails will be sent during testing. The announcement will still appear in Chat."
      : mode === "gmail"
        ? "Email notifications will go only to approved test addresses."
        : "Email notifications are currently off. The announcement will still appear in Chat.";

  return <dialog ref={dialog} className="creator-chat-settings creator-chat-announcements"
    aria-labelledby="chat-announce-title"
    onCancel={e => { if (busy || uncertain) e.preventDefault(); else onClose(); }}>
    <header className="creator-chat-announcement-topbar">
      <div>
        <small>STAFF COMMUNICATIONS</small>
        <h2 id="chat-announce-title">Staff announcements</h2>
        <p>Share important news with the whole team.</p>
      </div>
      <button type="button" className="creator-chat-announcement-close" disabled={busy || uncertain} onClick={onClose}>Close</button>
    </header>

    <nav className="creator-chat-announcement-steps" aria-label="Announcement workflow">
      <span className={stage === "compose" ? "is-current" : "is-done"} aria-current={stage === "compose" ? "step" : undefined}><b>01</b> Compose</span>
      <span className={stage === "review" ? "is-current" : stage === "published" ? "is-done" : ""} aria-current={stage === "review" ? "step" : undefined}><b>02</b> Review</span>
      <span className={stage === "published" ? "is-current" : ""} aria-current={stage === "published" ? "step" : undefined}><b>03</b> Published</span>
    </nav>

    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    <div className="creator-chat-announcement-workspace">
    {publishedId ? <section className="creator-chat-announcement-stage" aria-label="Published announcement">
      <div className="creator-chat-announcement-section-heading">
        <h3>Published announcement</h3>
        <p role="status">Your announcement has been posted in Chat.</p>
      </div>
      {!posted ? <p role="status">{busy ? 'Checking email status…' : 'Email status is unavailable. Refresh to check again.'}</p> : <>
        <article className="creator-chat-announcement-preview-card">
          <small>POSTED · {posted.authorName} · {time(posted.createdAt)}</small>
          <h4>{posted.title}</h4>
          <p>{posted.text}</p>
        </article>
        <details className="creator-chat-announcement-disclosure">
          <summary>
            <svg className="creator-chat-announcement-disclosure-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 10h12" /><path className="creator-chat-announcement-disclosure-plus" d="M10 4v12" />
            </svg>
            <span className="creator-chat-announcement-disclosure-title">Staff email status</span>
            <span className="creator-chat-announcement-disclosure-meta">{posted.deliveries.length} staff</span>
          </summary>
          <ul className="creator-chat-announcement-deliveries">{posted.deliveries.map((d,i) => <li key={i}>
            <div className="creator-chat-announcement-delivery-row"><strong>{d.personName}</strong><span>{statusLabel[d.status] ?? d.status}</span></div>
            {d.lastError && <p role="alert">{d.lastError}</p>}
            {d.previewEmail && <details><summary>View sample email</summary><p>To: {d.previewEmail.to}</p><strong>{d.previewEmail.subject}</strong><pre>{d.previewEmail.text}</pre></details>}
          </li>)}</ul>
        </details>
      </>}
    </section> : preview ? <section className="creator-chat-announcement-stage" aria-label="Review announcement">
      <div className="creator-chat-announcement-section-heading">
        <h3>Review announcement</h3>
        <p>Check the message and who will receive it before publishing.</p>
      </div>
      <div className="creator-chat-announcement-reach" aria-label="Announcement audience">
        <div><strong>{preview.staffCount}</strong><span>Staff members</span></div>
        <div><strong>{preview.creatorCount}</strong><span>Model #Updates channels</span></div>
        {preview.privateCopyCount > 0 && <div><strong>{preview.privateCopyCount}</strong><span>Additional private chats</span></div>}
      </div>
      <article className="creator-chat-announcement-preview-card">
        <small>YOUR ANNOUNCEMENT</small>
        <h4>{preview.title}</h4>
        <p>{preview.text}</p>
      </article>
      <div className="creator-chat-announcement-review-details">
        <details className="creator-chat-announcement-disclosure">
          <summary>
            <svg className="creator-chat-announcement-disclosure-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 10h12" /><path className="creator-chat-announcement-disclosure-plus" d="M10 4v12" />
            </svg>
            <span className="creator-chat-announcement-disclosure-title">Recipients</span>
            <span className="creator-chat-announcement-disclosure-meta">{preview.staffCount} staff</span>
          </summary>
          <ul className="creator-chat-announcement-recipient-list">
            {preview.recipients.map((r,i) => <li key={i}><span>{r.name}</span>{r.privateCopies ? <small>Also receives a private Chat copy</small> : null}</li>)}
          </ul>
        </details>
        <div className="creator-chat-announcement-email-note" role="status">
          <strong>Staff email notifications</strong>
          <p>{emailNotice(preview.emailMode)}</p>
        </div>
      </div>
      {!!preview.blockers.length && <div className="creator-chat-error" role="alert">
        <strong>Resolve before publishing</strong>
        <ul>{preview.blockers.map((b,i) => <li key={i}>{b.name}: {b.reason}</li>)}</ul>
      </div>}
      <label className="creator-chat-announcement-confirm"><input type="checkbox" checked={confirmed}
        onChange={e => setConfirmed(e.target.checked)} disabled={busy || uncertain || !!preview.blockers.length} />
        <span>I've checked the announcement and its recipients.</span>
      </label>
      {uncertain && <p role="alert">We couldn't confirm whether it was posted. Check this announcement before starting another.</p>}
    </section> : <div className="creator-chat-announcement-compose-layout">
      <section className="creator-chat-announcement-stage" aria-label="Compose announcement">
        <div className="creator-chat-announcement-section-heading">
          <h3>Compose announcement</h3>
          <p>Write your announcement, then check who will receive it.</p>
        </div>
        <form id="chat-announcement-compose-form" onSubmit={e => void review(e)}>
          <label htmlFor="announcement-title">Title</label>
          <input id="announcement-title" value={title} onChange={e=>setTitle(e.target.value)}
            maxLength={120} disabled={busy} placeholder="What does the team need to know?" required />
          <label htmlFor="announcement-text">Message</label>
          <textarea id="announcement-text" value={text} onChange={e=>setText(e.target.value)}
            maxLength={7800} rows={9} disabled={busy}
            placeholder="Share the update, important details, and any next steps…" required />
          <small className="creator-chat-announcement-counter">{text.length.toLocaleString()} / 7,800</small>
        </form>
      </section>
      <aside className="creator-chat-announcement-sidebar" aria-label="Announcement information">
        <h3>Who receives it</h3>
        <p>The announcement appears in every active model's <strong>#Updates</strong> channel. Active staff also receive an email when email sending is enabled.</p>
        <p>Under the current setup, some staff receive an additional private Chat copy.</p>
        <div className="creator-chat-announcement-history">
          <h3>Recent announcements</h3>
          {!history.length ? <p>No announcements to display yet.</p> :
            <ul>{history.map(a => <li key={a.id}>
              <div><strong>{a.title}</strong><small>{a.authorName} · {time(a.createdAt)}</small></div>
              <button type="button" disabled={busy} onClick={() => void details(a.id)}>View</button>
            </li>)}</ul>}
        </div>
      </aside>
    </div>}
    </div>
    <footer className="creator-chat-dialog-actions creator-chat-announcement-footer" aria-label="Announcement actions">
      {publishedId ? <>
        <button type="button" disabled={busy} onClick={() => void details(publishedId)}>Refresh email status</button>
        <button type="button" className="creator-chat-announcement-primary" disabled={busy || !posted}
          onClick={() => { setPublishedId(null); setPosted(null); setPreview(null); setTitle(''); setText(''); setConfirmed(false); setError(''); requestId.current = crypto.randomUUID(); }}>New announcement</button>
      </> : preview ? <>
        <button type="button" disabled={busy || uncertain} onClick={() => { setPreview(null); setConfirmed(false); setError(''); }}>Back to editing</button>
        <button type="button" className="creator-chat-announcement-primary" disabled={busy || !confirmed || !!preview.blockers.length}
          onClick={() => void publish()}>{busy ? 'Checking…' : uncertain ? 'Check submission' : 'Publish announcement'}</button>
      </> : <>
        <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" form="chat-announcement-compose-form" className="creator-chat-announcement-primary"
          disabled={busy || !title.trim() || !text.trim()}>{busy ? 'Preparing…' : 'Review audience'}</button>
      </>}
    </footer>
  </dialog>;
}
