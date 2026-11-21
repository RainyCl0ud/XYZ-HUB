import { useToast } from "../components/ToastProvider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

type Grant = { canView: boolean; canPost: boolean };
// Roles: grant, siteWideAccess (Role Settings, all channels) and limit (what
// the role allows on its own). Members: grant, inheritedAccess (their roles),
// access (what they can do now) and limit (the most a grant could give).
type Option = { id: string; name: string; grant: Grant | null; inheritedAccess?: Grant; siteWideAccess?: Grant; access?: Grant; limit?: Grant };
type Options = { roles: Option[]; people: Option[] };
type Props = {
  target: { modelId: string; channelId?: string; name: string; canArchive?: boolean };
  onClose: () => void;
  onSaved: (channelId?: string) => Promise<void>;
  onArchived: () => void;
};
export default function ChatChannelSettings({ target, onClose, onSaved, onArchived }: Props) {
  const toast = useToast();
  const workspace = useRef<HTMLElement>(null);
  const [name, setName] = useState(target.name);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "access">("details");
  const [accessQuery, setAccessQuery] = useState("");
  const [accessExpanded, setAccessExpanded] = useState(false);
  const [accessCategory, setAccessCategory] = useState<"roles" | "people">("roles");
  useEffect(() => { workspace.current?.focus(); }, []);
  useEffect(() => {
    if (!target.channelId) return;
    const controller = new AbortController();
    void apiRequest<Options>(`/api/chat/channels/${target.channelId}/grants`, { signal: controller.signal }).then(setOptions).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load channel access.");
    });
    return () => controller.abort();
  }, [target.channelId]);
  async function saveName(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (target.channelId) {
        await apiRequest(`/api/chat/channels/${target.channelId}`, { method: "PATCH", body: JSON.stringify({ name }) });
        await onSaved(); toast.success("Channel name saved.");
      } else {
        const result = await apiRequest<{ channel: { id: string } }>(`/api/chat/areas/${target.modelId}/channels`, { method: "POST", body: JSON.stringify({ name }) });
        await onSaved(result.channel.id); toast.success("Channel created."); onClose();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the channel."); }
    finally { setBusy(false); }
  }
  async function saveGrant(kind: "roles" | "people", option: Option, grant: Grant) {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/chat/channels/${target.channelId}/grants`, { method: "PUT", body: JSON.stringify({
        ...(kind === "roles" ? { roleId: option.id } : { personId: option.id }), ...grant,
      }) });
      setOptions(await apiRequest<Options>(`/api/chat/channels/${target.channelId}/grants`));
      await onSaved(); toast.success(`Access saved for ${option.name}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save channel access."); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!target.channelId || !confirmArchive || busy) return;
    setBusy(true); setError("");
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
    <section ref={workspace} tabIndex={-1}
      className={`creator-chat-settings creator-chat-channel-settings creator-chat-settings-workspace ${target.channelId ? "" : "is-create"}`}
      role="region" aria-labelledby="chat-settings-title">
      <header className="creator-chat-settings-top">
        <button type="button" className="creator-chat-settings-back" onClick={onClose} disabled={busy}
          aria-label={target.channelId ? `Back to #${target.name} conversation` : "Back to conversations"}>
          <span className="creator-chat-settings-back-icon" aria-hidden="true">←</span>
        </button>
        <div className="creator-chat-settings-title-block">
          <p className="creator-chat-settings-kicker">{target.channelId ? "CHANNEL SETTINGS" : "NEW CHANNEL"}</p>
          <h2 id="chat-settings-title">{target.channelId ? "#" + target.name : "Create a channel"}</h2>
          <p>{target.channelId ? "Manage the channel and who can participate." : "Add a new conversation for your team."}</p>
        </div>
      </header>
      <div className="creator-chat-settings-layout">
        {target.channelId && (
          <nav className="creator-chat-settings-tabs" aria-label="Channel settings sections">
            <button type="button" aria-pressed={activeTab === "details"}
              onClick={() => { setActiveTab("details"); setAccessExpanded(false); }}>General</button>
            <div className="creator-chat-settings-nav-group">
              <button type="button" aria-pressed={activeTab === "access"} aria-expanded={accessExpanded}
                aria-controls="chat-settings-permission-children"
                onClick={() => {
                  setActiveTab("access");
                  setAccessExpanded((open) => activeTab === "access" ? !open : true);
                }}>
                <span>Permissions</span>
                <span className="creator-chat-settings-nav-chevron" aria-hidden="true">▾</span>
              </button>
              {accessExpanded && <div id="chat-settings-permission-children"
                className="creator-chat-settings-subnav" role="group" aria-label="Permission categories">
                <button type="button" aria-current={activeTab === "access" && accessCategory === "roles" ? "page" : undefined}
                  onClick={() => { setActiveTab("access"); setAccessCategory("roles"); setAccessQuery(""); }}>Role</button>
                <button type="button" aria-current={activeTab === "access" && accessCategory === "people" ? "page" : undefined}
                  onClick={() => { setActiveTab("access"); setAccessCategory("people"); setAccessQuery(""); }}>Member</button>
              </div>}
            </div>
          </nav>
        )}
        <div className="creator-chat-settings-main">
          {error && <p className="creator-chat-error" role="alert">{error}</p>}
      {(!target.channelId || activeTab === "details") && (
        <div className="creator-chat-settings-section-stack">
          <section className="creator-chat-settings-section creator-chat-settings-details" aria-label="Channel name">
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
          <h3 id="chat-settings-access-title">{accessCategory === "roles" ? "Role permissions" : "Member permissions"}</h3>
          <p>{accessCategory === "roles"
            ? "Choose which roles can see or post in this channel. Only roles ranked below yours are listed."
            : "Each member shows the access they have now. Their roles set the minimum: you can give a member more access here, not less. Only members whose roles are all ranked below yours are listed."}</p>
          <label htmlFor="chat-settings-find-access">{accessCategory === "roles" ? "Find a role" : "Find a member"}</label>
          <input id="chat-settings-find-access" type="search" value={accessQuery} onChange={(event) => setAccessQuery(event.target.value)}
            placeholder={accessCategory === "roles" ? "Search roles…" : "Search members…"} />
          {!options ? <p role="status">Loading channel access…</p> : (
            <div className="creator-chat-settings-grant-groups">
              {accessCategory === "roles" ? (
                <section aria-labelledby="chat-access-roles-title">
                  <div className="creator-chat-settings-group-title"><h4 id="chat-access-roles-title">Role</h4><span>{matchingRoles.length}</span></div>
                  <div className="creator-chat-grant-list">
                    {matchingRoles.map((option) => <GrantRow key={rowKey(option)} kind="Role" option={option} busy={busy} onSave={(grant) => void saveGrant("roles", option, grant)} />)}
                    {!matchingRoles.length && <p className="creator-chat-settings-no-match">No matching roles.</p>}
                  </div>
                </section>
              ) : (
                <section aria-labelledby="chat-access-people-title">
                  <div className="creator-chat-settings-group-title"><h4 id="chat-access-people-title">Member</h4><span>{matchingPeople.length}</span></div>
                  <div className="creator-chat-grant-list">
                    {matchingPeople.map((option) => <GrantRow key={rowKey(option)} kind="Member" option={option} busy={busy} onSave={(grant) => void saveGrant("people", option, grant)} />)}
                    {!matchingPeople.length && <p className="creator-chat-settings-no-match">No matching members.</p>}
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      )}
        </div>
      </div>
    </section>
  );
}
type Level = "none" | "view" | "post";
const LEVEL: Record<Level, number> = { none: 0, view: 1, post: 2 };
const ACCESS_LABEL: Record<Level, string> = { none: "No access", view: "Can see", post: "Can post" };
const levelOf = (access?: Grant | null): Level => (access?.canPost ? "post" : access?.canView ? "view" : "none");

// Remount a row when its saved access changes, so it never keeps a stale choice.
const bits = (access?: Grant | null) => (access?.canView ? "v" : "-") + (access?.canPost ? "p" : "-");
const rowKey = (option: Option) => [option.id, bits(option.grant), bits(option.inheritedAccess), bits(option.siteWideAccess), bits(option.access), bits(option.limit)].join(":");

/**
 * One role or member. The menu shows the access they actually have.
 * Access that comes from elsewhere (a member's roles, or a role's
 * all-channels setting in Role Settings) is the minimum: lower choices are
 * unavailable, and a grant here can only add to it. For members, choices a
 * grant can't give (their roles can't send messages, a pause, the trial
 * feedback restriction) are unavailable too. Choosing the minimum clears any
 * extra grant saved here, and an extra grant the minimum already covers can
 * be removed.
 */
function GrantRow({ kind, option, busy, onSave }: { kind: string; option: Option; busy: boolean; onSave: (grant: Grant) => void }) {
  const member = kind === "Member";
  const floor = levelOf(member ? option.inheritedAccess : option.siteWideAccess);
  const own = levelOf(option.grant);
  const ceiling: Level = member && option.limit ? levelOf(option.limit) : "post";
  const current: Level = member && option.access ? levelOf(option.access) : LEVEL[own] > LEVEL[floor] ? own : floor;
  const [value, setValue] = useState<Level>(current);
  const locked = LEVEL[floor] >= LEVEL[ceiling];
  // A saved grant that the role access already covers: harmless today, but
  // it would keep access if the role changed, so it can be removed.
  const extra = own !== "none" && LEVEL[own] <= LEVEL[floor];
  const removing = extra && value === current && value === floor;
  const id = "chat-grant-" + kind.toLowerCase() + "-" + option.id;
  const given = current !== "none" && floor === "none" ? "Given in this channel" : kind;
  const source = (floor === "none" ? given : member ? `From their role: ${ACCESS_LABEL[floor]}` : `All channels (Role Settings): ${ACCESS_LABEL[floor]}`)
    + (extra ? " · also granted here" : "");
  const roleLimit = levelOf(option.limit);
  const note = member
    ? ceiling === "none" ? "Can’t be given access here: blocked by their roles or a Chat pause."
      : ceiling === "view" ? "Can’t post here: their roles don’t allow sending messages." : null
    : option.limit && LEVEL[current] > LEVEL[roleLimit]
      ? roleLimit === "none" ? "On its own, this role has no Chat access here (Role Settings)."
        : "On its own, this role can’t send messages (Role Settings), so it can only see."
      : null;
  const lockReason = !locked ? undefined
    : floor === "post" ? (member ? "Their role already lets them post" : "This role can post in every channel")
      : "A grant here can’t give more access";
  return (
    <form className="creator-chat-grant-row" onSubmit={(event) => {
      event.preventDefault();
      onSave(LEVEL[value] > LEVEL[floor] ? { canView: true, canPost: value === "post" } : { canView: false, canPost: false });
    }}>
      <div className="creator-chat-grant-identity">
        <strong title={option.name}>{option.name}</strong>
        <span className={floor === "none" ? undefined : "creator-chat-grant-inherited"}>{source}</span>
        {note && <span className="creator-chat-grant-note">{note}</span>}
      </div>
      <div className="creator-chat-grant-controls">
        <label className="creator-chat-sr" htmlFor={id}>{kind} access for {option.name}</label>
        <select id={id} aria-label={kind + " access for " + option.name} value={value} onChange={(event) => setValue(event.target.value as Level)}
          disabled={busy || locked} title={lockReason}>
          {(["none", "view", "post"] as Level[]).map((level) => <option key={level} value={level} disabled={LEVEL[level] < LEVEL[floor] || LEVEL[level] > LEVEL[ceiling]}>{ACCESS_LABEL[level]}</option>)}
        </select>
        <button type="submit" disabled={busy || !(value !== current || removing)}>{removing ? "Remove extra grant" : "Save"}</button>
      </div>
    </form>
  );
}
