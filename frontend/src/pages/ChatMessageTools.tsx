import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL, apiRequest } from "../lib/api";
import { CENTRAL_TIME_ZONE, formatCentralMessageTime } from "../lib/central-time";
import ChatVoicePlayback from "./ChatVoicePlayback";
import { CHAT_EMOJI_OPTIONS, CHAT_RECENT_EMOJI_LIMIT, emojiLabel, normalizeRecentEmojis } from "../lib/chat-reaction-emojis";

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
// Dates are already shown by conversation day dividers. Keep individual
// message timestamps compact, like Discord, without repeating the month.
const chatTime = formatCentralMessageTime;
const palette = CHAT_EMOJI_OPTIONS;
const errorText = (e: unknown) => e instanceof Error ? e.message : "Unable to load messages. Please try again.";
export type ChatToolTarget = { kind: "search" | "pins" | "deleted"; channelId: string; channelName: string } |
  { kind: "message" | "history"; channelId: string; channelName: string; messageId: string };

function ChatImagePreview({ src, fileName, onLoad }: { src: string; fileName: string; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="creator-chat-image-preview" src={src} alt={`Preview of ${fileName}`}
    loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => setFailed(true)} />;
}

export function ChatMessageContent({ message: m, channelId, onReply, onEdit, onChanged, onOpen, onError, onModerate, onHistory, onPreviewLoad, recentEmojis, onReactionSelected }: {
  message: ChatMessage; channelId: string; onReply: (message: ChatMessage) => void; onEdit?: (message: ChatMessage) => void;
  onChanged: (message: ChatMessage) => void; onOpen: (messageId: string) => void; onError: (e: unknown) => void;
  onModerate?: (message: ChatMessage) => void; onHistory?: (messageId: string) => void;
  onPreviewLoad?: () => void;
  recentEmojis?: readonly string[]; onReactionSelected?: (emoji: string) => void;
}) {
  // During a rolling deploy the older API still returns ordinary messages.
  const reactions = m.reactions ?? [];
  const [busy, setBusy] = useState(false);
  // Owner-retained deleted content stays hidden until explicitly requested.
  // The component keeps its state across the normal transcript refreshes.
  const [deletedExpanded, setDeletedExpanded] = useState(false);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"recent" | "browse">("recent");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [pickerHost, setPickerHost] = useState<HTMLElement | null>(null);
  const [pickerPosition, setPickerPosition] = useState<CSSProperties>({});
  const pickerId = useId();
  const sixRecentEmojis = normalizeRecentEmojis(recentEmojis);
  const pickerEmojis = pickerMode === "recent"
    ? sixRecentEmojis
    : palette.filter(([emoji, label]) => `${label} ${emoji}`.toLowerCase().includes(emojiSearch.trim().toLowerCase())).map(([emoji]) => emoji);
  const menuButton = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [popupHost, setPopupHost] = useState<HTMLElement | null>(null);
  const [popupPosition, setPopupPosition] = useState<CSSProperties>({});
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!menuOpen) return;
    popupRef.current?.querySelector<HTMLElement>("button, a, summary")?.focus({ preventScroll: true });
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !menuButton.current?.contains(target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      setMenuOpen(false); menuButton.current?.focus();
    };
    const closeOnScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popupRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnResize = () => setMenuOpen(false);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [menuOpen]);

  // The picker uses the same viewport-bounded portal approach as More.
  // It must never become a child of the message row's scrollable layout.
  const openReactionPicker = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) return;
    if (pickerOpen) { setPickerOpen(false); return; }
    const box = event.currentTarget.getBoundingClientRect();
    const width = Math.min(248, Math.max(160, window.innerWidth - 16));
    const height = 350;
    const below = window.innerHeight - box.bottom;
    const above = box.top;
    const placeBelow = below >= height + 8 || below >= above;
    const top = placeBelow
      ? Math.max(8, Math.min(box.bottom + 6, window.innerHeight - height - 8))
      : Math.max(8, box.top - height - 6);
    setPickerHost(event.currentTarget.closest("dialog") ?? document.body);
    setPickerPosition({
      position: "fixed",
      top, left: Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)),
      width, maxHeight: Math.max(130, window.innerHeight - 16),
    });
    setPickerMode("recent"); setEmojiSearch("");
    setMenuOpen(false);
    setPickerOpen(true);
  };
  useEffect(() => {
    if (pickerOpen) pickerRef.current?.querySelector<HTMLButtonElement>(".creator-chat-emoji-popover-grid button")?.focus({ preventScroll: true });
  }, [pickerOpen]);
  useEffect(() => {
    if (!pickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (pickerRef.current?.contains(event.target) || pickerTrigger.current?.contains(event.target)) return;
      setPickerOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      setPickerOpen(false);
      pickerTrigger.current?.focus({ preventScroll: true });
    };
    const closeScroll = (event: Event) => {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) return;
      setPickerOpen(false);
    };
    const closeResize = () => setPickerOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    document.addEventListener("scroll", closeScroll, true);
    window.addEventListener("resize", closeResize);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      document.removeEventListener("scroll", closeScroll, true);
      window.removeEventListener("resize", closeResize);
    };
  }, [pickerOpen]);

  const openActionMenu = (event: MouseEvent<HTMLButtonElement>) => {
    if (menuOpen) { setMenuOpen(false); return; }
    const box = event.currentTarget.getBoundingClientRect();
    const width = Math.min(232, window.innerWidth - 16);
    const below = window.innerHeight - box.bottom;
    const above = box.top;
    const placeBelow = below >= 240 || below >= above;
    const available = Math.max(100, (placeBelow ? below : above) - 12);
    setPopupHost(event.currentTarget.closest("dialog") ?? document.body);
    setPopupPosition({
      left: Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)),
      width, maxHeight: available,
      ...(placeBelow ? { top: box.bottom + 6 } : { bottom: window.innerHeight - box.top + 6 }),
    });
    setMenuOpen(true);
  };
  const act = (fn: () => void) => {
    if (busy) return;
    setMenuOpen(false); menuButton.current?.focus(); fn();
  };
  async function update(kind: "reaction" | "pin", body: object) {
    // Ref lock closes the gap before React commits busy=true on rapid taps.
    if (busy || request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const response = await apiRequest<{ message: ChatMessage }>(`/api/chat/channels/${channelId}/messages/${m.id}/${kind}`, {
        method: "PUT", body: JSON.stringify(body), signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        onChanged(response.message);
        if (kind === "reaction" && "emoji" in body && typeof body.emoji === "string") onReactionSelected?.(body.emoji);
      }
    } catch (e) { if (!controller.signal.aborted) onError(e); }
    finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const attachmentPath = `${API_BASE_URL}/api/chat/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(m.id)}`;
  const voiceDuration = m.attachment?.voiceDurationMs;
  return <div className={`creator-chat-message-content ${m.deleted ? (deletedExpanded ? "is-deleted is-expanded" : "is-deleted is-collapsed") : ""}`}>
    {m.deleted && <header className="creator-chat-deleted-author">
      <strong>{m.authorName}</strong><time dateTime={m.createdAt}>{chatTime(m.createdAt)}</time>
    </header>}
    {m.deleted && <button type="button" className="creator-chat-deleted-toggle"
      aria-expanded={deletedExpanded} onClick={() => setDeletedExpanded((open) => !open)}>Deleted Message</button>}
    {(!m.deleted || deletedExpanded) && <>
    {m.replyUnavailable && <span className="creator-chat-quote-unavailable">Original message unavailable.</span>}
    {m.replyTo && <button type="button" className="creator-chat-quote" onClick={() => onOpen(m.replyTo!.id)}
      aria-label={`View original message by ${m.replyTo.authorName}`}
      title={`Reply to ${m.replyTo.authorName}: ${m.replyTo.text || "Attachment"}`}>
      <span className="creator-chat-quote-author">{m.replyTo.authorName}{m.replyTo.deleted ? " · Deleted" : ""}{m.replyTo.version > 1 ? " · edited" : ""}</span>
      <span className="creator-chat-quote-preview">{m.replyTo.text || "Attachment"}</span>
    </button>}
    {!m.deleted && <header><strong>{m.authorName}</strong><time dateTime={m.createdAt}>{chatTime(m.createdAt)}</time>{m.systemNotice && <small>{m.announcement ? 'Staff announcement' : 'System notice'}</small>}{m.version > 1 && <small>Edited</small>}</header>}
    {m.pinnedAt && <small className="creator-chat-pin-label">Pinned by {m.pinnedByName}</small>}
    {m.text && <p>{m.text}</p>}
    {m.attachment && <>
      {m.attachment.available && m.attachment.canPreview && <ChatImagePreview
        key={attachmentPath} src={`${attachmentPath}/preview`} fileName={m.attachment.fileName} onLoad={onPreviewLoad}
      />}
      {(!m.attachment.canPreview || !m.attachment.available || !!voiceDuration) && <div className={`creator-chat-file ${voiceDuration ? "is-voice" : ""}`}>
        {!voiceDuration && <><strong>{m.attachment.fileName}</strong>{!m.deleted && <small>{m.attachment.byteSize.toLocaleString()} bytes</small>}</>}
        {m.attachment.available && !!voiceDuration && <ChatVoicePlayback key={attachmentPath} src={`${attachmentPath}/voice`} durationMs={voiceDuration} />}
        {!m.attachment.available && <small className="creator-chat-file-unavailable">File unavailable</small>}
      </div>}
    </>}
    {!!reactions.length && <div className="creator-chat-reactions" aria-label="Message reactions">{reactions.map((r) => m.canReply ?
      <button type="button" key={r.emoji} aria-pressed={r.mine} aria-label={`${palette.find(([emoji]) => emoji === r.emoji)?.[1] ?? "Reaction"}: ${r.count}${r.mine ? ", yours; remove reaction" : "; add reaction"}`} disabled={busy}
        onClick={() => void update("reaction", { emoji: r.emoji, active: !r.mine })}><span>{r.emoji}</span><span>{r.count}</span></button> :
      <span className="creator-chat-reaction-count" key={r.emoji} aria-label={`${r.emoji}: ${r.count}`}>{r.emoji} {r.count}</span>)}</div>}
    {(m.attachment?.available || m.canReply || (m.canEdit && onEdit) || m.canPin || (m.canModerate && onModerate) || (m.canViewHistory && onHistory)) && <div
      className="creator-chat-message-actions" role="group" aria-label={`Actions for message by ${m.authorName}`}>
      {m.canReply && <div className="creator-chat-quick-reactions" role="group" aria-label="Quick reactions">
        {sixRecentEmojis.slice(0, 3).map((emoji) => <button key={emoji} type="button" disabled={busy}
          title={emojiLabel(emoji)} aria-label={`React with ${emojiLabel(emoji)}`}
          aria-pressed={reactions.some((r) => r.emoji === emoji && r.mine)}
          onClick={() => void update("reaction", { emoji, active: !reactions.some((r) => r.emoji === emoji && r.mine) })}>{emoji}</button>)}
        <button ref={pickerTrigger} type="button" className="creator-chat-toolbar-emoji-trigger"
          title="Choose another emoji" aria-label="Choose another emoji" aria-haspopup="dialog"
          aria-expanded={pickerOpen} aria-controls={pickerId} disabled={busy}
          onClick={openReactionPicker}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 13.2A7.6 7.6 0 1 1 11 4.4M7.6 13.7c1.5 2 4.3 2 5.8 0M8.2 9.7h.1M12.4 9.7h.1M19 2v7M15.5 5.5h7" />
          </svg>
        </button>
      </div>}
      {m.canReply && <button className="creator-chat-toolbar-action" type="button" disabled={busy}
        aria-label="Reply to message" title="Reply" onClick={() => onReply(m)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"><path d="M10 9 5 13l5 4M5 13h9c4 0 6 2 6 6" /></svg>
      </button>}
      {m.canEdit && onEdit && <button className="creator-chat-toolbar-action" type="button" disabled={busy}
        aria-label="Edit message" title="Edit" onClick={() => onEdit(m)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"><path d="m4 16-.6 4.6L8 20l11-11-4-4L4 16ZM13 7l4 4" /></svg>
      </button>}
      <div className="creator-chat-action-menu">
        <button ref={menuButton} type="button" className="creator-chat-more-button"
          aria-label={`More actions for message by ${m.authorName}`} title="More"
          aria-expanded={menuOpen} aria-controls={popupId} onClick={openActionMenu}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
        {menuOpen && popupHost && createPortal(<div id={popupId} ref={popupRef}
          className="creator-chat-action-popover" style={popupPosition} role="group" aria-label="Message actions">
          {m.canReply && <button type="button" disabled={busy} onClick={() => act(() => onReply(m))}>Reply</button>}
          {m.canReply && <button type="button" disabled={busy} onClick={openReactionPicker}>React…</button>}
          {m.attachment?.available && <a href={`${attachmentPath}/file`} target="_blank" rel="noopener"
            aria-label={`Download ${m.attachment.fileName}`} onClick={() => setMenuOpen(false)}>Download file</a>}
          {m.canEdit && onEdit && <button type="button" disabled={busy} onClick={() => act(() => onEdit(m))}>Edit</button>}
          {m.canPin && <button type="button" disabled={busy} onClick={() => act(() => void update("pin", { pinned: !m.pinnedAt, version: m.pinVersion }))}>{m.pinnedAt ? "Unpin message" : "Pin message"}</button>}
          {m.canViewHistory && onHistory && <button type="button" disabled={busy} onClick={() => act(() => onHistory(m.id))}>View history</button>}
          {m.canModerate && onModerate && <button type="button" className="creator-chat-delete-action" disabled={busy} onClick={() => act(() => onModerate(m))}>Delete message…</button>}
        </div>, popupHost)}
      </div>
      {busy && <span role="status">Saving…</span>}
    </div>}
    {pickerOpen && pickerHost && m.canReply && createPortal(
      <div id={pickerId} ref={pickerRef} className="creator-chat-emoji-popover"
        style={pickerPosition} role="dialog" aria-label="Choose reaction emoji"
        onKeyDown={(event) => {
          // Portal key events still bubble through their React owner. Escape
          // closes only the picker, never the parent Search/Pins flyout.
          if (event.key !== "Escape") return;
          event.preventDefault(); event.stopPropagation();
          setPickerOpen(false); pickerTrigger.current?.focus({ preventScroll: true });
        }}>
        <header className="creator-chat-emoji-popover-heading">
          <strong>{pickerMode === "recent" ? "Your recent emojis" : "Add emoji"}</strong>
          <button type="button" aria-label="Close emoji picker" onClick={() => setPickerOpen(false)}>×</button>
        </header>
        {pickerMode === "browse" && <label className="creator-chat-emoji-library-search">
          <span className="creator-chat-sr">Search emoji library</span>
          <input type="search" placeholder="Search emojis…" value={emojiSearch}
            onChange={(event) => setEmojiSearch(event.target.value)} />
        </label>}
        <div className={`creator-chat-emoji-popover-grid ${pickerMode === "browse" ? "is-library" : ""}`} role="group"
          aria-label={pickerMode === "recent" ? "Six recent emojis" : "Available emoji library"}>
          {pickerEmojis.map((emoji) => <button key={emoji} type="button" disabled={busy}
            title={emojiLabel(emoji)} aria-label={emojiLabel(emoji)}
            aria-pressed={reactions.some((r) => r.emoji === emoji && r.mine)}
            onClick={() => {
              setPickerOpen(false);
              void update("reaction", { emoji, active: !reactions.some((r) => r.emoji === emoji && r.mine) });
            }}>{emoji}</button>)}
        </div>
        <footer className="creator-chat-emoji-popover-footer">
          <button type="button" onClick={() => {
            setPickerMode(pickerMode === "recent" ? "browse" : "recent"); setEmojiSearch("");
          }}>{pickerMode === "recent" ? "Add emoji" : "Recent"}</button>
          {pickerMode === "browse" && <span className="creator-chat-emoji-library-count">{pickerEmojis.length} emojis</span>}
        </footer>
      </div>, pickerHost)}
    </>}
  </div>;
}

type SearchResult = { channelId: string; channelName: string; areaName: string; isPrivate: boolean; message: ChatMessage };
type SearchPage = { results: SearchResult[]; hasMore: boolean; nextBefore: string | null };
type PinPage = { messages: ChatMessage[]; hasMore: boolean; nextBefore: string | null };
type HistoryEvent = { id: string; action: string; actorName: string; occurredAt: string; beforeText: string | null; afterText: string | null; reason: string | null };
type SearchSubmission = { q: string; scope: string } | null;
type ToolState = { query: string; scope: string; submitted: SearchSubmission; cursors: string[]; scrollTop: number };
type ToolProps = {
  inline?: boolean;
  target: ChatToolTarget; onClose: () => void; onOpen: (target: ChatToolTarget) => void;
  onConversation: (channelId: string) => void; onJumpToMessage: (channelId: string, messageId: string) => void; onReply: (channelId: string, message: ChatMessage) => void;
  onChanged: (channelId: string, message: ChatMessage) => void;
  onModerate: (channelId: string, message: ChatMessage) => void;
  notice?: string; revision?: number; paused?: boolean;
  recentEmojis?: readonly string[]; onReactionSelected?: (emoji: string) => void;
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

function ChatToolView({ target, onClose, onOpen, onConversation, onJumpToMessage, onReply, onChanged, onModerate, saved, backLabel, onBack, notice, revision: parentRevision, paused, inline = false, recentEmojis, onReactionSelected }: Omit<ToolProps, "onOpen"> & {
  saved?: ToolState; backLabel?: string; onBack: () => void; onOpen: (target: ChatToolTarget, state: ToolState) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inlinePanel = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(saved?.query ?? "");
  const [scope, setScope] = useState(saved?.scope ?? "conversation");
  const [submitted, setSubmitted] = useState<SearchSubmission>(saved?.submitted ?? null);
  const [cursors, setCursors] = useState<string[]>(saved?.cursors ?? []);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pins, setPins] = useState<ChatMessage[]>([]);
  const [confirmUnpin, setConfirmUnpin] = useState<string | null>(null);
  const [unpinBusy, setUnpinBusy] = useState(false);
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
    const targetSurface = inline ? inlinePanel.current : dialog.current;
    const timer = setTimeout(() => (notice ? targetSurface?.querySelector<HTMLButtonElement>("header button") : targetSurface?.querySelector<HTMLElement>(".creator-chat-action-menu summary") ?? targetSurface?.querySelector<HTMLButtonElement>("header button"))?.focus(), 0);
    return () => clearTimeout(timer);
  }, [paused, notice, inline]);
  useLayoutEffect(() => {
    const surface = inline ? inlinePanel.current : dialog.current;
    if (loaded && !restoredScroll.current && surface) { surface.scrollTop = saved?.scrollTop ?? 0; restoredScroll.current = true; }
  }, [loaded, saved, inline]);
  const navigate = (next: ChatToolTarget) => onOpen(next, { query, scope, submitted, cursors, scrollTop: (inline ? inlinePanel.current : dialog.current)?.scrollTop ?? 0 });
  useEffect(() => {
    if (inline) { searchInput.current?.focus(); return; }
    const element = dialog.current; element?.showModal(); searchInput.current?.focus();
    return () => element?.close();
  }, [inline]);
  // Invalidate old results from the user's input event, rather than doing
  // synchronous state updates inside an effect. This also aborts the previous
  // permission-checked request as soon as the submitted search is cleared.
  function invalidateSearch() {
    setSubmitted(null); setCursors([]); setResults([]); setNextBefore(null);
    setLoaded(false); setBusy(false); setError("");
  }
  // Live search runs only after the user stops typing for 400ms.
  useEffect(() => {
    if (target.kind !== "search") return;
    const text = query.trim();
    if (text.length < 2) return;
    const timer = setTimeout(() => {
      setSubmitted({ q: text, scope });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, scope, target.kind]);
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
    return <ChatMessageContent message={value} channelId={channelId} recentEmojis={recentEmojis} onReactionSelected={onReactionSelected} onReply={(m) => onReply(channelId, m)} onChanged={(m) => changed(channelId, m)}
      onOpen={(messageId) => navigate({ kind: "message", channelId, channelName, messageId })} onError={(e) => { setActionError(errorText(e)); setRevision((v) => v + 1); }}
      onModerate={(m) => onModerate(channelId, m)} onHistory={target.kind === "history" ? undefined : (messageId) => navigate({ kind: "history", channelId, channelName, messageId })} />;
  }
  async function removePin(value: ChatMessage) {
    if (!value.canPin || unpinBusy || !value.pinnedAt) return;
    setUnpinBusy(true); setActionError("");
    try {
      const response = await apiRequest<{ message: ChatMessage }>(
        `/api/chat/channels/${encodeURIComponent(target.channelId)}/messages/${encodeURIComponent(value.id)}/pin`,
        { method: "PUT", body: JSON.stringify({ pinned: false, version: value.pinVersion }) });
      changed(target.channelId, response.message);
      setConfirmUnpin(null);
    } catch (err) {
      setActionError(errorText(err)); setRevision((v) => v + 1);
    } finally { setUnpinBusy(false); }
  }
  const body = <>
    <header><h2 id="chat-tools-title">{target.kind === "search" ? "Search messages" : target.kind === "pins" ? "Pinned messages" : target.kind === "deleted" ? "Deleted messages · Owner view" : target.kind === "history" ? "Message history · Owner view" : "Message"}</h2><button type="button" className={target.kind === "pins" ? "creator-chat-pin-close" : "creator-chat-live-close"} aria-label={target.kind === "pins" ? "Close pinned messages" : "Close panel"} onClick={onClose}>{target.kind === "pins" ? "×" : "Close"}</button></header>
    {backLabel && <button type="button" className="creator-chat-back" onClick={onBack}>← {backLabel}</button>}
    <p className="creator-chat-tools-context">{target.channelName}</p>
    {(target.kind === "deleted" || target.kind === "history") && <p className="creator-chat-owner-help">{target.kind === "history" ? "Owner-only · Full message and change history." : "Only Owners can view these retained records. Deleted messages stay hidden from everyone else."}</p>}
    {notice && target.kind !== "history" && <p className="creator-chat-notice" role="status">{notice}</p>}
    {target.kind === "search" && <form className="creator-chat-message-search" role="search" onSubmit={submit}>
      <label htmlFor="chat-search-text">Search messages</label>
      <div className="creator-chat-message-search-field">
        <input ref={searchInput} id="chat-search-text" type="search" minLength={2} maxLength={120} required
          placeholder="Search for a word or phrase…" value={query}
          onChange={(e) => { invalidateSearch(); setQuery(e.target.value); }} />
        {!!query && <button type="button" className="creator-chat-search-clear" aria-label="Clear message search"
          title="Clear search"
          onClick={() => { invalidateSearch(); setQuery(""); searchInput.current?.focus(); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></svg>
        </button>}
      </div>
      <label htmlFor="chat-search-scope">Search in</label><div><select id="chat-search-scope" value={scope} onChange={(e) => { invalidateSearch(); setScope(e.target.value); }}><option value="conversation">Current conversation</option><option value="all">All conversations I can access</option></select><button type="submit" disabled={query.trim().length < 2}>Go</button></div>
    </form>}
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {actionError && <p className="creator-chat-error" role="alert">{actionError}</p>}
    {busy && !loaded && <p role="status">Loading messages…</p>}
    {target.kind === "search" && !submitted && <p className="creator-chat-search-hint">Type at least 2 characters to search messages.</p>}
    {target.kind === "search" && loaded && !error && <><p role="status">{results.length ? `Showing ${results.length}${nextBefore ? "+" : ""} matching messages for “${submitted?.q}”.` : "No matching messages in your current conversations."}</p>{results.map((r) => <article className="creator-chat-tool-result" key={r.message.id}><small>{r.areaName} / {r.channelName}{r.isPrivate ? " · Private" : ""}{r.message.deleted ? " · Deleted · Owner view" : ""}</small><strong>{r.message.authorName} · {chatTime(r.message.createdAt)}</strong><p>{r.message.text}</p><button type="button" onClick={() => onJumpToMessage(r.channelId, r.message.id)}>Jump to message</button></article>)}</>}
    {target.kind === "pins" && loaded && !error && <div className="creator-chat-pin-list" role="list" aria-label="Pinned messages">
      {!pins.length && <p>No pinned messages yet.</p>}
      {pins.map((m) => <article className="creator-chat-pin-card" role="listitem" key={m.id}>
        <div className="creator-chat-pin-card-head">
          <span className="creator-chat-pin-avatar" aria-hidden="true">{m.authorName.slice(0, 1).toUpperCase()}</span>
          <div className="creator-chat-pin-identity">
            <strong>{m.authorName}</strong>
            <time dateTime={m.createdAt}>{new Intl.DateTimeFormat("en-US", {
              timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            }).format(new Date(m.createdAt))}</time>
          </div>
          {m.canPin && <button type="button" className="creator-chat-pin-remove"
            aria-label={`Remove pinned message by ${m.authorName}`}
            title="Remove pin" disabled={unpinBusy}
            onClick={() => setConfirmUnpin(confirmUnpin === m.id ? null : m.id)}>×</button>}
        </div>
        <p className="creator-chat-pin-excerpt">{m.deleted ? "Deleted message" : m.text || (m.attachment?.fileName ?? "Attachment")}</p>
        <div className="creator-chat-pin-card-actions">
          <button type="button" onClick={() => onJumpToMessage(target.channelId, m.id)}>Jump</button>
          {confirmUnpin === m.id && <div className="creator-chat-pin-confirm" role="group" aria-label="Confirm unpin">
            <span>Unpin this message?</span>
            <button type="button" disabled={unpinBusy} onClick={() => void removePin(m)}>{unpinBusy ? "Removing…" : "Confirm"}</button>
            <button type="button" disabled={unpinBusy} onClick={() => setConfirmUnpin(null)}>Cancel</button>
          </div>}
        </div>
      </article>)}
    </div>}
    {target.kind === "deleted" && loaded && !error && <>{!pins.length && <p>No deleted messages in this conversation.</p>}{pins.map((m) => <article className="creator-chat-tool-result" key={m.id}>{content(m, target.channelId, target.channelName)}<button type="button" onClick={() => navigate({ kind: "message", channelId: target.channelId, channelName: target.channelName, messageId: m.id })}>View message</button></article>)}</>}
    {(target.kind === "message" || target.kind === "history") && message && <article className="creator-chat-tool-result">{target.kind === "history" ? <details className="creator-chat-record-preview"><summary>{message.deleted ? "Retained message" : "Current message"} · {message.authorName}</summary>{content(message, target.channelId, target.channelName)}</details> : content(message, target.channelId, target.channelName)}<button type="button" onClick={() => onConversation(target.channelId)}>Go to latest conversation</button></article>}
    {target.kind === "history" && !error && loaded && <div className="creator-chat-revision-list"><h3>Activity history</h3>{!history.length && <p>No recorded history is available for this message.</p>}{history.map((event) => <article key={event.id}><header><strong>{event.action === "chat.message.send" ? "Sent" : event.action === "chat.message.edit" ? "Edited" : "Deleted"} · {event.actorName}</strong><time dateTime={event.occurredAt}>{chatTime(event.occurredAt)}</time></header>{event.beforeText !== null && <div><strong>{event.action === "chat.message.delete" ? "Retained text" : "Before"}</strong><p>{event.beforeText}</p></div>}{event.afterText !== null && <div><strong>{event.action === "chat.message.send" ? "Original text" : "After"}</strong><p>{event.afterText}</p></div>}{event.reason && <p>Reason: {event.reason}</p>}</article>)}</div>}
    {nextBefore && <button type="button" disabled={busy} onClick={() => setCursors((old) => [...old, nextBefore])}>Load more</button>}
    {error && <button type="button" onClick={() => { setCursors([]); setRevision((v) => v + 1); }}>Refresh messages</button>}
  </>;
  return inline
    ? <aside ref={inlinePanel} className={`creator-chat-live-panel creator-chat-tools ${target.kind === "pins" ? "is-pins" : "is-search"}`} aria-labelledby="chat-tools-title"
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>{body}</aside>
    : <dialog ref={dialog} className="creator-chat-settings creator-chat-tools" aria-labelledby="chat-tools-title" onCancel={onClose}>{body}</dialog>;
}
