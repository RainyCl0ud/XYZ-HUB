import { useNavigationFilter } from "../lib/useNavigationFilter";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";

import {
  PEOPLE_CHANGED_EVENT,
  apiRequest,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";

import "./PeoplePage.css";

type PersonStatus = "PENDING_SETUP" | "ACTIVE" | "DEACTIVATED";

type PersonRole = {
  id: string;
  name: string;
  systemKey: string | null;
  dataScope: string;
  assignedAt: string;
  assignedByUserId: string | null;
};

type PersonModel = {
  id: string;
  name: string;
  isActive: boolean;
  assignedAt: string;
  assignedByUserId: string | null;
};

type TeamGroup = {
  id: string;
  name: string;
  parentId: string | null;
  isRoot: boolean;
  memberCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
};

type PersonTeamGroup = {
  id: string;
  name: string;
  parentId: string | null;
  isRoot: boolean;
};

type Person = {
  id: string;
  name: string;
  email: string;
  status: PersonStatus;
  createdAt: string;
  emailVerifiedAt: string | null;
  deactivatedAt: string | null;
  teamGroup: PersonTeamGroup | null;
  roles: PersonRole[];
  models: PersonModel[];
  security?: {
    lastSignInAt: string | null;
  };
};

type AssignableRole = {
  id: string;
  name: string;
  systemKey: string | null;
  dataScope: string;
};

type AssignableModel = {
  id: string;
  name: string;
  isActive: boolean;
};

type PeopleOptions = {
  roles: AssignableRole[];
  models: AssignableModel[];
  organization: {
    rootGroupId: string;
    groups: TeamGroup[];
  };
  capabilities: {
    isOwner: boolean;
    canManagePeople: boolean;
    canManageOrganization: boolean;
    canDeactivate: boolean;
    canDelete: boolean;
    canResetTwoFactor: boolean;
    invitesAvailable: boolean;
  };
};

type ConfirmAction = "deactivate" | "reactivate" | "reset-2fa" | "delete" | null;
type BatchAction = "group" | "role" | null;
type GroupModalAction = "create" | "rename" | "delete" | null;

type GroupContextMenu = {
  groupId: string;
  x: number;
  y: number;
} | null;

const TEXAS_TIME_ZONE = "America/Chicago";
const EMPTY_GROUPS: TeamGroup[] = [];

function formatStatus(status: PersonStatus) {
  if (status === "PENDING_SETUP") return "Pending setup";
  if (status === "DEACTIVATED") return "Deactivated";
  return "Active";
}

function formatDataScope(value: string) {
  if (value === "ALL") return "All data";
  if (value === "SELF_AND_TEAM") return "Self + subordinates";
  if (value === "SELF") return "Self only";
  return value.toLowerCase().replaceAll("_", " ");
}

function formatTexasDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: TEXAS_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function collectDescendants(
  childrenByParent: Map<string | null, TeamGroup[]>,
  rootId: string
) {
  const ids = new Set<string>([rootId]);
  const stack = [rootId];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    for (const child of childrenByParent.get(current) ?? []) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        stack.push(child.id);
      }
    }
  }

  return ids;
}

function PeoplePage() {
  const toast = useToast();
  const { user } = useAuth();

  const [people, setPeople] = useState<Person[]>([]);
  const [options, setOptions] = useState<PeopleOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [creatorFilter, setCreatorFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useNavigationFilter<"ALL" | PersonStatus>(
    "status",
    ["ALL", "ACTIVE", "PENDING_SETUP", "DEACTIVATED"],
    "ALL"
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamGroupId, setInviteTeamGroupId] = useState("");
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [inviteModelIds, setInviteModelIds] = useState<string[]>([]);

  const [showAccessEditor, setShowAccessEditor] = useState(false);
  const [accessTeamGroupId, setAccessTeamGroupId] = useState("");
  const [accessRoleIds, setAccessRoleIds] = useState<string[]>([]);
  const [accessModelIds, setAccessModelIds] = useState<string[]>([]);

  const [actionPerson, setActionPerson] = useState<Person | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const [batchAction, setBatchAction] = useState<BatchAction>(null);
  const [batchGroupId, setBatchGroupId] = useState("");
  const [batchRoleId, setBatchRoleId] = useState("");

  const [groupContextMenu, setGroupContextMenu] = useState<GroupContextMenu>(null);
  const [groupModalAction, setGroupModalAction] = useState<GroupModalAction>(null);
  const [groupActionTargetId, setGroupActionTargetId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPeople = useCallback(async () => {
    const response = await apiRequest<{ people: Person[] }>("/api/people");
    setPeople(response.people);
    return response.people;
  }, []);

  const loadOptions = useCallback(async () => {
    const response = await apiRequest<PeopleOptions>("/api/people/options");
    setOptions(response);
    return response;
  }, []);

  const loadPage = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");
      await Promise.all([loadPeople(), loadOptions()]);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Unable to load People Management.";
      setPageError(message);
      toast.error(message, "Unable to load people");
    } finally {
      setLoading(false);
    }
  }, [loadOptions, loadPeople, toast]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const handlePeopleChanged = () => {
      void Promise.all([loadPeople(), loadOptions()]).then(([refreshedPeople]) => {
        setSelectedPerson((current) => {
          if (!current) return current;
          return refreshedPeople.find((person) => person.id === current.id) ?? current;
        });
      }).catch((error) => {
        console.error("Unable to refresh People Management after live update:", error);
      });
    };

    window.addEventListener(PEOPLE_CHANGED_EVENT, handlePeopleChanged);
    return () => window.removeEventListener(PEOPLE_CHANGED_EVENT, handlePeopleChanged);
  }, [loadOptions, loadPeople]);

  useEffect(() => {
    const closeContextMenu = () => setGroupContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGroupContextMenu(null);
    };

    document.addEventListener("click", closeContextMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeContextMenu);

    return () => {
      document.removeEventListener("click", closeContextMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, []);

  const groups = options?.organization.groups ?? EMPTY_GROUPS;

  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  );

  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, TeamGroup[]>();

    for (const group of groups) {
      const parentId = group.parentId && groupById.has(group.parentId)
        ? group.parentId
        : null;
      const siblings = result.get(parentId) ?? [];
      siblings.push(group);
      result.set(parentId, siblings);
    }

    for (const siblings of result.values()) {
      siblings.sort((left, right) => left.name.localeCompare(right.name));
    }

    return result;
  }, [groupById, groups]);

  const defaultGroupId = useMemo(() => {
    const rootId = options?.organization.rootGroupId;
    if (rootId && groupById.has(rootId)) return rootId;
    return childrenByParent.get(null)?.[0]?.id ?? groups[0]?.id ?? null;
  }, [childrenByParent, groupById, groups, options?.organization.rootGroupId]);

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId(null);
      return;
    }

    if (!selectedGroupId || !groupById.has(selectedGroupId)) {
      setSelectedGroupId(defaultGroupId);
    }
  }, [defaultGroupId, groupById, groups.length, selectedGroupId]);

  const selectedGroup = selectedGroupId
    ? groupById.get(selectedGroupId) ?? null
    : null;

  const selectedGroupScopeIds = useMemo(() => {
    if (!selectedGroupId) return new Set(groups.map((group) => group.id));
    return collectDescendants(childrenByParent, selectedGroupId);
  }, [childrenByParent, groups, selectedGroupId]);

  const assignableRoleIds = useMemo(
    () => new Set(options?.roles.map((role) => role.id) ?? []),
    [options?.roles]
  );

  const assignableModelIds = useMemo(
    () => new Set(options?.models.map((model) => model.id) ?? []),
    [options?.models]
  );

  const canManagePerson = useCallback((person: Person) => {
    if (person.id === user?.id) return false;
    return person.roles.every((role) => assignableRoleIds.has(role.id))
      && person.models.every((model) => assignableModelIds.has(model.id));
  }, [assignableModelIds, assignableRoleIds, user?.id]);

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();

    return people.filter((person) => {
      if (person.teamGroup && !selectedGroupScopeIds.has(person.teamGroup.id)) return false;
      if (!person.teamGroup && selectedGroupId) return false;
      if (roleFilter !== "ALL" && !person.roles.some((role) => role.id === roleFilter)) return false;
      if (creatorFilter !== "ALL" && !person.models.some((model) => model.id === creatorFilter)) return false;
      if (statusFilter !== "ALL" && person.status !== statusFilter) return false;

      if (!query) return true;

      const searchable = [
        person.name,
        person.email,
        person.teamGroup?.name ?? "",
        ...person.roles.map((role) => role.name),
        ...person.models.map((model) => model.name),
      ].join(" ").toLowerCase();

      return searchable.includes(query);
    });
  }, [creatorFilter, people, roleFilter, search, selectedGroupId, selectedGroupScopeIds, statusFilter]);

  const visibleSelectableIds = useMemo(
    () => filteredPeople.filter(canManagePerson).map((person) => person.id),
    [canManagePerson, filteredPeople]
  );

  const allVisibleSelected = visibleSelectableIds.length > 0
    && visibleSelectableIds.every((id) => selectedPersonIds.includes(id));
  const someVisibleSelected = visibleSelectableIds.some((id) => selectedPersonIds.includes(id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    const existing = new Set(people.map((person) => person.id));
    setSelectedPersonIds((current) => current.filter((id) => existing.has(id)));
  }, [people]);

  const selectedManageablePeople = useMemo(
    () => people.filter((person) => selectedPersonIds.includes(person.id) && canManagePerson(person)),
    [canManagePerson, people, selectedPersonIds]
  );

  const groupPeopleCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const group of groups) {
      const scope = collectDescendants(childrenByParent, group.id);
      counts.set(
        group.id,
        people.filter((person) => person.teamGroup && scope.has(person.teamGroup.id)).length
      );
    }

    return counts;
  }, [childrenByParent, groups, people]);

  const activeCreators = useMemo(
    () => options?.models.filter((model) => model.isActive) ?? [],
    [options?.models]
  );

  const activeAccessCreatorIds = useMemo(
    () => activeCreators.map((model) => model.id),
    [activeCreators]
  );

  const allActiveCreatorsSelected = activeAccessCreatorIds.length > 0
    && activeAccessCreatorIds.every((id) => accessModelIds.includes(id));

  const filtersActive = Boolean(
    search.trim()
    || roleFilter !== "ALL"
    || creatorFilter !== "ALL"
    || statusFilter !== "ALL"
    || selectedGroupId !== defaultGroupId
  );

  const groupActionTarget = groupActionTargetId
    ? groupById.get(groupActionTargetId) ?? null
    : null;

  const contextGroup = groupContextMenu
    ? groupById.get(groupContextMenu.groupId) ?? null
    : null;

  const canManageSelected = Boolean(selectedPerson && canManagePerson(selectedPerson));
  const isSelectedSelf = selectedPerson?.id === user?.id;

  async function openPerson(person: Person) {
    try {
      setSelectedPerson(person);
      setDetailLoading(true);
      const response = await apiRequest<{ person: Person }>(`/api/people/${person.id}`);
      setSelectedPerson(response.person);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load the employee.",
        "Unable to load profile"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshPerson(userId: string) {
    const [response] = await Promise.all([
      apiRequest<{ person: Person }>(`/api/people/${userId}`),
      loadPeople(),
      loadOptions(),
    ]);
    setSelectedPerson(response.person);
  }

  function toggleSelection(current: string[], value: string, setter: (value: string[]) => void) {
    setter(current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  function togglePersonSelection(personId: string) {
    setSelectedPersonIds((current) => current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId]);
  }

  function toggleAllVisiblePeople() {
    setSelectedPersonIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleSelectableIds.includes(id));
      }
      return [...new Set([...current, ...visibleSelectableIds])];
    });
  }

  function resetFilters() {
    setSearch("");
    setRoleFilter("ALL");
    setCreatorFilter("ALL");
    setStatusFilter("ALL");
    setSelectedGroupId(defaultGroupId);
    setSelectedPersonIds([]);
  }

  function resetInviteForm(groupId?: string | null) {
    setInviteName("");
    setInviteEmail("");
    setInviteRoleIds([]);
    setInviteModelIds([]);
    setInviteTeamGroupId(groupId ?? selectedGroupId ?? defaultGroupId ?? "");
  }

  function openInvite(groupId?: string | null) {
    resetInviteForm(groupId);
    setShowInvite(true);
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();

    if (!options?.capabilities.invitesAvailable) {
      toast.warning(
        "Invitation email delivery is not available in the current environment.",
        "Email setup pending"
      );
      return;
    }

    if (!inviteName.trim() || !inviteEmail.trim() || !inviteTeamGroupId || !inviteRoleIds.length) {
      toast.warning(
        "Name, email, team group, and at least one role are required.",
        "Check invitation"
      );
      return;
    }

    try {
      setSaving(true);
      await apiRequest("/api/people/invite", {
        method: "POST",
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          teamGroupId: inviteTeamGroupId,
          roleIds: inviteRoleIds,
          modelIds: inviteModelIds,
        }),
      });
      toast.success("The account invitation was created and sent.", "Invitation sent");
      setShowInvite(false);
      resetInviteForm();
      await Promise.all([loadPeople(), loadOptions()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send the invitation.",
        "Invitation not sent"
      );
    } finally {
      setSaving(false);
    }
  }

  function openAccessEditor() {
    if (!selectedPerson || !canManageSelected) return;

    setAccessTeamGroupId(selectedPerson.teamGroup?.id ?? selectedGroupId ?? defaultGroupId ?? "");
    setAccessRoleIds(selectedPerson.roles.map((role) => role.id));
    setAccessModelIds(selectedPerson.models.map((model) => model.id));
    setShowAccessEditor(true);
  }

  function toggleAllAccessCreators() {
    if (allActiveCreatorsSelected) {
      const inactiveExisting = accessModelIds.filter((id) => {
        const model = options?.models.find((item) => item.id === id);
        return Boolean(model && !model.isActive);
      });
      setAccessModelIds(inactiveExisting);
      return;
    }

    const inactiveExisting = accessModelIds.filter((id) => {
      const model = options?.models.find((item) => item.id === id);
      return Boolean(model && !model.isActive);
    });
    setAccessModelIds([...new Set([...activeAccessCreatorIds, ...inactiveExisting])]);
  }

  async function saveAccess(event: FormEvent) {
    event.preventDefault();
    if (!selectedPerson) return;

    if (!accessTeamGroupId || !accessRoleIds.length) {
      toast.warning("A team group and at least one role are required.", "Check access");
      return;
    }

    try {
      setSaving(true);
      await apiRequest(`/api/people/${selectedPerson.id}/access`, {
        method: "PUT",
        body: JSON.stringify({
          teamGroupId: accessTeamGroupId,
          roleIds: accessRoleIds,
          modelIds: accessModelIds,
        }),
      });
      await refreshPerson(selectedPerson.id);
      setShowAccessEditor(false);
      toast.success("Role, creator, and team access were updated.", "Access updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update access.",
        "Access not updated"
      );
    } finally {
      setSaving(false);
    }
  }

  async function resendInvite(person: Person) {
    try {
      setSaving(true);
      await apiRequest(`/api/people/${person.id}/resend-invite`, { method: "POST" });
      if (selectedPerson?.id === person.id) await refreshPerson(person.id);
      else await loadPeople();
      toast.success("A fresh invitation was sent.", "Invitation resent");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to resend the invitation.",
        "Invitation not resent"
      );
    } finally {
      setSaving(false);
    }
  }

  function requestConfirmedAction(person: Person, action: Exclude<ConfirmAction, null>) {
    setActionPerson(person);
    setConfirmAction(action);
    setDeleteConfirmation("");
  }

  async function runConfirmedAction() {
    if (!actionPerson || !confirmAction) return;

    try {
      setSaving(true);

      if (confirmAction === "delete") {
        await apiRequest(`/api/people/${actionPerson.id}`, {
          method: "DELETE",
          body: JSON.stringify({ confirmEmail: deleteConfirmation }),
        });
        toast.success("The user and tied QA history were permanently deleted.", "User deleted");
        if (selectedPerson?.id === actionPerson.id) setSelectedPerson(null);
        setSelectedPersonIds((current) => current.filter((id) => id !== actionPerson.id));
        await Promise.all([loadPeople(), loadOptions()]);
      } else {
        const endpoint = confirmAction === "deactivate"
          ? "deactivate"
          : confirmAction === "reactivate"
            ? "reactivate"
            : "reset-2fa";

        await apiRequest(`/api/people/${actionPerson.id}/${endpoint}`, { method: "POST" });
        if (selectedPerson?.id === actionPerson.id) await refreshPerson(actionPerson.id);
        else await loadPeople();

        toast.success(
          confirmAction === "deactivate"
            ? "The user was deactivated and active sessions were revoked."
            : confirmAction === "reactivate"
              ? "The user was reactivated."
              : "Two-factor authentication was reset and existing sessions were revoked.",
          "People Management updated"
        );
      }

      setConfirmAction(null);
      setActionPerson(null);
      setDeleteConfirmation("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to complete the action.",
        "Action failed"
      );
    } finally {
      setSaving(false);
    }
  }

  function openBatchAction(action: Exclude<BatchAction, null>) {
    if (!selectedManageablePeople.length) return;

    if (action === "group") {
      setBatchGroupId(selectedGroupId ?? defaultGroupId ?? "");
    } else {
      setBatchRoleId(options?.roles[0]?.id ?? "");
    }

    setBatchAction(action);
  }

  async function runBatchAction() {
    if (!batchAction || !selectedManageablePeople.length) return;
    if (batchAction === "group" && !batchGroupId) return;
    if (batchAction === "role" && !batchRoleId) return;

    try {
      setSaving(true);
      const results = await Promise.allSettled(
        selectedManageablePeople.map(async (person) => {
          await apiRequest(`/api/people/${person.id}/access`, {
            method: "PUT",
            body: JSON.stringify({
              teamGroupId: batchAction === "group"
                ? batchGroupId
                : person.teamGroup?.id,
              roleIds: batchAction === "role"
                ? [batchRoleId]
                : person.roles.map((role) => role.id),
              modelIds: person.models.map((model) => model.id),
            }),
          });
          return person.id;
        })
      );

      const successfulIds = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failedCount = results.length - successfulIds.length;

      setSelectedPersonIds((current) => current.filter((id) => !successfulIds.includes(id)));
      await Promise.all([loadPeople(), loadOptions()]);

      if (!failedCount) {
        toast.success(
          batchAction === "group"
            ? "The selected employees were moved to the new group."
            : "The selected employees' roles were updated.",
          "Batch update complete"
        );
        setBatchAction(null);
      } else {
        toast.warning(
          `${successfulIds.length} updated, ${failedCount} could not be updated. Failed rows remain selected.`,
          "Batch update partially completed"
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to complete the batch update.",
        "Batch update failed"
      );
    } finally {
      setSaving(false);
    }
  }

  function openGroupAction(action: Exclude<GroupModalAction, null>, group: TeamGroup) {
    setGroupContextMenu(null);
    setGroupActionTargetId(group.id);
    setGroupModalAction(action);
    setGroupName(action === "rename" ? group.name : "");
  }

  async function submitGroupMutation(event: FormEvent) {
    event.preventDefault();
    if (!groupActionTarget || !groupModalAction) return;

    if (groupModalAction !== "delete" && !groupName.trim()) {
      toast.warning("Enter a group name.", "Group name required");
      return;
    }

    try {
      setSaving(true);

      if (groupModalAction === "create") {
        await apiRequest("/api/team-groups", {
          method: "POST",
          body: JSON.stringify({
            name: groupName.trim(),
            parentGroupId: groupActionTarget.id,
          }),
        });
      } else if (groupModalAction === "rename") {
        await apiRequest(`/api/team-groups/${groupActionTarget.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: groupName.trim() }),
        });
      } else {
        await apiRequest(`/api/team-groups/${groupActionTarget.id}`, { method: "DELETE" });
        if (selectedGroupId === groupActionTarget.id) {
          setSelectedGroupId(groupActionTarget.parentId ?? defaultGroupId);
        }
      }

      await Promise.all([loadOptions(), loadPeople()]);
      toast.success(
        groupModalAction === "create"
          ? "Subgroup created."
          : groupModalAction === "rename"
            ? "Group renamed."
            : "Group deleted.",
        "Organization updated"
      );
      setGroupModalAction(null);
      setGroupActionTargetId(null);
      setGroupName("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update the organization.",
        "Organization not updated"
      );
    } finally {
      setSaving(false);
    }
  }

  function compactRole(roles: PersonRole[]) {
    if (!roles.length) return "No role";
    if (roles.length === 1) return roles[0].name;

    return (
      <span className="people-role-summary">
        <span>{roles[0].name}</span>
        <span className="people-role-more">+{roles.length - 1} role{roles.length > 2 ? "s" : ""}</span>
      </span>
    );
  }

  function compactCreators(models: PersonModel[]) {
    if (!models.length) return <span className="people-muted-cell">No creator assignment</span>;

    const visible = models.slice(0, 2);
    const remaining = models.length - visible.length;

    return (
      <span className="people-creator-summary">
        {visible.map((model) => (
          <span key={model.id} className="people-creator-name">{model.name}</span>
        ))}
        {remaining > 0 && <span className="people-creator-more">+{remaining}</span>}
      </span>
    );
  }

  function renderGroupNode(group: TeamGroup, depth = 0) {
    const children = childrenByParent.get(group.id) ?? [];
    const selected = group.id === selectedGroupId;

    return (
      <div className="people-org-node" key={group.id}>
        <button
          type="button"
          className={`people-org-item${selected ? " active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => setSelectedGroupId(group.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setSelectedGroupId(group.id);

            if (options?.capabilities.canManageOrganization) {
              setGroupContextMenu({
                groupId: group.id,
                x: event.clientX,
                y: event.clientY,
              });
            }
          }}
        >
          <span className="people-org-branch">
            <span className={`people-org-icon${group.isRoot ? " root" : ""}`} aria-hidden="true">
              {group.isRoot ? "◆" : "•"}
            </span>
            <span className="people-org-name">{group.name}</span>
          </span>
          <span className="people-org-count">{groupPeopleCounts.get(group.id) ?? 0}</span>
        </button>

        {children.map((child) => renderGroupNode(child, depth + 1))}
      </div>
    );
  }

  const rootGroups = childrenByParent.get(null) ?? [];

  return (
    <div className="page people-page">
      <header className="page-header people-page-header">
        <div>
          <p className="page-eyebrow">Team management</p>
          <h2>People Management</h2>
          <p className="page-description">
            Organize employees by group, manage role and creator access, and control account status.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => openInvite(selectedGroupId)}
          disabled={!options?.capabilities.invitesAvailable}
        >
          Invite person
        </button>
      </header>

      {!options?.capabilities.invitesAvailable && !loading && (
        <div className="people-email-notice">
          <strong>Invitation sending is temporarily disabled.</strong>
          <span>Invitation email delivery is not configured for the current environment.</span>
        </div>
      )}

      <section className="people-management-shell">
        <aside className="people-organization-panel">
          <div className="people-org-header">
            <div>
              <span className="people-section-label">Organization</span>
              <strong>Team groups</strong>
            </div>
          </div>

          <div className="people-org-tree">
            {rootGroups.length
              ? rootGroups.map((group) => renderGroupNode(group))
              : <span className="people-empty-inline">No visible team groups.</span>}
          </div>

          {options?.capabilities.canManageOrganization && (
            <div className="people-org-help">Right-click a group for group actions.</div>
          )}
        </aside>

        <div className="people-directory">
          <div className="people-directory-header">
            <div>
              <span className="people-section-label">Employees</span>
              <div className="people-directory-title-row">
                <h3>{selectedGroup?.name ?? "Visible people"}</h3>
                <span className="people-result-count">
                  {filteredPeople.length} result{filteredPeople.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {selectedGroup && options?.capabilities.canManagePeople && (
              <button
                type="button"
                className="secondary-button people-add-employee"
                onClick={() => openInvite(selectedGroup.id)}
                disabled={!options.capabilities.invitesAvailable}
              >
                + Add employee
              </button>
            )}
          </div>

          <div className="people-filter-toolbar">
            <label className="people-search-field">
              <span className="sr-only">Search employees</span>
              <input
                className="search-input"
                type="search"
                placeholder="Search employee"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="people-filter-field">
              <span>Role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="ALL">All roles</option>
                {options?.roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </label>

            <label className="people-filter-field">
              <span>Creator</span>
              <select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}>
                <option value="ALL">All creators</option>
                {activeCreators.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </label>

            <label className="people-filter-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | PersonStatus)}
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING_SETUP">Pending setup</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>
            </label>

            <button
              type="button"
              className="people-reset-filters"
              onClick={resetFilters}
              disabled={!filtersActive}
            >
              Reset filters
            </button>
          </div>

          {selectedManageablePeople.length > 0 && (
            <div className="people-batch-bar">
              <div>
                <strong>{selectedManageablePeople.length} selected</strong>
                <span>Apply one change to the selected employees.</span>
              </div>
              <div className="people-batch-actions">
                <button type="button" className="secondary-button" onClick={() => openBatchAction("group")}>
                  Change group
                </button>
                <button type="button" className="secondary-button" onClick={() => openBatchAction("role")}>
                  Change role
                </button>
                <button type="button" className="text-button" onClick={() => setSelectedPersonIds([])}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {pageError && <div className="people-inline-error">{pageError}</div>}

          {loading ? (
            <div className="empty-state"><strong>Loading people…</strong></div>
          ) : filteredPeople.length === 0 ? (
            <div className="empty-state">
              <strong>No matching employees</strong>
              <span>Try changing the group or filters.</span>
            </div>
          ) : (
            <div className="people-table-wrap">
              <div className="people-table people-table-head">
                <span className="people-select-cell">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select visible employees"
                    checked={allVisibleSelected}
                    disabled={!visibleSelectableIds.length}
                    onChange={toggleAllVisiblePeople}
                  />
                </span>
                <span>Employee</span>
                <span>Assigned creators</span>
                <span>Role</span>
                <span>Status</span>
              </div>

              {filteredPeople.map((person) => {
                const manageable = canManagePerson(person);

                return (
                  <div
                    key={person.id}
                    className="people-table people-table-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => { void openPerson(person); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openPerson(person);
                      }
                    }}
                  >
                    <span className="people-select-cell" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${person.name}`}
                        checked={selectedPersonIds.includes(person.id)}
                        disabled={!manageable}
                        onChange={() => togglePersonSelection(person.id)}
                      />
                    </span>

                    <span className="people-person-cell">
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </span>
                    <span>{compactCreators(person.models)}</span>
                    <span className="people-role-cell">{compactRole(person.roles)}</span>
                    <span>
                      <span className={`people-status-badge ${person.status.toLowerCase()}`}>
                        {formatStatus(person.status)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {groupContextMenu && contextGroup && options?.capabilities.canManageOrganization && (
        <div
          className="people-group-context-menu"
          style={{ left: groupContextMenu.x, top: groupContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => openGroupAction("create", contextGroup)}>
            Add subgroup
          </button>
          {!contextGroup.isRoot && (
            <>
              <button type="button" role="menuitem" onClick={() => openGroupAction("rename", contextGroup)}>
                Rename group
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => openGroupAction("delete", contextGroup)}
              >
                Delete group
              </button>
            </>
          )}
        </div>
      )}

      {selectedPerson && (
        <div
          className="people-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedPerson(null);
          }}
        >
          <section className="people-detail-panel" role="dialog" aria-modal="true" aria-label="Employee details">
            <div className="people-detail-header people-profile-header">
              <div className="people-profile-identity">
                <span className="page-eyebrow">Profile</span>
                <div className="people-profile-title-row">
                  <h3>{selectedPerson.name}</h3>
                  <div className="people-profile-role-badges">
                    {selectedPerson.roles.map((role) => (
                      <span key={role.id} className="people-profile-role-badge">{role.name}</span>
                    ))}
                  </div>
                </div>
                <p>{selectedPerson.email}</p>
              </div>

              <div className="people-profile-header-actions">
                <div className={`people-profile-status ${selectedPerson.status.toLowerCase()}`}>
                  <strong>{formatStatus(selectedPerson.status)}</strong>
                </div>
                <button
                  type="button"
                  className="people-close"
                  aria-label="Close profile"
                  onClick={() => setSelectedPerson(null)}
                >
                  ×
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="empty-state"><strong>Loading profile…</strong></div>
            ) : (
              <div className="people-detail-body">
                <div className="people-account-facts">
                  <div className="people-account-fact">
                    <span>Team group</span>
                    <strong>{selectedPerson.teamGroup?.name ?? "Not assigned"}</strong>
                  </div>
                  <div className="people-account-fact">
                    <span>Created</span>
                    <strong>{formatTexasDateTime(selectedPerson.createdAt)}</strong>
                  </div>
                  <div className="people-account-fact">
                    <span>Email verified</span>
                    <strong>
                      {selectedPerson.emailVerifiedAt
                        ? formatTexasDateTime(selectedPerson.emailVerifiedAt)
                        : "Not verified"}
                    </strong>
                  </div>
                  {selectedPerson.security && (
                    <div className="people-account-fact">
                      <span>Last sign-in</span>
                      <strong>{formatTexasDateTime(selectedPerson.security.lastSignInAt)}</strong>
                    </div>
                  )}
                </div>

                <div className="people-detail-section">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>Roles & creator access</h4>
                      <p>Effective access is calculated from assigned roles, organization scope, and visible creators.</p>
                    </div>
                    <button
                      type="button"
                      className="primary-button people-edit-access"
                      onClick={openAccessEditor}
                      disabled={!canManageSelected}
                    >
                      Edit access
                    </button>
                  </div>

                  <div className="people-access-grid">
                    <div>
                      <span className="people-section-label">Roles</span>
                      <div className="people-chip-list">
                        {selectedPerson.roles.map((role) => (
                          <span key={role.id} className="people-chip">
                            {role.name} · {formatDataScope(role.dataScope)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="people-section-label">Creators</span>
                      <div className="people-chip-list">
                        {selectedPerson.models.length
                          ? selectedPerson.models.map((model) => (
                              <span key={model.id} className="people-chip">{model.name}</span>
                            ))
                          : <span className="people-empty-inline">No creator assignments</span>}
                      </div>
                    </div>
                  </div>

                  {!canManageSelected && (
                    <p className="people-scope-note">
                      {isSelectedSelf
                        ? "Your own role and creator assignments cannot be changed from People Management."
                        : "This profile is visible to you, but one or more assignments are outside the access you may change."}
                    </p>
                  )}
                </div>

                <div className="people-detail-section">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>Account access</h4>
                      <p>Security and sign-in controls for this employee account.</p>
                    </div>
                  </div>

                  <div className="people-account-action-stack">
                    {selectedPerson.status === "PENDING_SETUP" && (
                      <div className="people-account-action-card">
                        <div>
                          <strong>Invitation pending</strong>
                          <span>Send a fresh invitation if the original email was missed or expired.</span>
                        </div>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => { void resendInvite(selectedPerson); }}
                          disabled={saving || !canManageSelected || !options?.capabilities.invitesAvailable}
                        >
                          Resend invitation
                        </button>
                      </div>
                    )}

                    {options?.capabilities.canResetTwoFactor && (
                      <div className="people-account-action-card">
                        <div>
                          <strong>Reset two-factor authentication</strong>
                          <span>Use this if the employee can no longer complete their current verification method.</span>
                        </div>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => requestConfirmedAction(selectedPerson, "reset-2fa")}
                          disabled={saving}
                        >
                          Reset 2FA
                        </button>
                      </div>
                    )}

                    {selectedPerson.status === "ACTIVE"
                      && !isSelectedSelf
                      && options?.capabilities.canDeactivate && (
                      <div className="people-account-action-card warning">
                        <div>
                          <strong>Deactivate account</strong>
                          <span>Blocks sign-in and revokes active sessions while preserving access assignments and history.</span>
                        </div>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => requestConfirmedAction(selectedPerson, "deactivate")}
                          disabled={saving || !canManageSelected}
                        >
                          Deactivate account
                        </button>
                      </div>
                    )}

                    {selectedPerson.status === "DEACTIVATED" && options?.capabilities.isOwner && (
                      <div className="people-account-action-card restore">
                        <div>
                          <strong>Reactivate account</strong>
                          <span>Restores sign-in access. Previously revoked sessions stay revoked.</span>
                        </div>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => requestConfirmedAction(selectedPerson, "reactivate")}
                          disabled={saving}
                        >
                          Reactivate account
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {options?.capabilities.canDelete && selectedPerson.id !== user?.id && (
                  <div className="people-detail-section people-danger-zone">
                    <div className="people-detail-section-heading">
                      <div>
                        <h4>Danger zone</h4>
                        <p>Permanent deletion removes the account and tied QA history.</p>
                      </div>
                    </div>
                    <div className="people-danger-action">
                      <div>
                        <strong>Permanently delete account</strong>
                        <span>This cannot be undone and requires the account email as confirmation.</span>
                      </div>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => requestConfirmedAction(selectedPerson, "delete")}
                        disabled={saving}
                      >
                        Permanently delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {showInvite && (
        <div className="people-overlay">
          <form className="people-form-modal" onSubmit={submitInvite}>
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">New employee</span>
                <h3>Add employee</h3>
              </div>
              <button
                type="button"
                className="people-close"
                aria-label="Close invitation"
                onClick={() => {
                  setShowInvite(false);
                  resetInviteForm();
                }}
              >
                ×
              </button>
            </div>

            <div className="people-form-body">
              <label className="form-field">
                <span>Name</span>
                <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} autoFocus />
              </label>
              <label className="form-field">
                <span>Email</span>
                <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Team group</span>
                <select value={inviteTeamGroupId} onChange={(event) => setInviteTeamGroupId(event.target.value)}>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>

              <div className="people-option-section">
                <span className="people-section-label">Roles</span>
                <div className="people-option-grid">
                  {options?.roles.map((role) => (
                    <label key={role.id} className="people-check-option">
                      <input
                        type="checkbox"
                        checked={inviteRoleIds.includes(role.id)}
                        onChange={() => toggleSelection(inviteRoleIds, role.id, setInviteRoleIds)}
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <small>{formatDataScope(role.dataScope)}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="people-option-section">
                <span className="people-section-label">Creator assignments</span>
                <div className="people-option-grid">
                  {activeCreators.length
                    ? activeCreators.map((model) => (
                        <label key={model.id} className="people-check-option">
                          <input
                            type="checkbox"
                            checked={inviteModelIds.includes(model.id)}
                            onChange={() => toggleSelection(inviteModelIds, model.id, setInviteModelIds)}
                          />
                          <span><strong>{model.name}</strong><small>Active creator</small></span>
                        </label>
                      ))
                    : <span className="people-empty-inline">No assignable creators are currently available.</span>}
                </div>
              </div>
            </div>

            <div className="people-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowInvite(false);
                  resetInviteForm();
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAccessEditor && selectedPerson && (
        <div className="people-overlay">
          <form className="people-form-modal" onSubmit={saveAccess}>
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">Access control</span>
                <h3>Edit {selectedPerson.name}</h3>
              </div>
              <button
                type="button"
                className="people-close"
                aria-label="Close access editor"
                onClick={() => setShowAccessEditor(false)}
              >
                ×
              </button>
            </div>

            <div className="people-form-body">
              <label className="form-field">
                <span>Team group</span>
                <select value={accessTeamGroupId} onChange={(event) => setAccessTeamGroupId(event.target.value)}>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>

              <div className="people-option-section">
                <span className="people-section-label">Roles</span>
                <div className="people-option-grid">
                  {options?.roles.map((role) => (
                    <label key={role.id} className="people-check-option">
                      <input
                        type="checkbox"
                        checked={accessRoleIds.includes(role.id)}
                        onChange={() => toggleSelection(accessRoleIds, role.id, setAccessRoleIds)}
                      />
                      <span><strong>{role.name}</strong><small>{formatDataScope(role.dataScope)}</small></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="people-option-section">
                <div className="people-option-heading">
                  <div>
                    <span className="people-section-label">Creators</span>
                    <small>{accessModelIds.length} selected</small>
                  </div>
                  {!!activeAccessCreatorIds.length && (
                    <button type="button" className="text-button" onClick={toggleAllAccessCreators}>
                      {allActiveCreatorsSelected ? "Clear active creators" : "Select all creators"}
                    </button>
                  )}
                </div>

                <div className="people-option-grid">
                  {options?.models.map((model) => {
                    const checked = accessModelIds.includes(model.id);
                    return (
                      <label key={model.id} className="people-check-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!model.isActive && !checked}
                          onChange={() => toggleSelection(accessModelIds, model.id, setAccessModelIds)}
                        />
                        <span>
                          <strong>{model.name}</strong>
                          <small>{model.isActive ? "Active creator" : "Inactive creator · existing assignment"}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="people-modal-footer">
              <button type="button" className="secondary-button" onClick={() => setShowAccessEditor(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving…" : "Save access"}
              </button>
            </div>
          </form>
        </div>
      )}

      {batchAction && (
        <div className="people-overlay">
          <section className="people-confirm-modal">
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">Batch action</span>
                <h3>{batchAction === "group" ? "Change group" : "Change role"}</h3>
              </div>
              <button type="button" className="people-close" aria-label="Close batch action" onClick={() => setBatchAction(null)}>
                ×
              </button>
            </div>

            <div className="people-confirm-body">
              <p>This will update <strong>{selectedManageablePeople.length}</strong> selected employee{selectedManageablePeople.length === 1 ? "" : "s"}.</p>

              {batchAction === "group" ? (
                <label className="form-field">
                  <span>New team group</span>
                  <select value={batchGroupId} onChange={(event) => setBatchGroupId(event.target.value)}>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
              ) : (
                <>
                  <label className="form-field">
                    <span>New role</span>
                    <select value={batchRoleId} onChange={(event) => setBatchRoleId(event.target.value)}>
                      {options?.roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} · {formatDataScope(role.dataScope)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="people-confirm-impact">
                    <strong>Existing role assignments will be replaced.</strong>
                    <p>Creator assignments and team groups will stay unchanged.</p>
                  </div>
                </>
              )}
            </div>

            <div className="people-modal-footer">
              <button type="button" className="secondary-button" onClick={() => setBatchAction(null)} disabled={saving}>Cancel</button>
              <button type="button" className="primary-button" onClick={() => { void runBatchAction(); }} disabled={saving}>
                {saving ? "Updating…" : "Apply change"}
              </button>
            </div>
          </section>
        </div>
      )}

      {groupModalAction && groupActionTarget && (
        <div className="people-overlay">
          <form className="people-confirm-modal" onSubmit={submitGroupMutation}>
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">Organization</span>
                <h3>
                  {groupModalAction === "create"
                    ? "Add subgroup"
                    : groupModalAction === "rename"
                      ? "Rename group"
                      : "Delete group"}
                </h3>
              </div>
              <button
                type="button"
                className="people-close"
                aria-label="Close group editor"
                onClick={() => setGroupModalAction(null)}
              >
                ×
              </button>
            </div>

            <div className="people-confirm-body">
              {groupModalAction === "delete" ? (
                <div className="people-confirm-impact delete">
                  <strong>Delete {groupActionTarget.name}?</strong>
                  <p>A group can only be deleted when it has no members and no child groups.</p>
                </div>
              ) : (
                <>
                  {groupModalAction === "create" && (
                    <p>The new subgroup will be created under <strong>{groupActionTarget.name}</strong>.</p>
                  )}
                  <label className="form-field">
                    <span>Group name</span>
                    <input value={groupName} onChange={(event) => setGroupName(event.target.value)} autoFocus />
                  </label>
                </>
              )}
            </div>

            <div className="people-modal-footer">
              <button type="button" className="secondary-button" onClick={() => setGroupModalAction(null)} disabled={saving}>Cancel</button>
              <button type="submit" className={groupModalAction === "delete" ? "danger-button" : "primary-button"} disabled={saving}>
                {saving
                  ? "Working…"
                  : groupModalAction === "create"
                    ? "Create subgroup"
                    : groupModalAction === "rename"
                      ? "Save name"
                      : "Delete group"}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmAction && actionPerson && (
        <div className="people-overlay">
          <section className="people-confirm-modal">
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">
                  {confirmAction === "delete" ? "Danger zone" : confirmAction === "reset-2fa" ? "Account security" : "Account access"}
                </span>
                <h3>
                  {confirmAction === "delete"
                    ? `Permanently delete ${actionPerson.name}?`
                    : confirmAction === "deactivate"
                      ? `Deactivate ${actionPerson.name}?`
                      : confirmAction === "reactivate"
                        ? `Reactivate ${actionPerson.name}?`
                        : `Reset 2FA for ${actionPerson.name}?`}
                </h3>
              </div>
            </div>

            <div className="people-confirm-body">
              <div className={`people-confirm-impact ${confirmAction}`}>
                <strong>
                  {confirmAction === "delete"
                    ? "This action cannot be undone."
                    : confirmAction === "deactivate"
                      ? "This action takes effect immediately."
                      : confirmAction === "reactivate"
                        ? "This restores sign-in access."
                        : "The employee will need to set up verification again."}
                </strong>
                <p>
                  {confirmAction === "delete"
                    ? "The account identity, authentication records, linked chatter profile, and tied QA history will be permanently removed."
                    : confirmAction === "deactivate"
                      ? "New sign-ins will be blocked and every active session will be revoked. Roles, creator assignments, and history remain intact."
                      : confirmAction === "reactivate"
                        ? "The account can authenticate again, but previously revoked sessions will not return."
                        : "Existing sessions and outstanding verification challenges will be invalidated."}
                </p>
              </div>

              {confirmAction === "delete" && (
                <label className="form-field">
                  <span>Type {actionPerson.email} to confirm</span>
                  <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoFocus />
                </label>
              )}
            </div>

            <div className="people-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setConfirmAction(null);
                  setActionPerson(null);
                  setDeleteConfirmation("");
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={confirmAction === "delete" || confirmAction === "deactivate" ? "danger-button" : "primary-button"}
                onClick={() => { void runConfirmedAction(); }}
                disabled={saving || (confirmAction === "delete" && deleteConfirmation.trim().toLowerCase() !== actionPerson.email.toLowerCase())}
              >
                {saving
                  ? "Working…"
                  : confirmAction === "delete"
                    ? "Permanently delete"
                    : confirmAction === "deactivate"
                      ? "Deactivate account"
                      : confirmAction === "reactivate"
                        ? "Reactivate account"
                        : "Reset 2FA"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default PeoplePage;
