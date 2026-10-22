import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

type Grant = { canView: boolean; canPost: boolean };
type Option = { id: string; name: string; grant: Grant | null };
type Options = { roles: Option[]; people: Option[] };
type Props = { target: { modelId: string; channelId?: string; name: string }; onClose: () => void; onSaved: (channelId?: string) => Promise<void> };
export default function ChatChannelSettings({ target, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(target.name);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
  return <dialog ref={dialog} className="creator-chat-settings" aria-labelledby="chat-settings-title" onCancel={onClose}>
    <header><h2 id="chat-settings-title">{target.channelId ? "Channel settings" : "Create a channel"}</h2><button type="button" onClick={onClose}>Close</button></header>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={(e) => void saveName(e)}><label htmlFor="chat-channel-name">Channel name</label><div className="creator-chat-settings-name"><input id="chat-channel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /><button type="submit" disabled={busy || !name.trim()}>{target.channelId ? "Save name" : "Create channel"}</button></div></form>
    {!target.channelId && <p>After creating the channel, open its settings to choose which roles and people can see and post.</p>}
    {target.channelId && <>
      <p>Access from roles and named people combines. Removing one grant does not remove access supplied by another role. Roles also need ordinary chat access in Role Settings. Creator assignments are always required for staff.</p>
      {!options ? <p role="status">Loading channel access…</p> : <>
        <h3>Role access</h3><div className="creator-chat-grant-list">{options.roles.map((option) => <GrantRow key={option.id} kind="Role" option={option} busy={busy} onSave={(grant) => void saveGrant("roles", option, grant)} />)}</div>
        <h3>Individual access</h3><p>Only people currently assigned to this creator are listed. You cannot add yourself.</p><div className="creator-chat-grant-list">{options.people.map((option) => <GrantRow key={option.id} kind="Person" option={option} busy={busy} onSave={(grant) => void saveGrant("people", option, grant)} />)}{!options.people.length && <p>No other assigned staff are available.</p>}</div>
      </>}
    </>}
  </dialog>;
}
function GrantRow({ kind, option, busy, onSave }: { kind: string; option: Option; busy: boolean; onSave: (grant: Grant) => void }) {
  const current = option.grant?.canPost ? "post" : option.grant?.canView ? "view" : "none";
  const [value, setValue] = useState(current);
  return <form className="creator-chat-grant-row" onSubmit={(e) => { e.preventDefault(); onSave({ canView: value !== "none", canPost: value === "post" }); }}>
    <label htmlFor={`chat-grant-${option.id}`}>{option.name}</label><select id={`chat-grant-${option.id}`} aria-label={`${kind} access for ${option.name}`} value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
      <option value="none">No direct grant</option><option value="view">See only</option><option value="post">See and post</option>
    </select><button type="submit" disabled={busy || current === value}>Save</button>
  </form>;
}
