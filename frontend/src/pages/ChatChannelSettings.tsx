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
  const [activeTab, setActiveTab] = useState<"details" | "access">("details");
  const [accessQuery, setAccessQuery] = useState("");
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

  const matchingRoles = options?.roles.filter((entry) => entry.name.toLocaleLowerCase().includes(accessQuery.trim().toLocaleLowerCase())) ?? [];
  const matchingPeople = options?.people.filter((entry) => entry.name.toLocaleLowerCase().includes(accessQuery.trim().toLocaleLowerCase())) ?? [];
  return (
    <dialog ref={dialog} className="creator-chat-settings creator-chat-channel-settings" aria-labelledby="chat-settings-title"
      onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
      <div className="creator-chat-settings-top">
        <div className="creator-chat-settings-title-block">
          <p className="creator-chat-settings-kicker">{target.channelId ? "CHANNEL SETTINGS" : "NEW CHANNEL"}</p>
          <h2 id="chat-settings-title">{target.channelId ? "#" + target.name : "Create a channel"}</h2>
          <p>{target.channelId ? "Manage the channel and who can participate." : "Add a new conversation for your team."}</p>
        </div>
        <button type="button" className="creator-chat-settings-close" onClick={onClose} disabled={busy} aria-label="Close channel settings">×</button>
      </div>
      {target.channelId && (
        <nav className="creator-chat-settings-tabs" aria-label="Channel settings sections">
          <button type="button" aria-pressed={activeTab === "details"} onClick={() => setActiveTab("details")}>Overview</button>
          <button type="button" aria-pressed={activeTab === "access"} onClick={() => setActiveTab("access")}>Permissions</button>
        </nav>
      )}
      {error && <p className="creator-chat-error" role="alert">{error}</p>}
      {notice && <p className="creator-chat-settings-success" role="status">{notice}</p>}
      {(!target.channelId || activeTab === "details") && (
        <div className="creator-chat-settings-section-stack">
          <section className="creator-chat-settings-section" aria-labelledby="chat-settings-details-title">
            <h3 id="chat-settings-details-title">Channel details</h3>
            <p>Use a short name that your team can recognize easily.</p>
            <form onSubmit={(event) => void saveName(event)}>
              <label htmlFor="chat-channel-name">Channel name</label>
              <div className="creator-chat-settings-name">
                <input id="chat-channel-name" value={name} onChange={(event) => setName(event.target.value)}
                  maxLength={80} autoComplete="off" required placeholder="e.g. Updates" />
                <button type="submit" className="creator-chat-settings-primary" disabled={busy || !name.trim() || (!!target.channelId && name.trim() === target.name)}>
                  {target.channelId ? "Save changes" : "Create channel"}
                </button>
              </div>
            </form>
          </section>
          {target.canArchive && (
            <section className="creator-chat-settings-section creator-chat-settings-danger" aria-label="Archive channel">
              <h3>Archive channel</h3>
              <p>Stop new messages and move this channel to Archived. Its messages and attachments are kept for authorized history access.</p>
              {confirmArchive ? (
                <div className="creator-chat-archive-confirm">
                  <p><strong>Archive #{target.name}?</strong> Staff will no longer be able to post here.</p>
                  <div className="creator-chat-settings-action-row">
                    <button type="button" disabled={busy} onClick={() => setConfirmArchive(false)}>Cancel</button>
                    <button type="button" className="creator-chat-settings-danger-action" disabled={busy} onClick={() => void archive()}>
                      {busy ? "Archiving…" : "Confirm archive"}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="creator-chat-settings-danger-action" disabled={busy} onClick={() => setConfirmArchive(true)}>
                  Archive channel…
                </button>
              )}
            </section>
          )}
        </div>
      )}
      {target.channelId && activeTab === "access" && (
        <section className="creator-chat-settings-section creator-chat-settings-access" aria-labelledby="chat-settings-access-title">
          <h3 id="chat-settings-access-title">Member permissions</h3>
          <p>Control who can view or send messages. Role and individual permissions combine; removing one grant may not remove access from another. Only staff assigned to this creator can be added.</p>
          <label htmlFor="chat-settings-find-access">Find a role or person</label>
          <input id="chat-settings-find-access" type="search" value={accessQuery} onChange={(event) => setAccessQuery(event.target.value)}
            placeholder="Search members and roles…" />
          {!options ? <p role="status">Loading channel access…</p> : (
            <div className="creator-chat-settings-grant-groups">
              <section aria-labelledby="chat-access-roles-title">
                <div className="creator-chat-settings-group-title"><h4 id="chat-access-roles-title">Roles</h4><span>{matchingRoles.length}</span></div>
                <div className="creator-chat-grant-list">
                  {matchingRoles.map((option) => <GrantRow key={option.id} kind="Role" option={option} busy={busy} onSave={(grant) => void saveGrant("roles", option, grant)} />)}
                  {!matchingRoles.length && <p className="creator-chat-settings-no-match">No matching roles.</p>}
                </div>
              </section>
              <section aria-labelledby="chat-access-people-title">
                <div className="creator-chat-settings-group-title"><h4 id="chat-access-people-title">Individuals</h4><span>{matchingPeople.length}</span></div>
                <div className="creator-chat-grant-list">
                  {matchingPeople.map((option) => <GrantRow key={option.id} kind="Person" option={option} busy={busy} onSave={(grant) => void saveGrant("people", option, grant)} />)}
                  {!matchingPeople.length && <p className="creator-chat-settings-no-match">No matching assigned staff.</p>}
                </div>
              </section>
            </div>
          )}
        </section>
      )}
    </dialog>
  );
}
function GrantRow({ kind, option, busy, onSave }: { kind: string; option: Option; busy: boolean; onSave: (grant: Grant) => void }) {
  const current = option.grant?.canPost ? "post" : option.grant?.canView ? "view" : "none";
  const [value, setValue] = useState(current);
  const id = "chat-grant-" + kind.toLowerCase() + "-" + option.id;
  return (
    <form className="creator-chat-grant-row" onSubmit={(event) => {
      event.preventDefault(); onSave({ canView: value !== "none", canPost: value === "post" });
    }}>
      <div className="creator-chat-grant-identity"><strong title={option.name}>{option.name}</strong><span>{kind}</span></div>
      <div className="creator-chat-grant-controls">
        <label className="creator-chat-sr" htmlFor={id}>{kind} access for {option.name}</label>
        <select id={id} aria-label={kind + " access for " + option.name} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy}>
          <option value="none">No access</option>
          <option value="view">Can view</option>
          <option value="post">Can send</option>
        </select>
        <button type="submit" disabled={busy || current === value}>Save</button>
      </div>
    </form>
  );
}
