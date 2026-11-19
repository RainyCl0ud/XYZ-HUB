import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import { ChatMentionText, type ChatMessage } from "./ChatMessageTools";
import { formatCentralMessageTime } from "../lib/central-time";
import { CENTRAL_TIME_ZONE } from "../lib/central-time";
import { useChatMentionCount } from "../components/ChatMentionCountContext";
type Item = { channelId: string; conversationName: string; message: ChatMessage };
type Page = { mentions: Item[]; nextBefore: string | null };
export default function ChatMentions({ onClose, onOpen }: { onClose: () => void; onOpen: (channelId: string, messageId: string) => void }) {
  const mentionCount = useChatMentionCount();
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState<Page | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal(); const controller = new AbortController();
    void apiRequest<Page>("/api/chat/mentions", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setPage(result); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load mentions."); });
    return () => controller.abort();
  }, [mentionCount]);
  const loadMore = async () => {
    if (!page?.nextBefore || busy) return; setBusy(true); setError("");
    try { const next = await apiRequest<Page>(`/api/chat/mentions?before=${encodeURIComponent(page.nextBefore)}`); setPage(old => ({ mentions: [...(old?.mentions ?? []), ...next.mentions], nextBefore: next.nextBefore })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load mentions."); } finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="creator-chat-mentions-dialog" aria-labelledby="chat-mentions-heading" onCancel={onClose}>
    <header><div><h2 id="chat-mentions-heading">Mentions</h2><p>Unread messages that mention you. Open a message to view it.</p></div><button type="button" onClick={onClose} autoFocus aria-label="Close mentions">×</button></header>
    {error && <p role="alert">{error}</p>}
    {!page && !error && <p role="status">Loading mentions…</p>}
    {page && !page.mentions.length && <div className="creator-chat-mentions-empty"><strong>You’re all caught up</strong><p>New mentions will appear here. Other unread messages stay under Channels and Private.</p></div>}
    <div className="creator-chat-mentions-list">{page?.mentions.map(item => <button type="button" key={item.message.id} onClick={() => onOpen(item.channelId, item.message.id)}><small>{item.conversationName}</small><strong>{item.message.authorName} <time dateTime={item.message.createdAt}>{new Date(item.message.createdAt).toLocaleDateString("en-US", { timeZone: CENTRAL_TIME_ZONE })} · {formatCentralMessageTime(item.message.createdAt)}</time></strong><span><ChatMentionText text={item.message.text} mentions={item.message.mentions} /></span></button>)}</div>
    {page?.nextBefore && <button type="button" disabled={busy} onClick={() => void loadMore()}>{busy ? "Loading…" : "Load earlier mentions"}</button>}
  </dialog>;
}
