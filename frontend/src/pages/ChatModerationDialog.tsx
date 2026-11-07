import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "../lib/api";
import type { ChatMessage } from "./ChatMessageTools";

export type ModerationTarget = { channelId: string; conversationName: string; message: ChatMessage };
type Phase = "checking" | "ready" | "deleting" | "review" | "unavailable";
export default function ChatModerationDialog({ target, onClose, onDeleted }: {
  target: ModerationTarget; onClose: () => void; onDeleted: (channelId: string, id: string, retained: ChatMessage | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<ChatMessage | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);
  const busy = phase === "checking" || phase === "deleting";
  const review = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await apiRequest<{ message: ChatMessage }>(`/api/chat/channels/${target.channelId}/messages/${target.message.id}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.message.deleted || !result.message.canModerate) {
        setPhase("unavailable"); setError(result.message.deleted ? "This message is already deleted. Close this window to return to the updated conversation." : "You no longer have permission to delete this message."); return;
      }
      setMessage(result.message); setUpdated(result.message.version !== target.message.version); setPhase("ready");
    } catch (e) {
      if (controller.signal.aborted) return;
      const denied = e instanceof ApiError && [401, 403, 404].includes(e.status);
      setPhase(denied ? "unavailable" : "review");
      setError(denied ? "This message is no longer available to you. It may have been deleted or your access changed." : "We couldn’t check the message. Your reason is kept here; check again before deleting.");
    }
  }, [target]);
  useEffect(() => {
    const element = dialog.current; element?.showModal();
    const timer = setTimeout(() => void review(), 0);
    return () => { clearTimeout(timer); request.current?.abort(); element?.close(); };
  }, [review]);
  useEffect(() => { if (phase === "ready") reasonInput.current?.focus(); }, [phase]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (phase !== "ready" || !reason.trim() || !message) return;
    const controller = new AbortController(); request.current = controller; setPhase("deleting"); setError("");
    try {
      const result = await apiRequest<{ id: string; message: ChatMessage | null }>(`/api/chat/channels/${target.channelId}/messages/${message.id}`, {
        method: "DELETE", body: JSON.stringify({ version: message.version, reason: reason.trim() }), signal: controller.signal,
      });
      if (!controller.signal.aborted) onDeleted(target.channelId, result.id, result.message);
    } catch (e) {
      if (controller.signal.aborted) return;
      setMessage(null);
      const denied = e instanceof ApiError && [401, 403, 404].includes(e.status);
      setPhase(denied ? "unavailable" : "review");
      setError(e instanceof ApiError && e.status === 409 ? "The message changed. Review its latest text before confirming again. Your reason has been kept." : denied ? "This message is no longer available to delete. Close this window and return to the conversation." : "We couldn’t confirm whether deletion finished. Check the message again before taking another action. Your reason has been kept.");
    }
  }
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-moderation" aria-labelledby="chat-delete-title" aria-describedby="chat-delete-impact" onCancel={(e) => { if (phase === "deleting") e.preventDefault(); else onClose(); }}>
    <header><h2 id="chat-delete-title">Delete message?</h2><button type="button" disabled={phase === "deleting"} onClick={onClose}>Close</button></header>
    <p className="creator-chat-tools-context">{target.conversationName}</p>
    <p id="chat-delete-impact">It will disappear for everyone except Owners. Owners keep the full message, edits and deletion record. There is no Undo action.</p>
    {phase === "checking" && <p role="status">Checking the latest message and your access…</p>}
    {updated && phase === "ready" && <p className="creator-chat-notice" role="status">This message was edited. Please review the updated text below.</p>}
    {message && <blockquote><header><strong>{message.authorName}</strong><time dateTime={message.createdAt}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(message.createdAt))}</time></header>{message.text && <p>{message.text}</p>}{message.attachment && <p>File attachment · {message.attachment.fileName}</p>}{message.pinnedAt && <small>This message is pinned. Deleting it will also remove the pin.</small>}</blockquote>}
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    <form onSubmit={(e) => void submit(e)}>
      <label htmlFor="chat-delete-reason">Reason for deletion</label>
      <textarea ref={reasonInput} id="chat-delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} required disabled={phase !== "ready"} aria-describedby="chat-delete-help" />
      <p id="chat-delete-help">Owner review only · {reason.length.toLocaleString()} / 1,000 characters. Don’t include passwords or other secrets.</p>
      <div className="creator-chat-dialog-actions"><button type="button" disabled={phase === "deleting"} onClick={onClose}>Cancel</button>{phase === "review" ? <button type="button" onClick={() => { setPhase("checking"); setMessage(null); setError(""); void review(); }}>Check message again</button> : phase !== "unavailable" && <button type="submit" className="creator-chat-delete-confirm" disabled={busy || !reason.trim() || !message}>{phase === "deleting" ? "Deleting…" : "Delete message"}</button>}</div>
    </form>
  </dialog>;
}
