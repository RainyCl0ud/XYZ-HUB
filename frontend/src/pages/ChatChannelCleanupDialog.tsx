import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

export type CleanupTarget = {
  channelId: string;
  name: string;
  download: { id: string; fileName: string };
};

export default function ChatChannelCleanupDialog({ target, onClose, onCleaned }: {
  target: CleanupTarget;
  onClose: () => void;
  onCleaned: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmedSaved || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/chat/channels/${encodeURIComponent(target.channelId)}/cleanup`, {
        method: "PUT",
        body: JSON.stringify({ name: target.name, downloadId: target.download.id, confirmedSaved }),
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Couldn’t confirm cleanup. Try again.");
      return;
    }
    onCleaned();
  }

  return (
    <dialog ref={dialog} className="creator-chat-settings" aria-labelledby="chat-cleanup-title" aria-describedby="chat-cleanup-impact"
      onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
      <header>
        <h2 id="chat-cleanup-title">Clean up archived channel?</h2>
        <button type="button" disabled={busy} onClick={onClose}>Close</button>
      </header>
      <p id="chat-cleanup-impact">
        <strong>{target.name}</strong> will disappear from the Chat list and search.
        Owners can still open its messages, edit history and files from the Audit Log.
      </p>
      <p className="creator-chat-cleanup-file">{target.download.fileName}</p>
      <form onSubmit={event => void submit(event)}>
        <label className="creator-chat-cleanup-confirm">
          <input type="checkbox" checked={confirmedSaved} disabled={busy} onChange={event => setConfirmedSaved(event.target.checked)} required />
          I saved this ZIP and can open it
        </label>
        {error && <p className="creator-chat-error" role="alert">{error}</p>}
        <div className="creator-chat-dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!confirmedSaved || busy}>{busy ? "Cleaning up…" : "Clean up channel"}</button>
        </div>
      </form>
    </dialog>
  );
}
