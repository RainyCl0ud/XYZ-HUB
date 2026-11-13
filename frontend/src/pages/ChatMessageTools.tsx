import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { API_BASE_URL, apiRequest } from "../lib/api";
import ChatVoicePlayback from "./ChatVoicePlayback";

export type ChatMessage = {
  id: string; authorName: string; text: string; version: number; createdAt: string; updatedAt: string;
  canEdit: boolean; canReply: boolean; canPin: boolean; pinnedAt: string | null; pinnedByName: string | null; pinVersion: number;
  canModerate?: boolean; canViewHistory?: boolean; replyUnavailable?: boolean;
  systemNotice?: boolean;
  announcement?: boolean;
  attachment?: { fileName: string; byteSize: number; available: boolean; canPreview?: boolean; voiceDurationMs?: number };
  deleted?: { at: string; by: string; reason: string } | null;
  replyTo: { id: string; authorName: string; text: string; version: number; createdAt: string; deleted?: boolean } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
};
const chatTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(new Date(value));
const palette = [["👍", "Thumbs up"], ["❤️", "Heart"], ["😂", "Laugh"], ["🎉", "Celebrate"], ["👀", "Eyes"], ["✅", "Check"]] as const;
const errorText = (e: unknown) => e instanceof Error ? e.message : "Unable to load messages. Please try again.";
export type ChatToolTarget = { kind: "search" | "pins" | "deleted"; channelId: string; channelName: string } |
  { kind: "message" | "history"; channelId: string; channelName: string; messageId: string };

function ChatImagePreview({ src, fileName, onLoad }: { src: string; fileName: string; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="creator-chat-image-preview" src={src} alt={`Preview of ${fileName}`}
    loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => setFailed(true)} />;
}

export function ChatMessageContent({ message: m, channelId, onReply, onEdit, onChanged, onOpen, onError, onModerate, onHistory, onPreviewLoad }: {
  message: ChatMessage; channelId: string; onReply: (message: ChatMessage) => void; onEdit?: (message: ChatMessage) => void;
  onChanged: (message: ChatMessage) => void; onOpen: (messageId: string) => void; onError: (e: unknown) => void;
  onModerate?: (message: ChatMessage) => void; onHistory?: (messageId: string) => void;
  onPreviewLoad?: () => void;
}) {
  // During a rolling deploy the older API still returns ordinary messages.
  const reactions = m.reactions ?? [];
  const [busy, setBusy] = useState(false);
  const reactionMenu = useRef<HTMLDetailsElement>(null);
  const actionMenu = useRef<HTMLDetailsElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const close = (e: Event) => {
      for (const menu of [actionMenu.current, reactionMenu.current]) if (menu?.open &&
        (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.contains(e.target as Node))) {
        menu.open = false;
        if (e instanceof KeyboardEvent) { e.preventDefault(); e.stopPropagation(); menu.querySelector("summary")?.focus(); }
      }
    };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  const act = (fn: () => void) => { if (busy) return; if (actionMenu.current) { actionMenu.current.open = false; actionMenu.current.querySelector("summary")?.focus(); } fn(); };
  async function update(kind: "reaction" | "pin", body: object) {
    if (busy) return;
    const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const response = await apiRequest<{ message: ChatMessage }>(`/api/chat/channels/${channelId}/messages/${m.id}/${kind}`, {
        method: "PUT", body: JSON.stringify(body), signal: controller.signal,
      });
      if (!controller.signal.aborted) onChanged(response.message);
    } catch (e) { if (!controller.signal.aborted) onError(e); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const attachmentPath = `${API_BASE_URL}/api/chat/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(m.id)}`;
  const voiceDuration = m.attachment?.voiceDurationMs;
  return <div className={`creator-chat-message-content ${m.deleted ? "is-deleted" : ""}`}>
    {m.replyUnavailable && <p className="creator-chat-unavailable">Original message unavailable.</p>}
    {m.replyTo && <button type="button" className="creator-chat-quote" onClick={() => onOpen(m.replyTo!.id)} aria-label={`View original message by ${m.replyTo.authorName}`}>
      <strong>Reply to {m.replyTo.authorName}{m.replyTo.deleted ? " · Deleted" : ""}{m.replyTo.version > 1 ? " · edited" : ""}</strong><span>{m.replyTo.text}</span>
    </button>}
    <header><strong>{m.authorName}</strong><time dateTime={m.createdAt}>{chatTime(m.createdAt)}</time>{m.systemNotice && <small>{m.announcement ? 'Staff announcement' : 'System notice'}</small>}{m.version > 1 && <small>Edited</small>}</header>
    {m.deleted && <div className="creator-chat-deleted-notice"><strong>Deleted · Owner view</strong><p>Deleted by {m.deleted.by} · {chatTime(m.deleted.at)}</p><p>Reason: {m.deleted.reason}</p></div>}
    {m.pinnedAt && <small className="creator-chat-pin-label">Pinned by {m.pinnedByName}</small>}
    {m.text && <p>{m.text}</p>}
    {m.attachment && <>
      {m.attachment.available && m.attachment.canPreview && <ChatImagePreview
        key={attachmentPath} src={`${attachmentPath}/preview`} fileName={m.attachment.fileName} onLoad={onPreviewLoad}
      />}
      <div className={`creator-chat-file ${voiceDuration ? "is-voice" : ""}`}>
        <strong>{voiceDuration ? "Voice message" : m.attachment.fileName}</strong>
        <small>{voiceDuration ? `${Math.ceil(voiceDuration / 1000)} sec` : `${m.attachment.byteSize.toLocaleString()} bytes`}</small>
        {m.attachment.available && !!voiceDuration && <ChatVoicePlayback key={attachmentPath} src={`${attachmentPath}/voice`} durationMs={voiceDuration} />}
        {!m.attachment.available && <small>File unavailable</small>}
      </div>
    </>}
    {!!reactions.length && <div className="creator-chat-reactions" aria-label="Message reactions">{reactions.map((r) => m.canReply ?
      <button type="button" key={r.emoji} aria-pressed={r.mine} aria-label={`${palette.find(([emoji]) => emoji === r.emoji)?.[1] ?? "Reaction"}: ${r.count}${r.mine ? ", yours; remove reaction" : "; add reaction"}`} disabled={busy}
        onClick={() => void update("reaction", { emoji: r.emoji, active: !r.mine })}><span>{r.emoji}</span><span>{r.count}</span></button> :
      <span className="creator-chat-reaction-count" key={r.emoji} aria-label={`${r.emoji}: ${r.count}`}>{r.emoji} {r.count}</span>)}</div>}
    {(m.attachment?.available || m.canReply || (m.canEdit && onEdit) || m.canPin || (m.canModerate && onModerate) || (m.canViewHistory && onHistory)) && <div className="creator-chat-message-actions">
      <details ref={actionMenu} name="chat-message-actions" className="creator-chat-action-menu"
        onToggle={(e) => { if (e.currentTarget.open) e.currentTarget.scrollIntoView({ block: "nearest" }); }}>
        <summary aria-label={`More actions for message by ${m.authorName}`} title="More message options">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </summary>
        <div role="group" aria-label="Message actions">
          {m.canReply && <button type="button" disabled={busy} onClick={() => act(() => onReply(m))}>Reply</button>}
          {m.canReply && <details ref={reactionMenu} className="creator-chat-reaction-menu">
            <summary>React</summary>
            <div role="group" aria-label="Choose a reaction">{palette.map(([emoji, label]) =>
              <button type="button" key={emoji} disabled={busy} aria-label={label}
                aria-pressed={reactions.some((r) => r.emoji === emoji && r.mine)}
                onClick={() => { if (reactionMenu.current) reactionMenu.current.open = false;
                  if (actionMenu.current) actionMenu.current.open = false;
                  void update("reaction", { emoji, active: !reactions.some((r) => r.emoji === emoji && r.mine) });
                }}>{emoji}</button>)}
            </div>
          </details>}
          {m.attachment?.available && <a href={`${attachmentPath}/file`} target="_blank" rel="noopener"
            aria-label={`Download ${m.attachment.fileName}`} onClick={() => { if (actionMenu.current) actionMenu.current.open = false; }}>Download file</a>}
          {m.canEdit && onEdit && <button type="button" disabled={busy} onClick={() => act(() => onEdit(m))}>Edit</button>}
          {m.canPin && <button type="button" disabled={busy} onClick={() => act(() => void update("pin", { pinned: !m.pinnedAt, version: m.pinVersion }))}>{m.pinnedAt ? "Unpin message" : "Pin message"}</button>}
          {m.canViewHistory && onHistory && <button type="button" disabled={busy} onClick={() => act(() => onHistory(m.id))}>View history</button>}
          {m.canModerate && onModerate && <button type="button" className="creator-chat-delete-action" disabled={busy} onClick={() => act(() => onModerate(m))}>Delete message…</button>}
        </div>
      </details>
      {busy && <span role="status">Saving…</span>}
    </div>}
  </div>;
}

type SearchResult = { channelId: string; channelName: string; areaName: string; isPrivate: boolean; message: ChatMessage };
type SearchPage = { results: SearchResult[]; hasMore: boolean; nextBefore: string | null };
type PinPage = { messages: ChatMessage[]; hasMore: boolean; nextBefore: string | null };
type HistoryEvent = { id: string; action: string; actorName: string; occurredAt: string; beforeText: string | null; afterText: string | null; reason: string | null };
type SearchSubmission = { q: string; scope: string } | null;
type ToolState = { query: string; scope: string; submitted: SearchSubmission; cursors: string[]; scrollTop: number };
type ToolProps = {
  target: ChatToolTarget; onClose: () => void; onOpen: (target: ChatToolTarget) => void;
  onConversation: (channelId: string) => void; onReply: (channelId: string, message: ChatMessage) => void;
  onChanged: (channelId: string, message: ChatMessage) => void;
  onModerate: (channelId: string, message: ChatMessage) => void;
  notice?: string; revision?: number; paused?: boolean;
};
const toolName = (target: ChatToolTarget) => target.kind === "search" ? "Search results" : target.kind === "pins" ? "Pinned messages" : target.kind === "deleted" ? "Deleted messages" : target.kind === "history" ? "Message history" : "Message";

export default function ChatMessageTools(props: Omit<ToolProps, "onOpen">) {
  const [trail, setTrail] = useState<{ target: ChatToolTarget; saved?: ToolState }[]>([{ target: props.target }]);
  const frame = trail[trail.length - 1];
  return <ChatToolView key={trail.length} {...props} target={frame.target} saved={frame.saved}
    backLabel={trail.length > 1 ? `Back to ${toolName(trail[trail.length - 2].target).toLowerCase()}` : undefined}
    onBack={() => setTrail((old) => old.slice(0, -1))}
    onOpen={(target, saved) => setTrail((old) => [...old.slice(0, -1), { ...old[old.length - 1], saved }, { target }])} />;
}

function ChatToolView({ target, onClose, onOpen, onConversation, onReply, onChanged, onModerate, saved, backLabel, onBack, notice, revision: parentRevision, paused }: Omit<ToolProps, "onOpen"> & {
  saved?: ToolState; backLabel?: string; onBack: () => void; onOpen: (target: ChatToolTarget, state: ToolState) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(saved?.query ?? "");
  const [scope, setScope] = useState(saved?.scope ?? "conversation");
  const [submitted, setSubmitted] = useState<SearchSubmission>(saved?.submitted ?? null);
  const [cursors, setCursors] = useState<string[]>(saved?.cursors ?? []);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pins, setPins] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState<ChatMessage | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [busy, setBusy] = useState(target.kind !== "search");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);
  const restoredScroll = useRef(false);
  const wasPaused = useRef(false);
  useEffect(() => {
    const returning = wasPaused.current && !paused; wasPaused.current = !!paused;
    if (!returning) return;
    // The nested confirmation closes in a passive cleanup. Restore focus only
    // after it has left the top layer, so the underlying dialog is interactive.
    const timer = setTimeout(() => (notice ? dialog.current?.querySelector<HTMLButtonElement>("header button") : dialog.current?.querySelector<HTMLElement>(".creator-chat-action-menu summary") ?? dialog.current?.querySelector<HTMLButtonElement>("header button"))?.focus(), 0);
    return () => clearTimeout(timer);
  }, [paused, notice]);
  useLayoutEffect(() => { if (loaded && !restoredScroll.current && dialog.current) { dialog.current.scrollTop = saved?.scrollTop ?? 0; restoredScroll.current = true; } }, [loaded, saved]);
  const navigate = (next: ChatToolTarget) => onOpen(next, { query, scope, submitted, cursors, scrollTop: dialog.current?.scrollTop ?? 0 });
  useEffect(() => { const element = dialog.current; element?.showModal(); searchInput.current?.focus(); return () => element?.close(); }, []);
  useEffect(() => {
    if (paused) return;
    if (target.kind === "search" && !submitted) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      setBusy(true);
      try {
        if (target.kind === "message" || target.kind === "history") {
          const response = await apiRequest<{ message: ChatMessage }>(`/api/chat/channels/${target.channelId}/messages/${target.messageId}`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (target.kind === "history" && !response.message.canViewHistory) throw new Error("Owner history is no longer available to this account.");
          setMessage(response.message);
          if (target.kind === "history") {
            const pages: { events: HistoryEvent[]; nextBefore: string | null }[] = [];
            for (const before of [undefined, ...cursors]) pages.push(await apiRequest(`/api/chat/channels/${target.channelId}/messages/${target.messageId}/history${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal: controller.signal }));
            if (controller.signal.aborted) return;
            setHistory([...new Map(pages.flatMap((page) => page.events).map((event) => [event.id, event])).values()]);
            setNextBefore(pages.at(-1)?.nextBefore ?? null);
          }
        } else if (target.kind === "pins" || target.kind === "deleted") {
          const pages: PinPage[] = [];
          for (const before of [undefined, ...cursors]) pages.push(await apiRequest<PinPage>(`/api/chat/channels/${target.channelId}/${target.kind}${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal: controller.signal }));
          if (controller.signal.aborted) return;
          setPins([...new Map(pages.flatMap((page) => page.messages).map((m) => [m.id, m])).values()]);
          setNextBefore(pages.at(-1)?.nextBefore ?? null);
        } else if (submitted) {
          const pages: SearchPage[] = [];
          for (const before of [undefined, ...cursors]) {
            const params = new URLSearchParams({ q: submitted.q });
            if (submitted.scope === "conversation") params.set("channelId", target.channelId);
            if (before) params.set("before", before);
            pages.push(await apiRequest<SearchPage>(`/api/chat/search?${params}`, { signal: controller.signal }));
          }
          if (controller.signal.aborted) return;
          setResults([...new Map(pages.flatMap((page) => page.results).map((r) => [r.message.id, r])).values()]);
          setNextBefore(pages.at(-1)?.nextBefore ?? null);
        }
        setLoaded(true); setError("");
      } catch (e) {
        if (controller.signal.aborted) return;
        // Recheck every open surface. Never retain a private search excerpt or
        // pin after an access denial or a failed refresh.
        setResults([]); setPins([]); setMessage(null); setHistory([]); setNextBefore(null); setError(errorText(e));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          // Loading more result pages must not turn background refresh into a
          // burst that exhausts this person's search allowance.
          const interval = target.kind === "search" ? Math.max(5000, (cursors.length + 1) * 5000) : Math.max(5000, (cursors.length + 1) * 2500);
          timer = setTimeout(() => void refresh(), interval);
        }
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [target, submitted, cursors, revision, parentRevision, paused]);
  function submit(e: FormEvent) {
    e.preventDefault(); setResults([]); setError(""); setLoaded(false); setNextBefore(null); setCursors([]);
    setSubmitted({ q: query.trim(), scope });
  }
  function changed(channelId: string, value: ChatMessage) {
    onChanged(channelId, value); setActionError(""); setRevision((v) => v + 1);
    if (target.kind === "pins" && !value.pinnedAt) setCursors([]);
    setMessage((old) => old?.id === value.id ? value : old);
    setPins((old) => old.map((m) => m.id === value.id ? value : m).filter((m) => !!m.pinnedAt));
  }
  function content(value: ChatMessage, channelId: string, channelName: string) {
    return <ChatMessageContent message={value} channelId={channelId} onReply={(m) => onReply(channelId, m)} onChanged={(m) => changed(channelId, m)}
      onOpen={(messageId) => navigate({ kind: "message", channelId, channelName, messageId })} onError={(e) => { setActionError(errorText(e)); setRevision((v) => v + 1); }}
      onModerate={(m) => onModerate(channelId, m)} onHistory={target.kind === "history" ? undefined : (messageId) => navigate({ kind: "history", channelId, channelName, messageId })} />;
  }
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-tools" aria-labelledby="chat-tools-title" onCancel={onClose}>
    <header><h2 id="chat-tools-title">{target.kind === "search" ? "Search messages" : target.kind === "pins" ? "Pinned messages" : target.kind === "deleted" ? "Deleted messages · Owner view" : target.kind === "history" ? "Message history · Owner view" : "Message"}</h2><button type="button" onClick={onClose}>Close</button></header>
    {backLabel && <button type="button" className="creator-chat-back" onClick={onBack}>← {backLabel}</button>}
    <p className="creator-chat-tools-context">{target.channelName} · Times in US Central</p>
    {(target.kind === "deleted" || target.kind === "history") && <p className="creator-chat-owner-help">{target.kind === "history" ? "Owner-only · Full message and change history." : "Only Owners can view these retained records. Deleted messages stay hidden from everyone else."}</p>}
    {notice && target.kind !== "history" && <p className="creator-chat-notice" role="status">{notice}</p>}
    {target.kind === "search" && <form className="creator-chat-message-search" onSubmit={submit}>
      <label htmlFor="chat-search-text">Message text</label><input ref={searchInput} id="chat-search-text" type="search" minLength={2} maxLength={120} required placeholder="Search for a word or phrase…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label htmlFor="chat-search-scope">Search in</label><div><select id="chat-search-scope" value={scope} onChange={(e) => setScope(e.target.value)}><option value="conversation">This conversation</option><option value="all">All my conversations</option></select><button type="submit" disabled={query.trim().length < 2}>Search</button></div>
      <p>Only messages you currently have access to are included.</p>
    </form>}
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {actionError && <p className="creator-chat-error" role="alert">{actionError}</p>}
    {busy && !loaded && <p role="status">Loading messages…</p>}
    {target.kind === "search" && !submitted && <p>Enter at least two characters to find a message.</p>}
    {target.kind === "search" && loaded && !error && <><p role="status">{results.length ? `Showing ${results.length}${nextBefore ? "+" : ""} matching messages for “${submitted?.q}”.` : "No matching messages in your current conversations."}</p>{results.map((r) => <article className="creator-chat-tool-result" key={r.message.id}><small>{r.areaName} / {r.channelName}{r.isPrivate ? " · Private" : ""}{r.message.deleted ? " · Deleted · Owner view" : ""}</small><strong>{r.message.authorName} · {chatTime(r.message.createdAt)}</strong><p>{r.message.text}</p><button type="button" onClick={() => navigate({ kind: "message", channelId: r.channelId, channelName: `${r.areaName} / ${r.channelName}`, messageId: r.message.id })}>View message</button></article>)}</>}
    {(target.kind === "pins" || target.kind === "deleted") && loaded && !error && <>{!pins.length && <p>{target.kind === "pins" ? "No pinned messages yet. Pins keep useful messages easy to find." : "No deleted messages in this conversation."}</p>}{pins.map((m) => <article className="creator-chat-tool-result" key={m.id}>{content(m, target.channelId, target.channelName)}<button type="button" onClick={() => navigate({ kind: "message", channelId: target.channelId, channelName: target.channelName, messageId: m.id })}>View message</button></article>)}</>}
    {(target.kind === "message" || target.kind === "history") && message && <article className="creator-chat-tool-result">{target.kind === "history" ? <details className="creator-chat-record-preview"><summary>{message.deleted ? "Retained message" : "Current message"} · {message.authorName}</summary>{content(message, target.channelId, target.channelName)}</details> : content(message, target.channelId, target.channelName)}<button type="button" onClick={() => onConversation(target.channelId)}>Go to latest conversation</button></article>}
    {target.kind === "history" && !error && loaded && <div className="creator-chat-revision-list"><h3>Activity history</h3><p>Newest first · Original text and each recorded change.</p>{!history.length && <p>No recorded history is available for this message.</p>}{history.map((event) => <article key={event.id}><header><strong>{event.action === "chat.message.send" ? "Sent" : event.action === "chat.message.edit" ? "Edited" : "Deleted"} · {event.actorName}</strong><time dateTime={event.occurredAt}>{chatTime(event.occurredAt)}</time></header>{event.beforeText !== null && <div><strong>{event.action === "chat.message.delete" ? "Retained text" : "Before"}</strong><p>{event.beforeText}</p></div>}{event.afterText !== null && <div><strong>{event.action === "chat.message.send" ? "Original text" : "After"}</strong><p>{event.afterText}</p></div>}{event.reason && <p>Reason: {event.reason}</p>}</article>)}</div>}
    {nextBefore && <button type="button" disabled={busy} onClick={() => setCursors((old) => [...old, nextBefore])}>Load more</button>}
    {error && <button type="button" onClick={() => { setCursors([]); setRevision((v) => v + 1); }}>Refresh messages</button>}
  </dialog>;
}
