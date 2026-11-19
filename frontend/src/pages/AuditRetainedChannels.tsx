import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { formatCentralDateTime } from "../lib/time";
type Channel = { id: string; name: string; workspace: string; cleanedUpAt: string };
export default function AuditRetainedChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (before?: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setBusy(true); setError("");
    try {
      const result = await apiRequest<{ channels: Channel[]; nextBefore: string | null }>(`/api/chat/retained-channels${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setChannels(old => before ? [...new Map([...old, ...result.channels].map(c => [c.id, c])).values()] : result.channels); setNext(result.nextBefore);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load retained channels."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(initial); request.current?.abort(); };
  }, [load]);
  return <section className="content-card audit-retained-channels" aria-labelledby="audit-retained-title">
    <h3 id="audit-retained-title">Cleaned-up Chat channels</h3>
    <p>Owner access to retained messages, message edit history and files. These channels stay hidden from the Chat list and message search.</p>
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Try again</button></p>}
    {busy && <p role="status">Loading retained channels…</p>}
    {!busy && !error && !channels.length && <p>No channels have been cleaned up.</p>}
    {!!channels.length && <div className="audit-retained-scroll"><table><thead><tr><th scope="col">Channel</th><th scope="col">Workspace</th><th scope="col">Cleaned up</th><th scope="col">History</th></tr></thead>
      <tbody>{channels.map(c => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.workspace}</td><td>{formatCentralDateTime(c.cleanedUpAt)}</td><td><Link to={`/chat?retained=${encodeURIComponent(c.id)}`}>Open retained history</Link></td></tr>)}</tbody></table></div>}
    {next && <button type="button" disabled={busy} onClick={() => void load(next)}>Load more channels</button>}
  </section>;
}
