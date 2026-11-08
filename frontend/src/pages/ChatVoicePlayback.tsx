import { useEffect, useRef, useState } from "react";

export default function ChatVoicePlayback({ src }: { src: string }) {
  const player = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    request.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function reset(audio: HTMLAudioElement) {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setPlaying(false);
  }

  async function toggle() {
    const audio = player.current;
    if (!audio || request.current) return;
    setError("");
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!objectUrl.current) {
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const response = await fetch(src, {
          credentials: "include",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/wav")) {
          throw new Error("Voice message unavailable");
        }
        const file = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl.current = URL.createObjectURL(file);
        audio.src = objectUrl.current;
      } catch {
        if (!controller.signal.aborted) setError("Could not load the voice message. Try again.");
        return;
      } finally {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    try {
      await audio.play();
    } catch (err) {
      if (player.current !== audio) return;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Recording ready. Tap Play to listen.");
      } else {
        reset(audio);
        setError("Could not play the voice message. Try again.");
      }
    }
  }

  return <>
    <audio ref={player} preload="none" onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={event => reset(event.currentTarget)} />
    <button type="button" onClick={() => void toggle()} disabled={loading}>
      {loading ? "Loading…" : playing ? "Pause voice message" : "Play voice message"}
    </button>
    {error && <small role="status">{error}</small>}
  </>;
}
