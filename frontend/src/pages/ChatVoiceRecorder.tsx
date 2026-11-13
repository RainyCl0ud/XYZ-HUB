import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ChatVoicePlayback from "./ChatVoicePlayback";
import { sendChatFile } from "./chatFiles";
import type { ChatMessage } from "./ChatMessageTools";
import { chatVoiceFile } from "./chatVoiceWav";

type Capture = {
  context: AudioContext;
  stream?: MediaStream;
  recorder?: AudioWorkletNode;
  timeout?: number;
};
type Draft = { file: File; nonce: string; url: string };

function releaseCapture(capture: Capture) {
  window.clearTimeout(capture.timeout);
  capture.recorder?.port.close();
  capture.recorder?.disconnect();
  capture.stream?.getTracks().forEach(track => track.stop());
  void capture.context.close().catch(() => {});
}

export type ChatVoiceRecorderHandle = { start: () => void };
const ChatVoiceRecorder = forwardRef<ChatVoiceRecorderHandle, {
  channelId: string; maxSeconds: number; onSent: (message: ChatMessage) => void;
}>(function ChatVoiceRecorder({ channelId, maxSeconds, onSent }, ref) {
  const capture = useRef<Capture | null>(null);
  const upload = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<"idle" | "permission" | "recording" | "stopping">("idle");
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (capture.current) releaseCapture(capture.current);
    capture.current = null;
    upload.current?.abort();
  }, []);

  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.url);
  }, [draft]);

  function cancel(message = "") {
    const active = capture.current;
    capture.current = null;
    if (active) releaseCapture(active);
    setError(message);
    setPhase("idle");
  }

  async function start() {
    if (capture.current || draft) return;
    setError("");
    setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      setError("Voice recording is unavailable in this browser. Use the paperclip button to send a recording.");
      return;
    }

    let active: Capture | undefined;
    try {
      const context = new AudioContext();
      active = { context };
      const recording = active;
      capture.current = recording;
      setPhase("permission");
      // Request playback permission while the button tap is still active.
      const resumed = context.resume().then(() => true, () => false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (capture.current !== recording) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      recording.stream = stream;
      recording.timeout = window.setTimeout(() => cancel("Could not start recording. Try again."), 10_000);
      const interrupted = () => {
        if (capture.current === recording) cancel("The microphone disconnected. Record again.");
      };
      for (const track of stream.getAudioTracks()) track.addEventListener("ended", interrupted, { once: true });
      const sampleRate = context.sampleRate;
      if (!context.audioWorklet || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96_000) {
        cancel("This microphone cannot record a supported voice message.");
        return;
      }
      await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}chat-voice-recorder-v1.js`);
      if (!await resumed) throw new Error("Audio context unavailable");
      if (capture.current !== recording) return;
      if (stream.getAudioTracks().every(track => track.readyState !== "live")) {
        interrupted();
        return;
      }
      const recorder = new AudioWorkletNode(context, "chat-voice-recorder", {
        channelCount: 1, channelCountMode: "explicit",
        processorOptions: { maxFrames: sampleRate * maxSeconds },
      });
      recording.recorder = recorder;
      let frames = 0;
      const chunks: Int16Array[] = [];
      recorder.port.onmessage = ({ data }: MessageEvent<{ samples?: Int16Array; done?: boolean }>) => {
        if (capture.current !== recording) return;
        if (data.samples) {
          frames += data.samples.length;
          chunks.push(data.samples);
          setSeconds(Math.floor(frames / sampleRate));
        }
        if (data.done) {
          cancel();
          if (!frames) {
            setError("Nothing was recorded. Try again.");
            return;
          }
          const file = chatVoiceFile(sampleRate, frames, chunks);
          setDraft({ file, nonce: crypto.randomUUID(), url: URL.createObjectURL(file) });
        }
      };
      recorder.onprocessorerror = interrupted;
      context.createMediaStreamSource(stream).connect(recorder);
      recorder.connect(context.destination);
      window.clearTimeout(recording.timeout);
      recording.timeout = window.setTimeout(() => {
        if (capture.current === recording) cancel("Recording was interrupted. Try again.");
      }, (maxSeconds + 5) * 1000);
      setPhase("recording");
    } catch (err) {
      if (capture.current !== (active ?? null)) return;
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      cancel(denied ? "Allow microphone access in your browser to record." : "Could not start the microphone. Check that it is available and try again.");
    }
  }

  async function send() {
    if (!draft || upload.current) return;
    const controller = new AbortController();
    upload.current = controller;
    setSending(true);
    setError("");
    try {
      const { message } = await sendChatFile(channelId, draft.file, draft.nonce, controller.signal, true);
      if (controller.signal.aborted) return;
      setDraft(null);
      onSent(message);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not send this recording. Try again.");
    } finally {
      upload.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }

  // Keep this component mounted while idle so the + menu can request
  // microphone permission directly inside the originating click gesture.
  useImperativeHandle(ref, () => ({
    start: () => { if (phase === "idle" && !draft && !sending) void start(); },
  }));

  if (phase === "idle" && !draft && !error) return <div className="creator-chat-voice-hidden" aria-hidden="true" />;

  const trash = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5" /></svg>;
  const finish = () => {
    const active = capture.current;
    if (!active?.recorder) return;
    window.clearTimeout(active.timeout);
    active.timeout = window.setTimeout(() => cancel("Could not finish the recording. Try again."), 3000);
    active.recorder.port.postMessage("stop");
    setPhase("stopping");
  };

  return <div className="creator-chat-voice-draft" aria-label="Voice recording controls">
    {phase === "permission" && <span className="creator-chat-voice-hint" role="status">Waiting for microphone permission…</span>}
    {phase === "recording" && <div className="creator-chat-voice-capture" role="status">
      <span className="creator-chat-recording-dot" aria-hidden="true" />
      <strong>Recording</strong>
      <span className="creator-chat-voice-counter">{seconds}s / {maxSeconds}s</span>
      <button className="creator-chat-voice-small-action" type="button" onClick={finish}
        aria-label="Stop recording" title="Stop recording">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      </button>
    </div>}
    {phase === "stopping" && <span role="status" className="creator-chat-voice-hint">Preparing voice message…</span>}
    {phase !== "idle" && <button type="button" className="creator-chat-voice-small-action creator-chat-voice-discard"
      onClick={() => cancel()} aria-label="Discard recording" title="Discard recording">{trash}</button>}
    {draft && <div className="creator-chat-voice-review">
      <ChatVoicePlayback src={draft.url} durationMs={seconds * 1000} preview />
      <div className="creator-chat-voice-review-actions">
        <button type="button" className="creator-chat-voice-small-action creator-chat-voice-discard"
          onClick={() => { setDraft(null); setError(""); }} disabled={sending}
          aria-label="Discard recording" title="Discard recording">{trash}</button>
        <button type="button" className="creator-chat-voice-small-action creator-chat-voice-send"
          onClick={() => void send()} disabled={sending} aria-label="Send voice message" title="Send voice message">
          {sending ? <span role="status">…</span> :
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></svg>}
        </button>
      </div>
    </div>}
    {error && <div className="creator-chat-voice-error-line"><span role="alert">{error}</span>
      <button type="button" className="creator-chat-voice-small-action" title="Dismiss recording error" aria-label="Dismiss recording error" onClick={() => setError("")}>×</button>
    </div>}
  </div>;
});
export default ChatVoiceRecorder;
