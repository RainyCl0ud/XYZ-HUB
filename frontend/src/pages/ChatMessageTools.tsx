import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

export type ChatMessage = {
  id: string; authorName: string; text: string; version: number; createdAt: string; updatedAt: string;
  canEdit: boolean; canReply: boolean; canPin: boolean; pinnedAt: string | null; pinnedByName: string | null; pinVersion: number;
  canModerate?: boolean; canViewHistory?: boolean; replyUnavailable?: boolean;
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

export function ChatMessageContent({ message: m, channelId, onReply, onEdit, onChanged, onOpen, onError, onModerate, onHistory }: {
  message: ChatMessage; channelId: string; onReply: (message: ChatMessage) => void; onEdit?: (message: ChatMessage) => void;
  onChanged: (message: ChatMessage) => void; onOpen: (messageId: string) => void; onError: (e: unknown) => void;
  onModerate?: (message: ChatMessage) => void; onHistory?: (messageId: string) => void;
}) {
  // During a rolling deploy the older API still returns ordinary messages.
  const reactions = m.reactions ?? [];
  const [busy, setBusy] = useState(false);
  const reactionMenu = useRef<HTMLDetailsElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
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
  return <div className={`creator-chat-message-content ${m.deleted ? "is-deleted" : ""}`}>
    {m.replyUnavailable && <p className="creator-chat-unavailable">Original message unavailable.</p>}
    {m.replyTo && <button type="button" className="creator-chat-quote" onClick={() => onOpen(m.replyTo!.id)} aria-label={`View original message by ${m.replyTo.authorName}`}>
      <strong>Reply to {m.replyTo.authorName}{m.replyTo.deleted ? " · Deleted" : ""}{m.replyTo.version > 1 ? " · edited" : ""}</strong><span>{m.replyTo.text}</span>
    </button>}
    <header><strong>{m.authorName}</strong><time dateTime={m.createdAt}>{chatTime(m.createdAt)}</time>{m.version > 1 && <small>Edited</small>}</header>
    {m.deleted && <div className="creator-chat-deleted-notice"><strong>Deleted · Owner view</strong><p>Deleted by {m.deleted.by} · {chatTime(m.deleted.at)}</p><p>Reason: {m.deleted.reason}</p></div>}
    {m.pinnedAt && <small className="creator-chat-pin-label">Pinned by {m.pinnedByName}</small>}
    <p>{m.text}</p>
    {!!reactions.length && <div className="creator-chat-reactions" aria-label="Message reactions">{reactions.map((r) => m.canReply ?
      <button type="button" key={r.emoji} aria-pressed={r.mine} aria-label={`${palette.find(([emoji]) => emoji === r.emoji)?.[1] ?? "Reaction"}: ${r.count}${r.mine ? ", yours; remove reaction" : "; add reaction"}`} disabled={busy}
        onClick={() => void update("reaction", { emoji: r.emoji, active: !r.mine })}><span>{r.emoji}</span><span>{r.count}</span></button> :
      <span className="creator-chat-reaction-count" key={r.emoji} aria-label={`${r.emoji}: ${r.count}`}>{r.emoji} {r.count}</span>)}</div>}
    {(m.canReply || (m.canEdit && onEdit) || m.canPin || (m.canModerate && onModerate) || (m.canViewHistory && onHistory)) && <div className="creator-chat-message-actions">
      {m.canReply && <button type="button" onClick={() => onReply(m)}>Reply</button>}
      {m.canReply && <details ref={reactionMenu} className="creator-chat-reaction-menu"><summary>React</summary><div role="group" aria-label="Choose a reaction">{palette.map(([emoji, label]) => <button type="button" key={emoji} disabled={busy} aria-label={label} aria-pressed={reactions.some((r) => r.emoji === emoji && r.mine)} onClick={() => {
        if (reactionMenu.current) reactionMenu.current.open = false;
        void update("reaction", { emoji, active: !reactions.some((r) => r.emoji === emoji && r.mine) });
      }}>{emoji}</button>)}</div></details>}
      {m.canPin && <button type="button" disabled={busy} onClick={() => void update("pin", { pinned: !m.pinnedAt, version: m.pinVersion })}>{m.pinnedAt ? "Unpin" : "Pin"}</button>}
      {m.canEdit && onEdit && <button type="button" onClick={() => onEdit(m)}>Edit</button>}
      {m.canModerate && onModerate && <button type="button" onClick={() => onModerate(m)}>Delete</button>}
      {m.canViewHistory && onHistory && <button type="button" onClick={() => onHistory(m.id)}>View history</button>}
      {busy && <span role="status">Saving…</span>}
    </div>}
  </div>;
}

type SearchResult = { channelId: string; channelName: string; areaName: string; isPrivate: boolean; message: ChatMessage };
type SearchPage = { results: SearchResult[]; hasMore: boolean; nextBefore: string | null };
type PinPage = { messages: ChatMessage[]; hasMore: boolean; nextBefore: string | null };
type HistoryEvent = { id: string; action: string; actorName: string; occurredAt: string; beforeText: string | null; afterText: string | null; reason: string | null };
export default function ChatMessageTools({ target, onClose, onOpen, onConversation, onReply, onChanged, onModerate }: {
  target: ChatToolTarget; onClose: () => void; onOpen: (target: ChatToolTarget) => void;
  onConversation: (channelId: string) => void; onReply: (channelId: string, message: ChatMessage) => void;
  onChanged: (channelId: string, message: ChatMessage) => void;
  onModerate: (channelId: string, message: ChatMessage) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("conversation");
  const [submitted, setSubmitted] = useState<{ q: string; scope: string } | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
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
  useEffect(() => { const element = dialog.current; element?.showModal(); searchInput.current?.focus(); return () => element?.close(); }, []);
  useEffect(() => {
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
  }, [target, submitted, cursors, revision]);
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
      onOpen={(messageId) => onOpen({ kind: "message", channelId, channelName, messageId })} onError={(e) => { setActionError(errorText(e)); setRevision((v) => v + 1); }}
      onModerate={(m) => onModerate(channelId, m)} onHistory={target.kind === "history" ? undefined : (messageId) => onOpen({ kind: "history", channelId, channelName, messageId })} />;
  }
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-tools" aria-labelledby="chat-tools-title" onCancel={onClose}>
    <header><h2 id="chat-tools-title">{target.kind === "search" ? "Search messages" : target.kind === "pins" ? "Pinned messages" : target.kind === "deleted" ? "Deleted messages · Owner view" : target.kind === "history" ? "Message history · Owner view" : "Message"}</h2><button type="button" onClick={onClose}>Close</button></header>
    <p className="creator-chat-tools-context">{target.channelName} · Times in US Central</p>
    {target.kind === "search" && <form className="creator-chat-message-search" onSubmit={submit}>
      <label htmlFor="chat-search-text">Message text</label><input ref={searchInput} id="chat-search-text" type="search" minLength={2} maxLength={120} required placeholder="Search for a word or phrase…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label htmlFor="chat-search-scope">Search in</label><div><select id="chat-search-scope" value={scope} onChange={(e) => setScope(e.target.value)}><option value="conversation">This conversation</option><option value="all">All my conversations</option></select><button type="submit" disabled={busy || query.trim().length < 2}>Search</button></div>
      <p>Only messages you currently have access to are included.</p>
    </form>}
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {actionError && <p className="creator-chat-error" role="alert">{actionError}</p>}
    {busy && !loaded && <p role="status">Loading messages…</p>}
    {target.kind === "search" && !submitted && <p>Enter at least two characters to find a message.</p>}
    {target.kind === "search" && loaded && !error && <><p role="status">{results.length ? `Showing ${results.length}${nextBefore ? "+" : ""} matching messages for “${submitted?.q}”.` : "No matching messages in your current conversations."}</p>{results.map((r) => <article className="creator-chat-tool-result" key={r.message.id}><small>{r.areaName} / {r.channelName}{r.isPrivate ? " · Private" : ""}{r.message.deleted ? " · Deleted · Owner view" : ""}</small><strong>{r.message.authorName} · {chatTime(r.message.createdAt)}</strong><p>{r.message.text}</p><button type="button" onClick={() => onOpen({ kind: "message", channelId: r.channelId, channelName: r.channelName, messageId: r.message.id })}>View message</button></article>)}</>}
    {(target.kind === "pins" || target.kind === "deleted") && loaded && !error && <>{!pins.length && <p>{target.kind === "pins" ? "No pinned messages yet. Pins keep useful messages easy to find." : "No deleted messages in this conversation."}</p>}{pins.map((m) => <article className="creator-chat-tool-result" key={m.id}>{content(m, target.channelId, target.channelName)}<button type="button" onClick={() => onOpen({ kind: "message", channelId: target.channelId, channelName: target.channelName, messageId: m.id })}>View message</button></article>)}</>}
    {(target.kind === "message" || target.kind === "history") && message && <article className="creator-chat-tool-result">{content(message, target.channelId, target.channelName)}<button type="button" onClick={() => onConversation(target.channelId)}>Open conversation</button></article>}
    {target.kind === "history" && !error && loaded && <div className="creator-chat-revision-list">{!history.length && <p>No recorded history is available for this message.</p>}{history.map((event) => <article key={event.id}><header><strong>{event.action === "chat.message.send" ? "Sent" : event.action === "chat.message.edit" ? "Edited" : "Deleted"} · {event.actorName}</strong><time dateTime={event.occurredAt}>{chatTime(event.occurredAt)}</time></header>{event.beforeText !== null && <div><strong>{event.action === "chat.message.delete" ? "Retained text" : "Before"}</strong><p>{event.beforeText}</p></div>}{event.afterText !== null && <div><strong>{event.action === "chat.message.send" ? "Original text" : "After"}</strong><p>{event.afterText}</p></div>}{event.reason && <p>Reason: {event.reason}</p>}</article>)}</div>}
    {nextBefore && <button type="button" disabled={busy} onClick={() => setCursors((old) => [...old, nextBefore])}>Load more</button>}
    {error && <button type="button" onClick={() => { setCursors([]); setRevision((v) => v + 1); }}>Refresh messages</button>}
  </dialog>;
}
