import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

type Grant = { canView: boolean; canPost: boolean };
type Option = { id: string; name: string; grant: Grant | null };
type Options = { roles: Option[]; people: Option[] };
type Props = {
  target: { modelId: string; channelId?: string; name: string; canArchive?: boolean };
  onClose: () => void;
  onSaved: (channelId?: string) => Promise<void>;
  onArchived: () => void;
};
export default function ChatChannelSettings({ target, onClose, onSaved, onArchived }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(target.name);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (!target.channelId) return;
    const controller = new AbortController();
    void apiRequest<Options>(`/api/chat/channels/${target.channelId}/grants`, { signal: controller.signal }).then(setOptions).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load channel access.");
    });
    return () => controller.abort();
  }, [target.channelId]);
  async function saveName(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (target.channelId) {
        await apiRequest(`/api/chat/channels/${target.channelId}`, { method: "PATCH", body: JSON.stringify({ name }) });
        await onSaved(); setNotice("Channel name saved.");
      } else {
        const result = await apiRequest<{ channel: { id: string } }>(`/api/chat/areas/${target.modelId}/channels`, { method: "POST", body: JSON.stringify({ name }) });
        await onSaved(result.channel.id); onClose();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the channel."); }
    finally { setBusy(false); }
  }
  async function saveGrant(kind: "roles" | "people", option: Option, grant: Grant) {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/api/chat/channels/${target.channelId}/grants`, { method: "PUT", body: JSON.stringify({
        ...(kind === "roles" ? { roleId: option.id } : { personId: option.id }), ...grant,
      }) });
      setOptions(await apiRequest<Options>(`/api/chat/channels/${target.channelId}/grants`));
      await onSaved(); setNotice(`Access saved for ${option.name}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save channel access."); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!target.channelId || !confirmArchive || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/api/chat/channels/${target.channelId}/archive`, { method: "PUT", body: JSON.stringify({ name: target.name }) });
      onArchived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to archive the channel.");
    } finally {
      setBusy(false);
    }
  }
  return <dialog ref={dialog} className="creator-chat-settings" aria-labelledby="chat-settings-title" onCancel={onClose}>
    <header><h2 id="chat-settings-title">{target.channelId ? "Channel settings" : "Create a channel"}</h2><button type="button" onClick={onClose}>Close</button></header>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={(e) => void saveName(e)}><label htmlFor="chat-channel-name">Channel name</label><div className="creator-chat-settings-name"><input id="chat-channel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /><button type="submit" disabled={busy || !name.trim()}>{target.channelId ? "Save name" : "Create channel"}</button></div></form>
    {!target.channelId && <p>Create a channel for this creator, then use its settings to choose who can read and send messages.</p>}
    {target.channelId && <>
      {target.canArchive && <section className="creator-chat-archive-control" aria-label="Archive channel">
        {confirmArchive ? <>
          <h3>Archive #{target.name}?</h3>
          <p>This freezes the channel and moves it to Archived conversations. Only authorized Owners and Developers can open it there. Messages and files are kept.</p>
          <button type="button" disabled={busy} onClick={() => setConfirmArchive(false)}>Keep channel active</button>
          <button type="button" disabled={busy} onClick={() => void archive()}>{busy ? "Saving…" : "Confirm archive"}</button>
        </> : <button type="button" disabled={busy} onClick={() => setConfirmArchive(true)}>Archive channel…</button>}
      </section>}
      <p>Choose who can read and send messages in this channel. Access from a person's roles and individual settings adds together. “No extra access” removes only this setting; access from another role may still apply.</p>
      <p>Staff must be assigned to this creator. Their role must also allow channels in Role Settings. These settings cannot change protected private chats.</p>
      {!options ? <p role="status">Loading channel access…</p> : <>
        <h3>Access by role</h3><div className="creator-chat-grant-list">{options.roles.map((option) => <GrantRow key={option.id} kind="Role" option={option} busy={busy} onSave={(grant) => void saveGrant("roles", option, grant)} />)}</div>
        <h3>Access for a person</h3><p>Only people currently assigned to this creator are listed. You cannot add yourself.</p><div className="creator-chat-grant-list">{options.people.map((option) => <GrantRow key={option.id} kind="Person" option={option} busy={busy} onSave={(grant) => void saveGrant("people", option, grant)} />)}{!options.people.length && <p>No other assigned staff are available.</p>}</div>
      </>}
    </>}
  </dialog>;
}
function GrantRow({ kind, option, busy, onSave }: { kind: string; option: Option; busy: boolean; onSave: (grant: Grant) => void }) {
  const current = option.grant?.canPost ? "post" : option.grant?.canView ? "view" : "none";
  const [value, setValue] = useState(current);
  return <form className="creator-chat-grant-row" onSubmit={(e) => { e.preventDefault(); onSave({ canView: value !== "none", canPost: value === "post" }); }}>
    <label htmlFor={`chat-grant-${option.id}`}>{option.name}</label><select id={`chat-grant-${option.id}`} aria-label={`${kind} access for ${option.name}`} value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
      <option value="none">No extra access</option><option value="view">Read messages</option><option value="post">Read and send</option>
    </select><button type="submit" disabled={busy || current === value}>Save</button>
  </form>;
}
