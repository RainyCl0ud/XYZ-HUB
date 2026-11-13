import { useEffect, useRef, useState, type CSSProperties } from "react";

// Existing voice files stay behind authenticated downloads. The player fetches
// them only when Play is pressed; recording previews use a local blob URL.
const clock = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
};

export default function ChatVoicePlayback({ src, durationMs = 0, preview = false }: {
  src: string; durationMs?: number; preview?: boolean;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef("");
  const [loading, setLoading] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, durationMs / 1000));
  const [rate, setRate] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const audio = player.current;
    return () => {
      request.current?.abort();
      audio?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function toggle() {
    const audio = player.current;
    if (!audio || request.current) return;
    setError("");
    if (!audio.paused) { audio.pause(); return; }
    if (!preview && !objectUrl.current) {
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const response = await fetch(src, {
          credentials: "include", cache: "no-store", redirect: "error",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/wav")) {
          throw new Error("Voice message unavailable");
        }
        const file = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl.current = URL.createObjectURL(file);
        audio.src = objectUrl.current;
        setAudioLoaded(true);
      } catch {
        if (!controller.signal.aborted) setError("Could not load the voice message. Try again.");
        return;
      } finally {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    try {
      audio.playbackRate = rate;
      await audio.play();
    } catch (err) {
      if (player.current !== audio) return;
      setError(err instanceof DOMException && err.name === "NotAllowedError"
        ? "Tap Play again to listen."
        : "Could not play the voice message. Try again.");
    }
  }

  const total = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const progress = total > 0 ? Math.min(100, Math.max(0, position / total * 100)) : 0;

  return <div className="creator-chat-voice-player" role="group" aria-label={preview ? "Recording preview player" : "Voice message player"}>
    <audio ref={player} preload={preview ? "metadata" : "none"} src={preview ? src : undefined}
      onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
      onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={event => {
        const audio = event.currentTarget;
        // A completed protected recording is discarded from browser memory.
        // Replay must recheck server access instead of using a stale cached URL.
        if (!preview && objectUrl.current) {
          audio.removeAttribute("src"); audio.load();
          URL.revokeObjectURL(objectUrl.current); objectUrl.current = "";
          setAudioLoaded(false);
        } else audio.currentTime = 0;
        setPosition(0); setPlaying(false);
      }} />
    <button className="creator-chat-voice-play" type="button" disabled={loading}
      onClick={() => void toggle()} aria-label={loading ? "Loading voice message" : playing ? "Pause voice message" : "Play voice message"}
      title={loading ? "Loading…" : playing ? "Pause" : "Play"}>
      {loading ? <span className="creator-chat-voice-loading" aria-hidden="true">…</span> : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {playing ? <path d="M7 5h4v14H7zM14 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
      </svg>}
    </button>
    <div className="creator-chat-voice-seek">
      <span className="creator-chat-voice-wave" aria-hidden="true" style={{ "--voice-progress": progress + "%" } as CSSProperties} />
      <input type="range" aria-label="Seek voice message" min={0} max={total || 1} step={0.1}
        value={Math.min(position, total || 1)} disabled={!total || (!preview && !audioLoaded)}
        onChange={event => {
          const next = Number(event.currentTarget.value);
          if (player.current && Number.isFinite(next)) { player.current.currentTime = next; setPosition(next); }
        }} />
    </div>
    <span className="creator-chat-voice-time" aria-label={"Playback " + clock(position) + " of " + clock(total)}>
      {clock(position)} / {clock(total)}
    </span>
    <button type="button" className="creator-chat-voice-rate" title="Playback speed"
      aria-label={"Playback speed " + rate + " times"} onClick={() => {
        const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
        setRate(next); if (player.current) player.current.playbackRate = next;
      }}>{rate}×</button>
    {error && <small className="creator-chat-voice-error" role="status">{error}</small>}
  </div>;
}
