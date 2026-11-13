import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./ChatMessageTools";
import { sendChatFile } from "./chatFiles";

export default function ChatAttachmentPicker({ channelId, maxBytes, onSent }: {
  channelId: string; maxBytes: number; onSent: (message: ChatMessage) => void;
}) {
  const [selection, setSelection] = useState<{ file: File; nonce: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function select(file?: File) {
    if (!file) return;
    setError("");
    setSelection(null);
    if (!file.size || file.size > maxBytes) {
      setError("Choose a nonempty file up to 500 MB.");
      return;
    }
    setSelection({ file, nonce: crypto.randomUUID() });
  }

  async function send() {
    if (!selection || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setUploading(true);
    try {
      const { file, nonce } = selection;
      const response = await sendChatFile(channelId, file, nonce, controller.signal);
      if (!controller.signal.aborted) {
        setSelection(null);
        onSent(response.message);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not send this file. Try again.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setUploading(false);
    }
  }

  return <div className="creator-chat-file-picker">
    <input ref={input} type="file" hidden onChange={event => {
      select(event.currentTarget.files?.[0]);
      event.currentTarget.value = "";
    }} />
    {selection ? <>
      <span>{selection.file.name}</span>
      <button type="button" onClick={() => void send()} disabled={uploading}>{uploading ? "Uploading…" : "Send file"}</button>
      {!uploading && <button type="button" onClick={() => { setSelection(null); setError(""); }}>Remove file</button>}
    </> : <>
      <button type="button" className="creator-chat-media-icon" onClick={() => input.current?.click()} aria-label="Attach file (up to 500 MB)" title="Attach file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m20.4 11.6-8.1 8.1a5.2 5.2 0 0 1-7.4-7.4l9-9a3.4 3.4 0 1 1 4.8 4.8l-9.1 9.1a1.6 1.6 0 0 1-2.3-2.3l8.1-8.1" /></svg>
      </button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
