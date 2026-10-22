import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "../lib/api";
import "./ChatPage.css";
import ChatChannelSettings from "./ChatChannelSettings";

type Channel = { id: string; name: string; canPost: boolean; canManage: boolean; archived: boolean; isPrivate: boolean };
type Area = { modelId: string; name: string; archived: boolean; canManage: boolean; channels: Channel[] };
type Message = { id: string; authorName: string; text: string; version: number; createdAt: string; updatedAt: string; canEdit: boolean };
type Transcript = { messages: Message[]; canPost: boolean; hasMore: boolean; nextBefore: string | null };
type Member = { id: string; name: string; canPost: boolean };
const time = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(new Date(value));
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to load chat. Please try again.";

export default function ChatPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [selected, setSelected] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<Message | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [settings, setSettings] = useState<{ modelId: string; channelId?: string; name: string } | null>(null);
  const selectedRef = useRef(selected);
  const requestRef = useRef<AbortController | null>(null);
  const pendingSend = useRef<{ channelId: string; text: string; nonce: string } | null>(null);
  const messagePane = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const earlierScroll = useRef<{ top: number; height: number } | null>(null);
  const area = areas.find((a) => a.channels.some((c) => c.id === selected));
  const channel = area?.channels.find((c) => c.id === selected);

  const chooseChannel = useCallback((id: string) => {
    selectedRef.current = id;
    setSelected(id); setTranscript(null); setMembers([]); setDraft(""); setEdit(null); setError("");
    setSettings(null);
    pendingSend.current = null;
    followMessages.current = true;
    earlierScroll.current = null;
  }, []);

  const refreshAreas = useCallback(async (signal?: AbortSignal) => {
    const response = await apiRequest<{ areas: Area[] }>("/api/chat/areas", { signal });
    setAreas(response.areas);
    const current = selectedRef.current;
    if (!response.areas.some((a) => a.channels.some((c) => c.id === current))) {
      chooseChannel(response.areas[0]?.channels[0]?.id ?? "");
    }
    setLoading(false);
  }, [chooseChannel]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void refreshAreas(controller.signal).catch((e: unknown) => {
        if (!controller.signal.aborted) { setError(errorText(e)); setLoading(false); }
      });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [refreshAreas]);

  useEffect(() => {
    selectedRef.current = selected;
    if (!selected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    requestRef.current = controller;
    const refresh = async () => {
      try {
        // A fresh authenticated request rechecks roles and assignments on every
        // refresh. Never keep an old transcript visible after access is denied.
        const [response, people] = await Promise.all([
          apiRequest<Transcript>(`/api/chat/channels/${selected}/messages`, { signal: controller.signal }),
          apiRequest<{ members: Member[] }>(`/api/chat/channels/${selected}/members`, { signal: controller.signal }),
        ]);
        if (stopped || selectedRef.current !== selected) return;
        setTranscript((previous) => {
          // Keep older loaded history when refreshing the latest page.
          if (!previous?.messages.length) return response;
          const latestIds = new Set(response.messages.map((m) => m.id));
          const oldest = response.messages[0];
          const older = oldest ? previous.messages.filter((m) => !latestIds.has(m.id) &&
            (m.createdAt < oldest.createdAt || (m.createdAt === oldest.createdAt && m.id < oldest.id))) : [];
          return { ...response, messages: [...older, ...response.messages],
            ...(older.length ? { hasMore: previous.hasMore, nextBefore: previous.nextBefore } : {}) };
        });
        setMembers(people.members);
        setError("");
        await refreshAreas(controller.signal);
      } catch (e) {
        if (stopped || selectedRef.current !== selected) return;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          setTranscript(null); setMembers([]); setAreas([]); setEdit(null); setDraft("");
          void refreshAreas(controller.signal).catch(() => {});
        }
        setError(errorText(e));
      } finally {
        if (!stopped) timer = setTimeout(() => { if (document.visibilityState === "visible") void refresh(); else timer = setTimeout(() => void refresh(), 5000); }, 5000);
      }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); requestRef.current = null; };
  }, [selected, refreshAreas]);

  useLayoutEffect(() => {
    const pane = messagePane.current;
    if (!pane || !transcript) return;
    if (earlierScroll.current) {
      pane.scrollTop = earlierScroll.current.top + pane.scrollHeight - earlierScroll.current.height;
      earlierScroll.current = null;
    } else if (followMessages.current) pane.scrollTop = pane.scrollHeight;
  }, [transcript]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending) return;
    const channelId = selected;
    const text = draft.trim();
    setSending(true); setError("");
    try {
      let response: { message: Message };
      if (edit) {
        response = await apiRequest(`/api/chat/channels/${channelId}/messages/${edit.id}`, {
          method: "PATCH", body: JSON.stringify({ text, version: edit.version }), signal: requestRef.current?.signal,
        });
      } else {
        if (pendingSend.current?.channelId !== channelId || pendingSend.current.text !== text) {
          pendingSend.current = { channelId, text, nonce: crypto.randomUUID() };
        }
        response = await apiRequest(`/api/chat/channels/${channelId}/messages`, {
          method: "POST", body: JSON.stringify({ text, clientNonce: pendingSend.current.nonce }), signal: requestRef.current?.signal,
        });
      }
      if (selectedRef.current !== channelId) return;
      followMessages.current = true;
      setTranscript((old) => old ? { ...old, messages: old.messages.some((m) => m.id === response.message.id)
        ? old.messages.map((m) => m.id === response.message.id ? response.message : m)
        : [...old.messages, response.message] } : old);
      setDraft(""); setEdit(null); pendingSend.current = null;
    } catch (e) {
      if (selectedRef.current === channelId) setError(errorText(e));
    } finally { setSending(false); }
  }
  async function loadOlder() {
    if (!transcript?.nextBefore) return;
    const channelId = selected;
    try {
      const older = await apiRequest<Transcript>(`/api/chat/channels/${channelId}/messages?before=${encodeURIComponent(transcript.nextBefore)}`, { signal: requestRef.current?.signal });
      if (selectedRef.current !== channelId) return;
      if (messagePane.current) earlierScroll.current = { top: messagePane.current.scrollTop, height: messagePane.current.scrollHeight };
      setTranscript((old) => old ? { ...old, hasMore: older.hasMore, nextBefore: older.nextBefore,
        messages: [...older.messages.filter((m) => !old.messages.some((p) => p.id === m.id)), ...old.messages] } : older);
    } catch (e) { if (selectedRef.current === channelId) setError(errorText(e)); }
  }
  return (
    <section className="creator-chat">
      <header className="creator-chat-heading"><div><p className="creator-chat-eyebrow">TEAM COMMUNICATION</p><h1>Chat</h1><p>Your team conversations in one place.</p></div></header>
      {error && <div className="creator-chat-error" role="alert">{error}</div>}
      {loading ? <p role="status">Loading your channels…</p> : !areas.length ? <div className="creator-chat-empty">No chat channels are available for your current access.</div> : (
        <div className="creator-chat-shell">
          <aside className={`creator-chat-channels ${showChannels ? "is-open" : ""}`} aria-label="Creator channels">
            <div className="creator-chat-channel-heading"><strong>Channels</strong><button type="button" className="creator-chat-mobile" onClick={() => setShowChannels(false)}>Close</button></div>
            {areas.map((a) => <div className="creator-chat-area" key={a.modelId}><h2>{a.name}{a.archived ? " · Archived" : ""}</h2>{a.canManage && <button type="button" className="creator-chat-add-channel" onClick={() => { setSettings({ modelId: a.modelId, name: "" }); setShowChannels(false); }}>+ Add channel</button>}{a.channels.map((c) => (
              <button type="button" key={c.id} aria-current={c.id === selected ? "page" : undefined} onClick={() => { chooseChannel(c.id); setShowChannels(false); }}><span aria-hidden="true">{c.isPrivate ? "◈" : "#"}</span>{c.name}{c.archived ? " · Archived" : ""}</button>
            ))}</div>)}
          </aside>
          <main className="creator-chat-conversation" aria-label="Conversation">
            <header className="creator-chat-channel-header"><button type="button" className="creator-chat-mobile" onClick={() => setShowChannels(true)}>Channels</button><div><p>{area?.name}{channel?.isPrivate ? " · Protected private chat" : ""}</p><h2>{channel?.isPrivate ? "◈" : "#"} {channel?.name}</h2></div><div className="creator-chat-header-actions">{channel?.canManage && area && <button type="button" onClick={() => setSettings({ modelId: area.modelId, channelId: channel.id, name: channel.name })}>Settings</button>}<button type="button" aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>Members ({members.length})</button></div></header>
            {showMembers && <aside className="creator-chat-members" aria-label="Channel members"><h3>Channel members</h3>{members.map((m) => <p key={m.id}>{m.name}<span>{m.canPost ? "Can post" : "Read only"}</span></p>)}</aside>}
            <div ref={messagePane} className="creator-chat-messages" role="log" aria-label="Messages" aria-live="polite" onScroll={() => { const pane = messagePane.current; if (pane) followMessages.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48; }}>
              {!transcript ? <p role="status">Loading messages…</p> : <>
                {transcript.hasMore && <button type="button" onClick={() => void loadOlder()}>Load earlier messages</button>}
                {!transcript.messages.length && <div className="creator-chat-empty"><h3>Start the conversation</h3><p>{channel?.isPrivate ? "This is the beginning of your private chat." : `This is the beginning of #${channel?.name}.`}</p></div>}
                {transcript.messages.map((m) => <article className="creator-chat-message" key={m.id}><div className="creator-chat-avatar" aria-hidden="true">{m.authorName.slice(0, 1).toUpperCase()}</div><div><header><strong>{m.authorName}</strong><time dateTime={m.createdAt}>{time(m.createdAt)}</time>{m.version > 1 && <small>Edited</small>}</header><p>{m.text}</p>{m.canEdit && <button type="button" className="creator-chat-edit" onClick={() => { setEdit(m); setDraft(m.text); }}>Edit</button>}</div></article>)}
              </>}
            </div>
            {transcript?.canPost ? <form className="creator-chat-composer" onSubmit={(e) => void submit(e)}>
              {edit && <div>Editing your message <button type="button" onClick={() => { setEdit(null); setDraft(""); }}>Cancel</button></div>}
              <label className="creator-chat-sr" htmlFor="chat-message">Message {channel?.isPrivate ? "" : "#"}{channel?.name}</label>
              <textarea id="chat-message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={8000} rows={3} placeholder={channel?.isPrivate ? "Write a private message" : `Message #${channel?.name ?? "channel"}`} disabled={sending} />
              <div><small>Times shown in US Central</small><button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : edit ? "Save changes" : "Send message"}</button></div>
            </form> : transcript && <div className="creator-chat-readonly">{channel?.archived ? "This conversation is archived and read-only." : "You have read-only access to this channel."}</div>}
          </main>
        </div>
      )}
      {settings && <ChatChannelSettings key={settings.channelId ?? settings.modelId} target={settings} onClose={() => setSettings(null)} onSaved={async (id) => { await refreshAreas(); if (id) chooseChannel(id); }} />}
    </section>
  );
}
