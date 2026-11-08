import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import ChatAnnouncements from "./ChatAnnouncements";
import ChatUnreadReminders from "./ChatUnreadReminders";
import ChatBrowserNotifications from './ChatBrowserNotifications';
import { useBrowserNotifications } from '../components/BrowserNotificationsContext';
import { setAlertReadingContext } from '../lib/browser-alerts';
import "./ChatPage.css";
import ChatChannelSettings from "./ChatChannelSettings";
import ChatMessageTools, { ChatMessageContent, type ChatMessage as Message, type ChatToolTarget } from "./ChatMessageTools";
import ChatAttachmentPicker from "./ChatAttachmentPicker";
import ChatVoiceRecorder from "./ChatVoiceRecorder";
import ChatModerationDialog, { type ModerationTarget } from "./ChatModerationDialog";
import ChatQuarantineDialog, { type QuarantineControl } from "./ChatQuarantineDialog";
import { useChatReadTracking } from "./useChatReadTracking";

const noUnreadIds: string[] = [];
type Channel = { id: string; name: string; canPost: boolean; canManage: boolean; canArchive?: boolean; archived: boolean; isPrivate: boolean; unreadCount?: number };
type Area = { modelId: string; name: string; archived: boolean; canManage: boolean; pausedForYou?: boolean; channels: Channel[]; unreadCount?: number };
type Transcript = { messages: Message[]; unreadMessageIds?: string[]; quarantine?: QuarantineControl | null; canPost: boolean; canPin?: boolean; canViewDeleted?: boolean; hasMore: boolean; nextBefore: string | null };
type Member = { id: string; name: string; canView?: boolean; canPost: boolean; quarantine?: QuarantineControl | null };
type ChatLocation = { modelId: string; channelId: string };
const locationKey = (userId: string) => `xyz_chat_location_v1:${userId}`;
function savedLocation(userId: string): ChatLocation | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(locationKey(userId)) ?? "null");
    if (value && typeof value === "object" && "modelId" in value && "channelId" in value &&
      typeof value.modelId === "string" && typeof value.channelId === "string") return value as ChatLocation;
  } catch { /* Storage can be unavailable; Chat still works without remembering. */ }
  return null;
}
function rememberLocation(userId: string, location: ChatLocation | null) {
  try {
    if (location) sessionStorage.setItem(locationKey(userId), JSON.stringify(location));
    else sessionStorage.removeItem(locationKey(userId));
  } catch { /* Remembering navigation must never prevent opening Chat. */ }
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to load chat. Please try again.";
const day = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric",
}).format(new Date(value));
type IconName = "channel" | "lock" | "search" | "people" | "send" | "menu" | "close" | "settings" | "chat";
function ChatIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    channel: "M5 9h14M4 15h14M11 3 7 21M17 3l-4 18",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3",
    search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    send: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13",
    menu: "M4 6h16M4 12h16M4 18h16",
    close: "m6 6 12 12M6 18 18 6",
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
    chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 1 1 19 0ZM7 9h9M7 13h6",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function ChatPage() {
  const { user } = useAuth();
  // A different signed-in account starts with its own state and pending requests.
  return user ? <ChatWorkspace key={user.id} userId={user.id} /> : null;
}

function ChatWorkspace({ userId }: { userId: string }) {
  const browserNotifications = useBrowserNotifications();
  const [showBrowserNotifications, setShowBrowserNotifications] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedConversation = searchParams.get('conversation') ?? '';
  const [canAnnounce, setCanAnnounce] = useState(false), [showAnnouncements, setShowAnnouncements] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false), [showReminders, setShowReminders] = useState(false);
  const [attachmentMaxBytes, setAttachmentMaxBytes] = useState(0);
  const [voiceMaxSeconds, setVoiceMaxSeconds] = useState(0);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selected, setSelected] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<Message | null>(null);
  const [reply, setReply] = useState<Message | null>(null);
  const [tools, setTools] = useState<ChatToolTarget | null>(null);
  const [deleting, setDeleting] = useState<ModerationTarget | null>(null);
  const [quarantining, setQuarantining] = useState<QuarantineControl | null>(null);
  const [notice, setNotice] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [toolsRevision, setToolsRevision] = useState(0);
  const [toolsNotice, setToolsNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [channelSearch, setChannelSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "channels" | "private">("all");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [readError, setReadError] = useState("");
  const [settings, setSettings] = useState<{ modelId: string; channelId?: string; name: string } | null>(null);
  const selectedRef = useRef(selected);
  const availableAreas = useRef<Area[]>([]);
  const areasRequest = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const pendingSend = useRef<{ channelId: string; text: string; replyToId?: string; nonce: string } | null>(null);
  const transcriptRef = useRef(transcript);
  const messageRevision = useRef(0);
  const draftTargets = useRef({ edit, reply });
  const composeState = useRef({ draft, edit, reply });
  const conversationDrafts = useRef(new Map<string, { text: string; reply: Message | null }>());
  const beforeEdit = useRef<{ text: string; reply: Message | null }>({ text: "", reply: null });
  useLayoutEffect(() => { composeState.current = { draft, edit, reply }; }, [draft, edit, reply]);
  useLayoutEffect(() => { draftTargets.current = { edit, reply }; }, [edit, reply]);
  useLayoutEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  const messagePane = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const earlierScroll = useRef<{ top: number; height: number } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const replyId = reply?.id;
  useEffect(() => { if (replyId) composer.current?.focus(); }, [replyId]);
  const area = areas.find((a) => a.channels.some((c) => c.id === selected));
  const channel = area?.channels.find((c) => c.id === selected);
  const latestEdit = edit && transcript?.messages.find((m) => m.id === edit.id);
  const editConflict = !!(edit && latestEdit && latestEdit.version !== edit.version);
  const unchangedEdit = !!edit && draft.trim() === edit.text;
  const browseArea = area ?? areas[0];
  const query = channelSearch.trim().toLocaleLowerCase();
  const visibleChannels = browseArea?.channels.filter((c) => c.name.toLocaleLowerCase().includes(query) &&
    (!unreadOnly || (c.unreadCount ?? 0) > 0) && (channelFilter === "all" || (channelFilter === "private" ? c.isPrivate : !c.isPrivate))) ?? [];
  const ordinaryChannels = visibleChannels.filter((c) => !c.archived && !c.isPrivate);
  const privateChannels = visibleChannels.filter((c) => !c.archived && c.isPrivate);
  const archivedChannels = visibleChannels.filter((c) => c.archived);

  const chooseChannel = useCallback((id: string, preserveCurrent = true) => {
    const place = availableAreas.current.find((a) => a.channels.some((c) => c.id === id));
    if (place) rememberLocation(userId, { modelId: place.modelId, channelId: id });
    else if (!id) rememberLocation(userId, null);
    if (id === selectedRef.current) return;
    setReadError("");
    const old = composeState.current;
    if (selectedRef.current && preserveCurrent) conversationDrafts.current.set(selectedRef.current, old.edit ? beforeEdit.current : { text: old.draft, reply: old.reply });
    const saved = conversationDrafts.current.get(id);
    selectedRef.current = id;
    setSelected(id); setTranscript(null); setMembers([]); setDraft(saved?.text ?? ""); setEdit(null); setError("");
    setSettings(null);
    setQuarantining(null);
    setReply(saved?.reply ?? null); setTools(null); setDeleting(null); setNotice(saved?.text ? "Your unsent draft was kept for this conversation." : "");
    setShowMembers(false);
    pendingSend.current = null;
    followMessages.current = true;
    earlierScroll.current = null;
  }, [userId]);

  const refreshAreas = useCallback(async (signal?: AbortSignal) => {
    const request = ++areasRequest.current;
    const response = await apiRequest<{ areas: Area[]; announcements?: { canAnnounce: boolean }; unreadReminders?: { enabled: boolean }; attachments?: { maxBytes: number; voiceMaxSeconds?: number } }>("/api/chat/areas", { signal });
    if (signal?.aborted || request !== areasRequest.current) return;
    availableAreas.current = response.areas;
    setAreas(response.areas);
    setCanAnnounce(!!response.announcements?.canAnnounce);
    setRemindersEnabled(!!response.unreadReminders?.enabled);
    setAttachmentMaxBytes(response.attachments?.maxBytes ?? 0);
    setVoiceMaxSeconds(response.attachments?.voiceMaxSeconds ?? 0);
    const current = selectedRef.current;
    const permitted = new Set(response.areas.flatMap((a) => a.channels.map((c) => c.id)));
    for (const id of conversationDrafts.current.keys()) if (!permitted.has(id)) conversationDrafts.current.delete(id);
    if (linkedConversation || !response.areas.some((a) => a.channels.some((c) => c.id === current))) {
      // Saved IDs are only navigation hints. Restore from the current server
      // list, never fetch a remembered private chat before checking access.
      const saved = savedLocation(userId);
      const savedArea = response.areas.find((a) => a.modelId === saved?.modelId);
      const restored = savedArea?.channels.find((c) => c.id === saved?.channelId);
      const linked = response.areas.flatMap(a => a.channels).find(c => c.id === linkedConversation);
      const allChannels = response.areas.flatMap((a) => a.channels);
      chooseChannel(linked?.id ?? restored?.id ?? savedArea?.channels.find(c => !c.archived)?.id
        ?? allChannels.find(c => !c.archived)?.id ?? savedArea?.channels[0]?.id ?? allChannels[0]?.id ?? "", false);
      if (linkedConversation) setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete('conversation'); return next; }, { replace: true });
    }
    setLoading(false);
  }, [chooseChannel, userId, linkedConversation, setSearchParams]);

  const readsSaved = useCallback((ids: string[]) => {
    setReadError("");
    const read = new Set(ids);
    setTranscript((old) => old ? { ...old, unreadMessageIds: old.unreadMessageIds?.filter((id) => !read.has(id)) } : old);
    void refreshAreas().catch(() => {});
  }, [refreshAreas]);
  const readFailed = useCallback(() => setReadError("Read status wasn’t saved. It will retry when messages refresh."), []);
  const notificationsPaused = !!(loading || error || tools || deleting || quarantining || settings || showMembers || showChannels || showAnnouncements || showReminders || showBrowserNotifications || markingRead);
  useEffect(() => {
    setAlertReadingContext({ userId, conversationId: selected, paused: notificationsPaused });
    return () => setAlertReadingContext({ userId: '', conversationId: '', paused: true });
  }, [userId, selected, notificationsPaused]);
  useChatReadTracking(messagePane, selected, transcript?.unreadMessageIds ?? noUnreadIds,
    notificationsPaused, readsSaved, readFailed);

  async function markConversationRead() {
    const channelId = selected, anchor = transcript?.messages.filter((m) => !m.deleted).at(-1)?.id;
    if (!anchor || markingRead) return;
    setMarkingRead(true); setReadError("");
    try {
      await apiRequest(`/api/chat/channels/${channelId}/read`, { method: "PUT", body: JSON.stringify({ throughMessageId: anchor }), signal: requestRef.current?.signal });
      if (selectedRef.current !== channelId) return;
      setNotice("Conversation marked read up to the latest loaded message."); setRefreshTick((v) => v + 1);
      await refreshAreas();
    } catch (e) { if (selectedRef.current === channelId) setReadError(errorText(e)); }
    finally { setMarkingRead(false); }
  }

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
      const revision = messageRevision.current;
      try {
        // A fresh authenticated request rechecks roles and assignments on every
        // refresh. Never keep an old transcript visible after access is denied.
        const [response, people] = await Promise.all([
          apiRequest<Transcript>(`/api/chat/channels/${selected}/messages`, { signal: controller.signal }),
          apiRequest<{ members: Member[] }>(`/api/chat/channels/${selected}/members`, { signal: controller.signal }),
        ]);
        const latest = new Map(response.messages.map((m) => [m.id, m]));
        const olderIds = typeof response.canPin === "boolean" ? [...new Set([
          ...(transcriptRef.current?.messages.map((m) => m.id) ?? []),
          ...[draftTargets.current.edit?.id, draftTargets.current.reply?.id].filter((id): id is string => !!id),
        ])].filter((id) => !latest.has(id)) : [];
        const refreshed = new Map<string, Message>();
        for (let i = 0; i < olderIds.length; i += 100) {
          const params = new URLSearchParams({ ids: olderIds.slice(i, i + 100).join(",") });
          const history = await apiRequest<{ messages: Message[] }>(`/api/chat/channels/${selected}/messages/refresh?${params}`, { signal: controller.signal });
          history.messages.forEach((m) => refreshed.set(m.id, m));
        }
        if (stopped || selectedRef.current !== selected) return;
        setTranscript((previous) => {
          if (revision !== messageRevision.current) return previous;
          // Keep older loaded history when refreshing the latest page.
          if (!previous?.messages.length) return response;
          const latestIds = new Set(response.messages.map((m) => m.id));
          const oldest = response.messages[0];
          const older = oldest ? previous.messages.filter((m) => !latestIds.has(m.id) &&
            (m.createdAt < oldest.createdAt || (m.createdAt === oldest.createdAt && m.id < oldest.id))) : [];
          const requested = new Set(olderIds);
          const kept = older.filter((m) => !requested.has(m.id) || refreshed.has(m.id)).map((m) => refreshed.get(m.id) ?? m);
          return { ...response, messages: [...kept, ...response.messages], unreadMessageIds: [...(previous.unreadMessageIds ?? []).filter((id) => kept.some((m) => m.id === id)), ...(response.unreadMessageIds ?? [])],
            ...(kept.length ? { hasMore: previous.hasMore, nextBefore: previous.hasMore ? kept[0].id : null } : {}) };
        });
        setMembers(people.members);
        const currentEdit = draftTargets.current.edit, currentReply = draftTargets.current.reply;
        if (revision === messageRevision.current) {
          const edited = currentEdit && (latest.get(currentEdit.id) ?? refreshed.get(currentEdit.id));
          const parent = currentReply && (latest.get(currentReply.id) ?? refreshed.get(currentReply.id));
          if (currentEdit && !edited?.canEdit) { setReply(beforeEdit.current.reply); setEdit(null); setDraft(beforeEdit.current.text); setNotice("That message can no longer be edited. Your unsent draft has been restored."); }
          else if (currentReply && (!parent || parent.deleted)) { setReply(null); setNotice("The original message is no longer available. Your draft is kept as a normal message."); }
          else if (parent) setReply(parent);
        }
        if (!response.canPost) { setReply(null); setEdit(null); setDraft(""); }
        setError("");
        await refreshAreas(controller.signal);
      } catch (e) {
        if (stopped || selectedRef.current !== selected) return;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          conversationDrafts.current.delete(selected);
          setTranscript(null); setMembers([]); setAreas([]); setEdit(null); setDraft(""); setReply(null); setTools(null); setDeleting(null); setQuarantining(null); setSettings(null);
          void refreshAreas(controller.signal).catch(() => {});
        }
        setError(errorText(e));
      } finally {
        if (!stopped) timer = setTimeout(() => { if (document.visibilityState === "visible") void refresh(); else timer = setTimeout(() => void refresh(), 5000); }, 5000);
      }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); requestRef.current = null; };
  }, [selected, refreshAreas, refreshTick]);

  useLayoutEffect(() => {
    const pane = messagePane.current;
    if (!pane || !transcript) return;
    if (earlierScroll.current) {
      pane.scrollTop = earlierScroll.current.top + pane.scrollHeight - earlierScroll.current.height;
      earlierScroll.current = null;
    } else if (followMessages.current) pane.scrollTop = pane.scrollHeight;
  }, [transcript]);

  function followLoadedPreview() {
    const pane = messagePane.current;
    if (pane && followMessages.current) pane.scrollTop = pane.scrollHeight;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending || editConflict || unchangedEdit) return;
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
        if (pendingSend.current?.channelId !== channelId || pendingSend.current.text !== text || pendingSend.current.replyToId !== reply?.id) {
          pendingSend.current = { channelId, text, replyToId: reply?.id, nonce: crypto.randomUUID() };
        }
        response = await apiRequest(`/api/chat/channels/${channelId}/messages`, {
          method: "POST", body: JSON.stringify({ text, clientNonce: pendingSend.current.nonce, replyToId: pendingSend.current.replyToId }), signal: requestRef.current?.signal,
        });
      }
      if (selectedRef.current !== channelId) return;
      showSentMessage(channelId, response.message);
      setDraft(edit ? beforeEdit.current.text : ""); setReply(edit ? beforeEdit.current.reply : null); setEdit(null); pendingSend.current = null;
      if (!edit) conversationDrafts.current.delete(channelId);
    } catch (e) {
      if (selectedRef.current === channelId) setError(errorText(e));
      if (e instanceof ApiError && e.status === 409) setRefreshTick((v) => v + 1);
    } finally { setSending(false); }
  }
  function showSentMessage(channelId: string, message: Message) {
    if (selectedRef.current !== channelId) return;
    messageRevision.current++;
    followMessages.current = true;
    setTranscript((old) => old ? { ...old, messages: old.messages.some((m) => m.id === message.id)
      ? old.messages.map((m) => m.id === message.id ? message : m)
      : [...old.messages, message] } : old);
  }
  async function loadOlder() {
    if (!transcript?.nextBefore || loadingOlder) return;
    const channelId = selected;
    setLoadingOlder(true);
    try {
      const older = await apiRequest<Transcript>(`/api/chat/channels/${channelId}/messages?before=${encodeURIComponent(transcript.nextBefore)}`, { signal: requestRef.current?.signal });
      if (selectedRef.current !== channelId) return;
      if (messagePane.current) earlierScroll.current = { top: messagePane.current.scrollTop, height: messagePane.current.scrollHeight };
      setTranscript((old) => old ? { ...old, hasMore: older.hasMore, nextBefore: older.nextBefore, unreadMessageIds: [...new Set([...(old.unreadMessageIds ?? []), ...(older.unreadMessageIds ?? [])])],
        messages: [...older.messages.filter((m) => !old.messages.some((p) => p.id === m.id)), ...old.messages] } : older);
    } catch (e) { if (selectedRef.current === channelId) setError(errorText(e)); }
    finally { setLoadingOlder(false); }
  }
  function changedMessage(channelId: string, message: Message) {
    if (selectedRef.current !== channelId) return;
    messageRevision.current++;
    setTranscript((old) => old ? { ...old, messages: old.messages.map((m) => m.id === message.id ? message :
      m.replyTo?.id === message.id ? { ...m, replyTo: { id: message.id, authorName: message.authorName, text: message.text, version: message.version, createdAt: message.createdAt, deleted: !!message.deleted } } : m) } : old);
    setReply((old) => old?.id === message.id ? message : old);
  }
  function startReply(channelId: string, message: Message) {
    if (selectedRef.current !== channelId) chooseChannel(channelId);
    else if (edit) setDraft(beforeEdit.current.text);
    setEdit(null); setReply(message); setTools(null); setShowChannels(false); composer.current?.focus();
  }
  function startEdit(message: Message) {
    if (!edit) beforeEdit.current = { text: draft, reply };
    setReply(null); setEdit(message); setDraft(message.text); composer.current?.focus();
  }
  function cancelEdit() {
    setEdit(null); setDraft(beforeEdit.current.text); setReply(beforeEdit.current.reply); composer.current?.focus();
  }
  function messageError(e: unknown) {
    setError(errorText(e));
    // A missing message is not evidence that the whole conversation was lost.
    // Recheck the transcript before clearing the user's unrelated draft.
    setRefreshTick((v) => v + 1);
  }
  function startModeration(channelId: string, message: Message) {
    const place = areas.find((a) => a.channels.some((c) => c.id === channelId));
    const name = place?.channels.find((c) => c.id === channelId)?.name ?? "Conversation";
    setDeleting({ channelId, conversationName: `${place?.name ?? "Workspace"} / ${name}`, message }); setNotice(""); setToolsNotice("");
  }
  function messageDeleted(channelId: string, id: string, retained: Message | null) {
    setDeleting(null); setToolsRevision((v) => v + 1); setNotice("Message deleted. Owners keep its full content and history."); setToolsNotice("Message deleted. Owners keep its full content and history.");
    if (selectedRef.current !== channelId) return;
    messageRevision.current++;
    setTranscript((old) => old ? { ...old, messages: old.messages.flatMap((m) => m.id === id ? retained ? [retained] : [] : [
      m.replyTo?.id === id ? { ...m, replyTo: retained ? { id, authorName: retained.authorName, text: retained.text, version: retained.version, createdAt: retained.createdAt, deleted: true } : null, replyUnavailable: !retained } : m,
    ]) } : old);
    if (draftTargets.current.edit?.id === id) cancelEdit();
    if (draftTargets.current.reply?.id === id) setReply(null);
  }
  function channelRow(c: Channel) {
    return <button type="button" key={c.id} disabled={sending} className="creator-chat-channel-row" aria-current={c.id === selected ? "page" : undefined}
      onClick={() => { chooseChannel(c.id); setShowChannels(false); }}>
      <ChatIcon name={c.isPrivate ? "lock" : "channel"} />
      <span className="creator-chat-channel-name">{c.name}</span>
      {!!c.unreadCount && <span className="creator-chat-unread-count" aria-label={`${c.unreadCount} unread messages`}>{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
      {c.archived && <span className="creator-chat-row-badge">Archived</span>}
    </button>;
  }
  return (
    <section className="creator-chat" aria-labelledby="chat-page-title">
      <header className="creator-chat-heading"><div><p className="creator-chat-eyebrow">TEAM COMMUNICATION</p><h1 id="chat-page-title">Chat</h1><p>Find your creator, choose a conversation and stay connected.</p></div><div className="creator-chat-heading-tools"><span className="creator-chat-timezone">All times in US Central</span>{canAnnounce && <button type="button" onClick={() => setShowAnnouncements(true)}>Staff announcements</button>}{remindersEnabled && <button type="button" onClick={() => setShowReminders(true)}>Email reminders</button>}{browserNotifications?.available && <button type="button" onClick={() => setShowBrowserNotifications(true)}>Browser notifications</button>}</div></header>
      {error && <div className="creator-chat-error" role="alert">{error}</div>}
      {notice && <div className="creator-chat-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss update" onClick={() => setNotice("")}>Dismiss</button></div>}
      {showAnnouncements && <ChatAnnouncements onClose={() => setShowAnnouncements(false)} onPublished={() => { setRefreshTick(n => n+1); void refreshAreas().catch(() => {}); }} />}
      {showReminders && <ChatUnreadReminders onClose={() => setShowReminders(false)} />}
      {showBrowserNotifications && <ChatBrowserNotifications onClose={() => setShowBrowserNotifications(false)} />}
      {loading ? <div className="creator-chat-empty" role="status">Loading your conversations…</div> : !areas.length ? <div className="creator-chat-empty"><ChatIcon name="chat" /><h2>No conversations available yet</h2><p>Your conversations will appear here when you have access. Contact an Owner if you need help.</p></div> : (
        <div className={`creator-chat-shell ${showChannels ? "is-browsing" : ""}`}>
          <aside className="creator-chat-channels" aria-label="Browse conversations">
            <div className="creator-chat-browse-tools">
              <div className="creator-chat-channel-heading"><strong>Conversations</strong><button type="button" className="creator-chat-mobile" onClick={() => setShowChannels(false)} aria-label="Back to conversation"><ChatIcon name="close" /></button></div>
              <label className="creator-chat-field-label" htmlFor="chat-workspace">Creator / workspace</label>
              <select id="chat-workspace" disabled={sending} value={browseArea?.modelId ?? ""} onChange={(e) => {
                const next = areas.find((a) => a.modelId === e.target.value);
                setChannelSearch(""); setChannelFilter("all"); chooseChannel(next?.channels.find(c => !c.archived)?.id ?? next?.channels[0]?.id ?? "");
              }}>{areas.map((a) => <option key={a.modelId} value={a.modelId}>{a.name}{a.archived ? " · Archived" : a.unreadCount ? ` · ${a.unreadCount} unread` : ""}</option>)}</select>
              <div className="creator-chat-search"><ChatIcon name="search" /><label className="creator-chat-sr" htmlFor="chat-find-channel">Find a conversation</label><input id="chat-find-channel" type="search" value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)} placeholder="Find a conversation…" /></div>
              <div className="creator-chat-filters" role="group" aria-label="Conversation type">
                {([['all', 'All'], ['channels', 'Channels'], ['private', 'Private']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={channelFilter === value} onClick={() => setChannelFilter(value)}>{label}</button>)}
              </div>
              <button type="button" className="creator-chat-unread-filter" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(!unreadOnly)}>Unread only{browseArea?.unreadCount ? ` · ${browseArea.unreadCount}` : ""}</button>
              {(channelSearch || channelFilter !== "all") && <p className="creator-chat-filter-help">Filters change this list, not your open conversation.</p>}
            </div>
            <nav className="creator-chat-channel-list" aria-label={`${browseArea?.name ?? "Your"} conversations`}>
              {!!ordinaryChannels.length && <div className="creator-chat-channel-group"><h2>Channels <span>{ordinaryChannels.length}</span></h2>{ordinaryChannels.map(channelRow)}</div>}
              {!!privateChannels.length && <div className="creator-chat-channel-group"><h2>Private chats <span>{privateChannels.length}</span></h2>{privateChannels.map(channelRow)}</div>}
              {!!archivedChannels.length && <div className="creator-chat-channel-group"><h2>Archived conversations <span>{archivedChannels.length}</span></h2>{archivedChannels.map(channelRow)}</div>}
              {!visibleChannels.length && <div className="creator-chat-no-results"><p>{unreadOnly ? "No unread conversations match." : "No conversations match."}</p><button type="button" onClick={() => { setChannelSearch(""); setChannelFilter("all"); setUnreadOnly(false); }}>Clear filters</button></div>}
            </nav>
            <div className="creator-chat-browse-footer">{browseArea?.canManage ? <button type="button" onClick={() => { setSettings({ modelId: browseArea.modelId, name: "" }); setShowChannels(false); }}>+ New channel</button> : <p>Only conversations you can access appear here.</p>}</div>
          </aside>
          <div className="creator-chat-conversation" role="region" aria-label="Conversation">
            <header className="creator-chat-channel-header">
              <button type="button" className="creator-chat-mobile creator-chat-browse-button" onClick={() => setShowChannels(true)} aria-label="Browse conversations"><ChatIcon name="menu" /><span>Browse</span></button>
              <div className={`creator-chat-title-icon ${channel?.isPrivate ? "is-private" : ""}`}><ChatIcon name={channel?.isPrivate ? "lock" : "channel"} /></div>
              <div className="creator-chat-channel-title"><p>{area?.name}<span> · {channel?.isPrivate ? "Private chat" : "Channel"}{channel?.archived ? " · Archived" : ""}</span></p><h2>{channel?.name ?? "Choose a conversation"}</h2></div>
              <div className="creator-chat-header-actions">{channel?.canManage && area && <button type="button" onClick={() => setSettings({ modelId: area.modelId, channelId: channel.id, name: channel.name })}><ChatIcon name="settings" /><span>Settings</span></button>}<button type="button" aria-expanded={showMembers} aria-controls="chat-members" onClick={() => setShowMembers(!showMembers)} disabled={!transcript}><ChatIcon name="people" /><span>Members</span><span className="creator-chat-member-count">{members.filter((m) => m.canView !== false).length}</span></button></div>
            </header>
            <div className="creator-chat-conversation-tools" role="group" aria-label="Message tools"><button type="button" disabled={typeof transcript?.canPin !== "boolean"} onClick={() => setTools({ kind: "search", channelId: selected, channelName: `${area?.name ?? "Workspace"} / ${channel?.name ?? "Conversation"}` })}><ChatIcon name="search" />Search messages</button><button type="button" disabled={typeof transcript?.canPin !== "boolean"} onClick={() => setTools({ kind: "pins", channelId: selected, channelName: `${area?.name ?? "Workspace"} / ${channel?.name ?? "Conversation"}` })}>Pinned messages</button>{transcript?.canViewDeleted && <button type="button" onClick={() => setTools({ kind: "deleted", channelId: selected, channelName: `${area?.name ?? "Workspace"} / ${channel?.name ?? "Conversation"}` })}>Deleted messages</button>}</div>
            {channel?.isPrivate && <div className="creator-chat-private-notice"><ChatIcon name="lock" /><span>Private conversation. <button type="button" onClick={() => setShowMembers(true)}>See who has access</button></span>{transcript?.quarantine && <button type="button" onClick={() => setQuarantining(transcript.quarantine!)}>{transcript.quarantine.active ? "Review / lift chat pause" : "Pause creator chats…"}</button>}</div>}
            {area?.pausedForYou && <div className="creator-chat-pause-notice" role="status"><strong>Your other chats for {area.name} are paused.</strong><p>Use your private management chat below. Login, Clock &amp; Hours and other creators are unaffected.</p></div>}
            {(!!channel?.unreadCount || readError) && <div className="creator-chat-read-status"><span role="status">{readError || `${channel?.unreadCount} unread · Messages clear as you view them.`}</span>{!!channel?.unreadCount && <button type="button" disabled={markingRead || !transcript?.messages.length} title="Mark all messages read up to the latest loaded message, including earlier history." onClick={() => void markConversationRead()}>{markingRead ? "Saving…" : "Mark conversation read"}</button>}</div>}
            {showMembers && <aside id="chat-members" className="creator-chat-members" aria-label="Conversation members"><header><h3>People and access</h3><button type="button" onClick={() => setShowMembers(false)} aria-label="Close member list"><ChatIcon name="close" /></button></header><p className="creator-chat-members-hint">Current members are listed below. Authorized reviewers can also see people whose creator chats are paused.</p>{members.map((m) => <div className="creator-chat-member" key={m.id}><span className="creator-chat-avatar" aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span><strong>{m.name}</strong><span>{m.quarantine?.active ? "Creator chats paused" : m.canPost ? "Can post" : "Read only"}</span>{m.quarantine && <button type="button" onClick={() => setQuarantining(m.quarantine!)} aria-label={`${m.quarantine.active ? "Review or lift pause for" : "Pause creator chats for"} ${m.name}`}>{m.quarantine.active ? "Review / lift pause" : "Pause chats…"}</button>}</div>)}</aside>}
            <div ref={messagePane} className={`creator-chat-messages ${transcript && !transcript.messages.length ? "is-empty" : ""}`} role="log" aria-label="Messages" aria-live="polite" onScroll={() => { const pane = messagePane.current; if (pane) followMessages.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48; }}>
              {!transcript ? <p role="status">Loading messages…</p> : <>
                {transcript.hasMore && <button className="creator-chat-load-older" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load earlier messages"}</button>}
                {!transcript.messages.length && <div className="creator-chat-empty"><span className="creator-chat-empty-icon"><ChatIcon name={channel?.isPrivate ? "lock" : "chat"} /></span><p className="creator-chat-empty-kicker">{channel?.isPrivate ? "PRIVATE CONVERSATION" : "YOU’RE AT THE BEGINNING"}</p><h3>{channel?.name}</h3><p>{transcript.canPost ? "No messages yet. Send the first one below." : "No messages yet. New messages will appear here."}</p><button type="button" onClick={() => setShowMembers(true)}>View members</button></div>}
                {transcript.messages.map((m, index) => <Fragment key={m.id}>
                  {(index === 0 || day(transcript.messages[index - 1].createdAt) !== day(m.createdAt)) && <div className="creator-chat-day"><span>{day(m.createdAt)}</span></div>}
                  <article className="creator-chat-message" data-chat-message-id={m.id}><div className="creator-chat-avatar" aria-hidden="true">{m.authorName.slice(0, 1).toUpperCase()}</div><ChatMessageContent message={m} channelId={selected} onReply={(message) => startReply(selected, message)} onEdit={startEdit} onChanged={(message) => changedMessage(selected, message)} onError={messageError} onOpen={(messageId) => setTools({ kind: "message", channelId: selected, channelName: `${area?.name ?? "Workspace"} / ${channel?.name ?? "Conversation"}`, messageId })} onModerate={(message) => startModeration(selected, message)} onHistory={(messageId) => setTools({ kind: "history", channelId: selected, channelName: `${area?.name ?? "Workspace"} / ${channel?.name ?? "Conversation"}`, messageId })} onPreviewLoad={followLoadedPreview} /></article>
                </Fragment>)}
              </>}
            </div>
            {transcript?.canPost && !channel?.archived ? <form className="creator-chat-composer" onSubmit={(e) => void submit(e)}>
              {edit && <div className="creator-chat-editing" role="status"><strong>Editing your message</strong><button type="button" onClick={cancelEdit}>Cancel edit</button></div>}
              {editConflict && latestEdit && <div className="creator-chat-edit-conflict" role="alert"><strong>This message changed elsewhere.</strong><p>Your edit is kept below. Review the latest sent text before saving over it.</p><details><summary>View latest sent text</summary><p>{latestEdit.text}</p></details><button type="button" onClick={() => setEdit(latestEdit)}>I reviewed it — keep my edit</button></div>}
              {reply && <div className="creator-chat-replying" role="status"><div><strong>Replying to {reply.authorName}</strong><p>{reply.attachment?.fileName ?? reply.text}</p></div><button type="button" onClick={() => { setReply(null); composer.current?.focus(); }}>Cancel reply</button></div>}
              <label className="creator-chat-sr" htmlFor="chat-message">Message {channel?.name}</label>
              <textarea ref={composer} id="chat-message" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} maxLength={8000} rows={2} placeholder={`Message ${channel?.isPrivate ? "" : "#"}${channel?.name ?? "channel"}…`} disabled={sending} />
              <div className="creator-chat-composer-footer"><small><span className="creator-chat-shortcut">Ctrl / ⌘ + Enter to send</span><span className={draft.length > 7500 ? "creator-chat-limit" : ""}>{draft.length > 0 ? `${draft.length.toLocaleString()} / 8,000 · Draft kept while Chat stays open` : ""}</span></small><button type="submit" disabled={sending || editConflict || unchangedEdit || !draft.trim()}><span>{sending ? "Sending…" : edit ? "Save changes" : "Send"}</span><ChatIcon name="send" /></button></div>
              {attachmentMaxBytes > 0 && <div hidden={!!edit || !!reply}><ChatAttachmentPicker key={selected} channelId={selected} maxBytes={attachmentMaxBytes} onSent={message => showSentMessage(selected, message)} /></div>}
              {voiceMaxSeconds > 0 && !edit && !reply && <ChatVoiceRecorder key={selected} channelId={selected} maxSeconds={voiceMaxSeconds} onSent={message => showSentMessage(selected, message)} />}
            </form> : transcript && <div className="creator-chat-readonly"><ChatIcon name="lock" /><div><strong>{channel?.archived ? "Archived conversation" : "Read-only conversation"}</strong><p>{channel?.archived ? "You can read the history here. New messages are disabled." : "You can read messages here, but your access does not include posting."}</p></div></div>}
          </div>
        </div>
      )}
      {settings && <ChatChannelSettings key={settings.channelId ?? settings.modelId}
        target={{ ...settings, name: channel && channel.id === settings.channelId ? channel.name : settings.name, canArchive: channel?.id === settings.channelId && channel?.canArchive }}
        onClose={() => setSettings(null)}
        onSaved={async (id) => { await refreshAreas(); if (id) chooseChannel(id); }}
        onArchived={() => {
          setSettings(null); setTranscript(null); setMembers([]); setTools(null); setDeleting(null); setQuarantining(null);
          setEdit(null); setReply(null); setDraft("");
          setNotice("Channel archived. Its messages and files were kept.");
          setRefreshTick(n => n + 1);
        }}
      />}
      {tools && <ChatMessageTools key={`${tools.kind}:${tools.channelId}:${tools.kind === "message" || tools.kind === "history" ? tools.messageId : ""}`} target={tools} onClose={() => { setTools(null); setToolsNotice(""); }} revision={toolsRevision} notice={toolsNotice} paused={!!deleting} onConversation={(id) => { chooseChannel(id); setTools(null); setToolsNotice(""); }} onReply={startReply} onChanged={changedMessage} onModerate={startModeration} />}
      {deleting && <ChatModerationDialog key={deleting.message.id} target={deleting} onClose={() => setDeleting(null)} onDeleted={messageDeleted} />}
      {quarantining && <ChatQuarantineDialog key={`${quarantining.modelId}:${quarantining.userId}`} target={quarantining} onClose={() => { setQuarantining(null); setRefreshTick((n) => n + 1); }} onSaved={(result) => {
        setQuarantining(null); setNotice(`${result.personName}: ${result.active ? "chats paused" : "chat pause lifted"} for ${result.creatorName}. ${result.active ? "Their private management chat stays open." : "Access now follows current assignments and permissions."}`);
        setRefreshTick((n) => n + 1); void refreshAreas().catch((e: unknown) => setError(errorText(e)));
      }} />}
    </section>
  );
}
