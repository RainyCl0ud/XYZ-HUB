import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ChatMessage } from "./ChatMessageTools";
import { sendChatFile } from "./chatFiles";

export type ChatAttachmentPickerHandle = { open: () => void };

const ChatAttachmentPicker = forwardRef<ChatAttachmentPickerHandle, { channelId: string; maxBytes: number; onSent: (message: ChatMessage) => void }>(function ChatAttachmentPicker({ channelId, maxBytes, onSent }, ref) {

  const [selection, setSelection] = useState<{ file: File; nonce: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useImperativeHandle(ref, () => ({ open: () => { if (!uploading && !request.current) input.current?.click(); } }));

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

  return <div className="creator-chat-attachment-draft">
    <input ref={input} type="file" hidden aria-label="Choose a file to upload" onChange={event => {
      select(event.currentTarget.files?.[0]);
      event.currentTarget.value = "";
    }} />
    {selection && <div className="creator-chat-attachment-selection" role="status">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m20 11-8.4 8.4a5 5 0 0 1-7-7L14 3a3 3 0 0 1 4.2 4.2l-9.4 9.4a1 1 0 0 1-1.4-1.4l8-8" /></svg>
      <span title={selection.file.name}>{selection.file.name}</span>
      <button type="button" onClick={() => void send()} disabled={uploading} aria-label="Send selected file" title="Send file">
        {uploading ? "Uploading…" : "Send file"}
      </button>
      <button type="button" onClick={() => { setSelection(null); setError(""); }} disabled={uploading} aria-label="Remove selected file" title="Remove file">×</button>
    </div>}
    {error && <p className="creator-chat-attachment-error" role="alert">{error}</p>}
  </div>;
});
export default ChatAttachmentPicker;
