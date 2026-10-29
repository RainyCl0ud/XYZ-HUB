import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "../lib/api";

export type QuarantineControl = { modelId: string; userId: string; personName: string; active: boolean; canPause: boolean; canLift: boolean };
type Review = QuarantineControl & { creatorName: string; version: number; assignmentId: string | null; privateChatId: string | null; reason: string | null; changedAt: string | null; changedByName: string | null };
type Phase = "checking" | "ready" | "saving" | "review" | "unavailable" | "already";
export default function ChatQuarantineDialog({ target, onClose, onSaved }: {
  target: QuarantineControl; onClose: () => void; onSaved: (result: Review) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const desiredActive = !target.active;
  const endpoint = `/api/chat/areas/${encodeURIComponent(target.modelId)}/quarantines/${encodeURIComponent(target.userId)}`;
  const check = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setPhase("checking"); setError("");
    try {
      const current = await apiRequest<Review>(endpoint, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setReview(current);
      if (current.active === desiredActive) { setPhase("already"); return; }
      if (!(desiredActive ? current.canPause : current.canLift)) { setPhase("unavailable"); setError("Your current access does not allow this change. No request was sent."); return; }
      setPhase("ready");
    } catch (e) {
      if (controller.signal.aborted) return;
      const denied = e instanceof ApiError && [401, 403, 404].includes(e.status);
      setPhase(denied ? "unavailable" : "review");
      setError(denied ? "This review is no longer available. The person’s assignment, role or your access may have changed." : "We couldn’t check the current status. Your reason is kept; check again before confirming.");
    }
  }, [endpoint, desiredActive]);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current; element?.showModal();
    const timer = setTimeout(() => void check(), 0);
    return () => { clearTimeout(timer); request.current?.abort(); element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [check]);
  useEffect(() => { if (phase === "ready") input.current?.focus(); }, [phase]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (phase !== "ready" || !review || !reason.trim()) return;
    const controller = new AbortController(); request.current = controller; setPhase("saving"); setError("");
    try {
      const result = await apiRequest<Review>(endpoint, { method: "PUT", signal: controller.signal,
        body: JSON.stringify({ active: desiredActive, version: review.version, assignmentId: review.assignmentId, reason: reason.trim(), requestId: crypto.randomUUID() }) });
      if (!controller.signal.aborted) onSaved(result);
    } catch (e) {
      if (controller.signal.aborted) return;
      const denied = e instanceof ApiError && [401, 403, 404].includes(e.status);
      setPhase(denied ? "unavailable" : "review");
      setError(denied ? "Your access or the person’s role changed. Close this window to refresh the chat." : e instanceof ApiError && e.status === 409
        ? "Chat access changed while you were reviewing it. Your reason is kept. Check the current status before confirming again."
        : "We couldn’t confirm whether the change finished. Your reason is kept. Check the current status before doing anything else.");
    }
  }
  return <dialog ref={dialog} className="creator-chat-settings creator-chat-quarantine" aria-labelledby="chat-quarantine-title" aria-describedby="chat-quarantine-impact" onCancel={(e) => { if (phase === "saving") e.preventDefault(); else onClose(); }}>
    <header><h2 id="chat-quarantine-title">{desiredActive ? "Pause creator chats?" : "Lift chat pause?"}</h2><button type="button" disabled={phase === "saving"} onClick={onClose}>Close</button></header>
    <p className="creator-chat-tools-context"><strong>{review?.personName ?? target.personName}</strong>{review && <> · {review.creatorName}</>}</p>
    <p id="chat-quarantine-impact">{desiredActive ? <>Only their other chats for <strong>{review?.creatorName ?? "this creator"}</strong> will close. Their own staff–management private chat stays open.</> : <>Chats for <strong>{review?.creatorName ?? "this creator"}</strong> will follow their current assignments and permissions. Previous assignments or removed channel access will not return.</>}</p>
    <p>Login, Clock &amp; Hours and other creators are unaffected. No team-wide announcement is sent.</p>
    {review?.active && review.changedAt && <div className="creator-chat-pause-record"><strong>Currently paused</strong><p>By {review.changedByName} · {new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(review.changedAt))}</p><p>Reason: {review.reason}</p></div>}
    {phase === "checking" && <p role="status">Checking current assignment, chat status and your access…</p>}
    {phase === "already" && <p role="status">{desiredActive ? "Their chats are already paused." : "Their pause has already been lifted."} No additional change was made.</p>}
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {phase !== "already" && <form onSubmit={(e) => void submit(e)}>
      <label htmlFor="chat-quarantine-reason">Reason for {desiredActive ? "pausing chats" : "lifting the pause"}</label>
      <textarea ref={input} id="chat-quarantine-reason" rows={3} required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} disabled={phase !== "ready"} aria-describedby="chat-quarantine-help" />
      <p id="chat-quarantine-help">Recorded for management review · {reason.length.toLocaleString()} / 1,000 characters. Don’t include passwords or secrets.</p>
      <div className="creator-chat-dialog-actions"><button type="button" disabled={phase === "saving"} onClick={onClose}>Cancel</button>{phase === "review" ? <button type="button" onClick={() => void check()}>Check current status</button> : phase !== "unavailable" && <button className="creator-chat-quarantine-confirm" type="submit" disabled={phase !== "ready" || !reason.trim()}>{phase === "saving" ? "Saving…" : desiredActive ? "! Pause these creator chats" : "Lift pause"}</button>}</div>
    </form>}
    {phase === "already" && review && <div className="creator-chat-dialog-actions"><button type="button" onClick={() => onSaved(review)}>Return to chat</button></div>}
  </dialog>;
}
