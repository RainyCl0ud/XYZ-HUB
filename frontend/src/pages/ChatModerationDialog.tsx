import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import type { ChatMessage } from "./ChatMessageTools";

export type ModerationTarget = { channelId: string; message: ChatMessage };
export default function ChatModerationDialog({ target, onClose, onDeleted }: {
  target: ModerationTarget; onClose: () => void; onDeleted: (channelId: string, id: string, retained: ChatMessage | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const element = dialog.current; element?.showModal(); reasonInput.current?.focus();
    return () => { request.current?.abort(); element?.close(); };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !reason.trim() || unavailable) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError("");
    try {
      const result = await apiRequest<{ id: string; message: ChatMessage | null }>(`/api/chat/channels/${target.channelId}/messages/${target.message.id}`, {
        method: "DELETE", body: JSON.stringify({ version: target.message.version, reason }), signal: controller.signal,
      });
      if (!controller.signal.aborted) onDeleted(target.channelId, result.id, result.message);
    } catch (e) {
      if (!controller.signal.aborted) { setUnavailable(true); setError(e instanceof Error ? e.message : "Unable to delete this message. Close and review it before trying again."); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-moderation" aria-labelledby="chat-delete-title" onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }}>
    <header><h2 id="chat-delete-title">Delete this message?</h2><button type="button" disabled={busy} onClick={onClose}>Cancel</button></header>
    <p>The message will disappear for other people. Owners retain its full content and history. A pinned message will also be unpinned.</p>
    {!unavailable && <blockquote><strong>{target.message.authorName}</strong><p>{target.message.text}</p></blockquote>}
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    <form onSubmit={(e) => void submit(e)}>
      <label htmlFor="chat-delete-reason">Reason for deletion</label>
      <textarea ref={reasonInput} id="chat-delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} required disabled={busy || unavailable} aria-describedby="chat-delete-help" />
      <p id="chat-delete-help">The reason, your name and the deletion time are retained for Owner review.</p>
      <button type="submit" className="creator-chat-delete-confirm" disabled={busy || unavailable || !reason.trim()}>{busy ? "Deleting…" : "Delete message"}</button>
    </form>
  </dialog>;
}
