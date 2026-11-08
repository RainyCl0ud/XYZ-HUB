import { useEffect, useRef, useState } from "react";
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

export default function ChatVoiceRecorder({ channelId, maxSeconds, onSent }: {
  channelId: string; maxSeconds: number; onSent: (message: ChatMessage) => void;
}) {
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
      setError("Voice recording is unavailable in this browser. Use Attach file to send a recording.");
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

  return <div className="creator-chat-file-picker creator-chat-voice">
    {phase === "idle" && !draft && <>
      <button type="button" onClick={() => void start()}>Record voice message</button>
      <small>Up to {maxSeconds / 60} min</small>
    </>}
    {phase === "permission" && <span role="status">Waiting for microphone access…</span>}
    {phase === "recording" && <>
      <span>Recording · {seconds}s / {maxSeconds}s</span>
      <button type="button" onClick={() => {
        const active = capture.current;
        if (!active?.recorder) return;
        window.clearTimeout(active.timeout);
        active.timeout = window.setTimeout(() => cancel("Could not finish the recording. Try again."), 3000);
        active.recorder.port.postMessage("stop");
        setPhase("stopping");
      }}>Stop recording</button>
    </>}
    {phase === "stopping" && <span role="status">Finishing recording…</span>}
    {phase !== "idle" && <button type="button" onClick={() => cancel()}>Discard</button>}
    {draft && <>
      <audio controls src={draft.url} preload="metadata" aria-label="Preview your voice message" />
      <button type="button" onClick={() => void send()} disabled={sending}>{sending ? "Sending…" : "Send voice message"}</button>
      <button type="button" onClick={() => { setDraft(null); setError(""); }} disabled={sending}>Discard recording</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
