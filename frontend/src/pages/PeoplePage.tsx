import { useNavigationFilter } from "../lib/useNavigationFilter";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  PEOPLE_CHANGED_EVENT,
  apiRequest,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";

import "./PeoplePage.css";
import { formatDataScope } from "../lib/data-scope";

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
  sortOrder: number;
  color: string | null;
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
  creatorModels: (AssignableModel & { creatorUserId: string | null })[];
  roles: AssignableRole[];
  inviteRoles: AssignableRole[];
  models: AssignableModel[];
  inviteModels: AssignableModel[];
  organization: {
    rootGroupId: string;
    groups: TeamGroup[];
  };
  capabilities: {
    isOwner: boolean;
    canManagePeople: boolean;
    canCreatePeople: boolean;
    canAssignRoles: boolean;
    canManageOrganization: boolean;
    canDeactivate: boolean;
    canDelete: boolean;
    canResetTwoFactor: boolean;
    invitesAvailable: boolean;
  };
};

type BatchAction = "team" | "role" | null;
type TeamModalAction = "create" | "rename" | "delete" | null;

type TeamContextMenu = {
  teamId: string;
  x: number;
  y: number;
} | null;

const EMPTY_TEAMS: TeamGroup[] = [];
const PEOPLE_PAGE_SIZE = 10;
const EXISTING_PAGE_SIZE = 6;
const COLOR_PRESETS = [
  "#7C8CFF",
  "#48B8A0",
  "#E0A458",
  "#D16D8C",
  "#5B9BD5",
  "#8AA84F",
  "#C97842",
];

function formatStatus(status: PersonStatus) {
  if (status === "PENDING_SETUP") return "Pending setup";
  if (status === "DEACTIVATED") return "Deactivated";
  return "Active";
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  const [people, setPeople] = useState<Person[]>([]);
  const [options, setOptions] = useState<PeopleOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [search, setSearch] =
    useState(
      () =>
        searchParams.get(
          "search"
        ) ?? ""
    );

  const [roleFilter, setRoleFilter] =
    useState(
      () =>
        searchParams.get(
          "role"
        ) ?? "ALL"
    );

  const [creatorFilter, setCreatorFilter] =
    useState(
      () =>
        searchParams.get(
          "creator"
        ) ?? "ALL"
    );
  const [statusFilter, setStatusFilter] = useNavigationFilter<"ALL" | PersonStatus>(
    "status",
    ["ALL", "ACTIVE", "PENDING_SETUP", "DEACTIVATED"],
    "ALL"
  );
  const [selectedTeamId, setSelectedTeamId] =
    useState<string | null>(
      () =>
        searchParams.get(
          "team"
        )
    );

  const [collapsedTeamIds, setCollapsedTeamIds] = useState<string[]>([]);

  const [peoplePage, setPeoplePage] =
    useState(
      () => {
        const parsed =
          Number(
            searchParams.get(
              "page"
            )
          );

        return Number.isInteger(
          parsed
        ) &&
          parsed >
            1
          ? parsed
          : 1;
      }
    );

  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [inviteModelIds, setInviteModelIds] = useState<string[]>([]);
  const [inviteCreatorModelId, setInviteCreatorModelId] = useState("");
  const inviteIsCreator = options?.inviteRoles.some((role) =>
    role.systemKey === "MODEL" && inviteRoleIds.includes(role.id)) ?? false;

  const [showAddExisting, setShowAddExisting] = useState(false);
  const [existingSearch, setExistingSearch] = useState("");
  const [existingRoleFilter, setExistingRoleFilter] = useState("ALL");
  const [existingSelectedIds, setExistingSelectedIds] = useState<string[]>([]);
  const [existingPage, setExistingPage] = useState(1);


  const [batchAction, setBatchAction] = useState<BatchAction>(null);
  const [batchTeamId, setBatchTeamId] = useState("");
  const [batchRoleId, setBatchRoleId] = useState("");

  const [teamContextMenu, setTeamContextMenu] = useState<TeamContextMenu>(null);
  const teamContextMenuRef = useRef<HTMLDivElement | null>(null);
  const teamContextTriggerRef = useRef<HTMLElement | null>(null);
  const [reorderParentId, setReorderParentId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draggingTeamId, setDraggingTeamId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: "before" | "after" } | null>(null);
  const [teamModalAction, setTeamModalAction] = useState<TeamModalAction>(null);
  const [teamActionTargetId, setTeamActionTargetId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [showColorModal, setShowColorModal] = useState(false);
  const [teamColor, setTeamColor] = useState("#7C8CFF");

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
        : "Unable to load Employee Management.";
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
      void Promise.all([
        loadPeople(),
        loadOptions(),
      ]).catch((error) => {
        console.error(
          "Unable to refresh Employee Management after live update:",
          error
        );
      });
    };

    window.addEventListener(
      PEOPLE_CHANGED_EVENT,
      handlePeopleChanged
    );

    return () =>
      window.removeEventListener(
        PEOPLE_CHANGED_EVENT,
        handlePeopleChanged
      );
  }, [loadOptions, loadPeople]);

  useEffect(() => {
    if (!teamContextMenu) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && teamContextMenuRef.current?.contains(event.target)) return;
      setTeamContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setTeamContextMenu(null);
      teamContextTriggerRef.current?.focus();
    };
    const closeOnViewportChange = () => setTeamContextMenu(null);

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnViewportChange);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnViewportChange);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [teamContextMenu]);

  useLayoutEffect(() => {
    const menu = teamContextMenuRef.current;
    if (!teamContextMenu || !menu) return;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(teamContextMenu.x, window.innerWidth - bounds.width - 8));
    const top = Math.max(8, Math.min(teamContextMenu.y, window.innerHeight - bounds.height - 8));

    // Position before painting; this avoids a render loop and keeps the menu in view.
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [teamContextMenu]);

  const teams = options?.organization.groups ?? EMPTY_TEAMS;

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams]
  );

  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, TeamGroup[]>();

    for (const team of teams) {
      const parentId = team.parentId && teamById.has(team.parentId)
        ? team.parentId
        : null;
      const siblings = result.get(parentId) ?? [];
      siblings.push(team);
      result.set(parentId, siblings);
    }

    for (const siblings of result.values()) {
      siblings.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.name.localeCompare(right.name));
    }

    return result;
  }, [teamById, teams]);

  // Shared parent-first order for all team selectors, matching the organization tree.
  const orderedTeams = useMemo(() => {
    const result: TeamGroup[] = [];
    const seen = new Set<string>();
    const visit = (parentId: string | null) => {
      for (const team of childrenByParent.get(parentId) ?? []) {
        if (seen.has(team.id)) continue;
        seen.add(team.id);
        result.push(team);
        visit(team.id);
      }
    };
    visit(null);
    return result;
  }, [childrenByParent]);

  const defaultTeamId = useMemo(() => {
    const rootId = options?.organization.rootGroupId;
    if (rootId && teamById.has(rootId)) return rootId;
    return childrenByParent.get(null)?.[0]?.id ?? teams[0]?.id ?? null;
  }, [childrenByParent, options?.organization.rootGroupId, teamById, teams]);

  useEffect(() => {
    if (!teams.length) {
      setSelectedTeamId(null);
      return;
    }

    if (!selectedTeamId || !teamById.has(selectedTeamId)) {
      setSelectedTeamId(defaultTeamId);
    }
  }, [defaultTeamId, selectedTeamId, teamById, teams.length]);

  const selectedTeam = selectedTeamId
    ? teamById.get(selectedTeamId) ?? null
    : null;

  const organizationRootTeam =
    options?.organization.rootGroupId
      ? teamById.get(
          options.organization.rootGroupId
        ) ?? null
      : null;

  const selectedTeamScopeIds = useMemo(() => {
    if (!selectedTeamId) return new Set(teams.map((team) => team.id));
    return collectDescendants(childrenByParent, selectedTeamId);
  }, [childrenByParent, selectedTeamId, teams]);

  const effectiveTeamColor = useCallback((team: TeamGroup) => {
    let current: TeamGroup | undefined = team;
    const seen = new Set<string>();

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.color) return current.color;
      current = current.parentId ? teamById.get(current.parentId) : undefined;
    }

    return null;
  }, [teamById]);

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
      if (person.teamGroup && !selectedTeamScopeIds.has(person.teamGroup.id)) return false;
      if (!person.teamGroup && selectedTeamId) return false;
      if (roleFilter !== "ALL" && !person.roles.some((role) => role.id === roleFilter)) return false;
      if (creatorFilter !== "ALL" && !person.models.some((model) => model.id === creatorFilter)) return false;
      if (statusFilter !== "ALL" && person.status !== statusFilter) return false;

      if (!query) return true;

      return [
        person.name,
        person.email,
        person.teamGroup?.name ?? "",
        ...person.roles.map((role) => role.name),
        ...person.models.map((model) => model.name),
      ].join(" ").toLowerCase().includes(query);
    });
  }, [creatorFilter, people, roleFilter, search, selectedTeamId, selectedTeamScopeIds, statusFilter]);

  const existingCandidates = useMemo(() => {
    const query = existingSearch.trim().toLowerCase();

    return people.filter((person) => {
      if (!selectedTeam || selectedTeam.isRoot) return false;
      if (!canManagePerson(person)) return false;
      if (person.teamGroup?.id === selectedTeam.id) return false;
      if (existingRoleFilter !== "ALL" && !person.roles.some((role) => role.id === existingRoleFilter)) return false;
      if (!query) return true;

      return [
        person.name,
        person.email,
        person.teamGroup?.name ?? "",
        ...person.roles.map((role) => role.name),
      ].join(" ").toLowerCase().includes(query);
    });
  }, [canManagePerson, existingRoleFilter, existingSearch, people, selectedTeam]);

  const peopleFilterResetReadyRef =
    useRef(
      false
    );

  useEffect(() => {
    if (
      !peopleFilterResetReadyRef.current
    ) {
      peopleFilterResetReadyRef.current =
        true;

      return;
    }

    setPeoplePage(1);
  }, [creatorFilter, roleFilter, search, selectedTeamId, statusFilter]);

  useEffect(() => {
    setExistingPage(1);
  }, [existingRoleFilter, existingSearch, selectedTeamId]);

  const peoplePageCount = Math.max(1, Math.ceil(filteredPeople.length / PEOPLE_PAGE_SIZE));
  const existingPageCount = Math.max(1, Math.ceil(existingCandidates.length / EXISTING_PAGE_SIZE));

  useEffect(() => {
    setPeoplePage((current) => Math.min(current, peoplePageCount));
  }, [peoplePageCount]);

  useEffect(() => {
    setSearchParams(
      (current) => {
        const updated =
          new URLSearchParams(
            current
          );

        const normalizedSearch =
          search.trim();

        if (
          normalizedSearch
        ) {
          updated.set(
            "search",
            normalizedSearch
          );
        } else {
          updated.delete(
            "search"
          );
        }

        if (
          roleFilter !==
            "ALL"
        ) {
          updated.set(
            "role",
            roleFilter
          );
        } else {
          updated.delete(
            "role"
          );
        }

        if (
          creatorFilter !==
            "ALL"
        ) {
          updated.set(
            "creator",
            creatorFilter
          );
        } else {
          updated.delete(
            "creator"
          );
        }

        if (
          selectedTeamId
        ) {
          updated.set(
            "team",
            selectedTeamId
          );
        } else {
          updated.delete(
            "team"
          );
        }

        if (
          peoplePage >
            1
        ) {
          updated.set(
            "page",
            String(
              peoplePage
            )
          );
        } else {
          updated.delete(
            "page"
          );
        }

        updated.delete(
          "personId"
        );

        return updated.toString() ===
          current.toString()
          ? current
          : updated;
      },
      {
        replace:
          true,
      }
    );
  }, [
    creatorFilter,
    peoplePage,
    roleFilter,
    search,
    selectedTeamId,
    setSearchParams,
  ]);

  useEffect(() => {
    setExistingPage((current) => Math.min(current, existingPageCount));
  }, [existingPageCount]);

  const pagedPeople = useMemo(() => {
    const start = (peoplePage - 1) * PEOPLE_PAGE_SIZE;
    return filteredPeople.slice(start, start + PEOPLE_PAGE_SIZE);
  }, [filteredPeople, peoplePage]);

  const pagedExistingCandidates = useMemo(() => {
    const start = (existingPage - 1) * EXISTING_PAGE_SIZE;
    return existingCandidates.slice(start, start + EXISTING_PAGE_SIZE);
  }, [existingCandidates, existingPage]);

  const canUseBatchActions =
    Boolean(
      options?.capabilities.canManageOrganization ||
      options?.capabilities.canAssignRoles
    );

  const visibleSelectableIds = useMemo(
    () =>
      canUseBatchActions
        ? pagedPeople.filter(canManagePerson).map((person) => person.id)
        : [],
    [canManagePerson, canUseBatchActions, pagedPeople]
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
    () =>
      canUseBatchActions
        ? people.filter(
            (person) =>
              selectedPersonIds.includes(person.id) &&
              canManagePerson(person)
          )
        : [],
    [canManagePerson, canUseBatchActions, people, selectedPersonIds]
  );

  const teamPeopleCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const team of teams) {
      const scope = collectDescendants(childrenByParent, team.id);
      counts.set(
        team.id,
        people.filter((person) => person.teamGroup && scope.has(person.teamGroup.id)).length
      );
    }

    return counts;
  }, [childrenByParent, people, teams]);

  const activeCreators = useMemo(
    () => options?.models.filter((model) => model.isActive) ?? [],
    [options?.models]
  );

  const filtersActive = Boolean(
    search.trim()
    || roleFilter !== "ALL"
    || creatorFilter !== "ALL"
    || statusFilter !== "ALL"
    || selectedTeamId !== defaultTeamId
  );

  const teamActionTarget = teamActionTargetId
    ? teamById.get(teamActionTargetId) ?? null
    : null;

  const contextTeam = teamContextMenu
    ? teamById.get(teamContextMenu.teamId) ?? null
    : null;

  function toggleSelection(
    current: string[],
    value: string,
    setter: (value: string[]) => void
  ) {
    setter(current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  function toggleTeamCollapsed(teamId: string) {
    setCollapsedTeamIds((current) => current.includes(teamId)
      ? current.filter((id) => id !== teamId)
      : [...current, teamId]);
  }

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    setSelectedPersonIds([]);
  }

  function openTeamContextMenu(team: TeamGroup, x: number, y: number, trigger: HTMLElement) {
    if (team.isRoot || !options?.capabilities.canManageOrganization || reorderParentId) {
      setTeamContextMenu(null);
      return;
    }

    teamContextTriggerRef.current = trigger;
    selectTeam(team.id);
    setTeamContextMenu({ teamId: team.id, x, y });
  }

  function teamOptionLabel(team: TeamGroup) {
    if (team.isRoot) return team.name;

    const names = [team.name];
    let current = team.parentId ? teamById.get(team.parentId) : undefined;
    const seen = new Set<string>([team.id]);

    while (current && !current.isRoot && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? teamById.get(current.parentId) : undefined;
    }

    return names.join(" / ");
  }

  function handleTeamKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, team: TeamGroup) {
    if (event.target !== event.currentTarget) return;

    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      openTeamContextMenu(team, bounds.left + 12, bounds.bottom + 4, event.currentTarget);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTeam(team.id);
    }
  }

  function buildPeopleListPath() {
    const params =
      new URLSearchParams();

    const normalizedSearch =
      search.trim();

    if (
      normalizedSearch
    ) {
      params.set(
        "search",
        normalizedSearch
      );
    }

    if (
      roleFilter !==
        "ALL"
    ) {
      params.set(
        "role",
        roleFilter
      );
    }

    if (
      creatorFilter !==
        "ALL"
    ) {
      params.set(
        "creator",
        creatorFilter
      );
    }

    if (
      statusFilter !==
        "ALL"
    ) {
      params.set(
        "status",
        statusFilter
      );
    }

    if (
      selectedTeamId
    ) {
      params.set(
        "team",
        selectedTeamId
      );
    }

    if (
      peoplePage >
        1
    ) {
      params.set(
        "page",
        String(
          peoplePage
        )
      );
    }

    const query =
      params.toString();

    return query
      ? `/people?${query}`
      : "/people";
  }

  function openPersonPage(
    person:
      Person
  ) {
    const from =
      buildPeopleListPath();

    navigate(
      `/people/${encodeURIComponent(
        person.id
      )}?from=${encodeURIComponent(
        from
      )}`
    );
  }

  function resetFilters() {
    setSearch("");
    setRoleFilter("ALL");
    setCreatorFilter("ALL");
    setStatusFilter("ALL");
    setSelectedTeamId(defaultTeamId);
    setSelectedPersonIds([]);
    setPeoplePage(1);
  }

  function resetInviteForm(teamId?: string | null) {
    setInviteName("");
    setInviteEmail("");
    setInviteRoleIds([]);
    setInviteModelIds([]);
    setInviteCreatorModelId("");
    setInviteTeamId(teamId ?? selectedTeamId ?? defaultTeamId ?? "");
  }

  function openInvite(teamId?: string | null) {
    if (!options?.capabilities.canCreatePeople) return;

    resetInviteForm(teamId);
    setShowInvite(true);
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();

    if (!options?.capabilities.canCreatePeople) return;

    if (!options.capabilities.invitesAvailable) {
      toast.warning("Invitation email delivery is not available.", "Email setup pending");
      return;
    }

    if (!inviteName.trim() || !inviteEmail.trim() || !inviteTeamId || !inviteRoleIds.length) {
      toast.warning("Name, email, team, and at least one role are required.", "Check invitation");
      return;
    }

    try {
      setSaving(true);
      await apiRequest("/api/people/invite", {
        method: "POST",
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          teamGroupId: inviteTeamId,
          roleIds: inviteRoleIds,
          modelIds: inviteModelIds,
          creatorModelId: inviteIsCreator ? inviteCreatorModelId || null : undefined,
        }),
      });
      toast.success("The account invitation was created and sent.", "Invitation sent");
      setShowInvite(false);
      resetInviteForm();
      await Promise.all([loadPeople(), loadOptions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send the invitation.", "Invitation not sent");
    } finally {
      setSaving(false);
    }
  }

  function openExistingEmployeePicker() {
    if (
      !options?.capabilities.canManageOrganization ||
      !selectedTeam ||
      selectedTeam.isRoot
    ) return;
    setExistingSearch("");
    setExistingRoleFilter("ALL");
    setExistingSelectedIds([]);
    setExistingPage(1);
    setShowAddExisting(true);
  }

  async function addExistingEmployees() {
    if (
      !options?.capabilities.canManageOrganization ||
      !selectedTeam ||
      selectedTeam.isRoot ||
      !existingSelectedIds.length
    ) return;

    const selected = people.filter((person) => existingSelectedIds.includes(person.id));

    try {
      setSaving(true);
      const results = await Promise.allSettled(
        selected.map(async (person) => {
          await apiRequest(`/api/people/${person.id}/access`, {
            method: "PUT",
            body: JSON.stringify({
              teamGroupId: selectedTeam.id,
              roleIds: person.roles.map((role) => role.id),
              modelIds: person.models.map((model) => model.id),
            }),
          });
          return person.id;
        })
      );

      const failures = results.filter((result) => result.status === "rejected").length;
      await Promise.all([loadPeople(), loadOptions()]);

      if (failures) {
        toast.warning(
          `${selected.length - failures} employee${selected.length - failures === 1 ? "" : "s"} added; ${failures} could not be moved.`,
          "Partially completed"
        );
      } else {
        toast.success(
          `${selected.length} employee${selected.length === 1 ? "" : "s"} added to ${selectedTeam.name}.`,
          "Team updated"
        );
        setShowAddExisting(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add employees to the team.", "Team not updated");
    } finally {
      setSaving(false);
    }
  }

  function openBatchAction(action: Exclude<BatchAction, null>) {
    const allowed =
      action === "team"
        ? Boolean(options?.capabilities.canManageOrganization)
        : Boolean(options?.capabilities.canAssignRoles);

    if (!allowed || !selectedManageablePeople.length) return;
    if (action === "team") setBatchTeamId(selectedTeamId ?? defaultTeamId ?? "");
    else setBatchRoleId(options?.roles[0]?.id ?? "");
    setBatchAction(action);
  }

  async function runBatchAction() {
    const allowed =
      batchAction === "team"
        ? Boolean(options?.capabilities.canManageOrganization)
        : batchAction === "role"
          ? Boolean(options?.capabilities.canAssignRoles)
          : false;

    if (!allowed || !batchAction || !selectedManageablePeople.length) return;
    if (batchAction === "team" && !batchTeamId) return;
    if (batchAction === "role" && !batchRoleId) return;

    try {
      setSaving(true);
      const results = await Promise.allSettled(
        selectedManageablePeople.map(async (person) => {
          await apiRequest(`/api/people/${person.id}/access`, {
            method: "PUT",
            body: JSON.stringify({
              teamGroupId: batchAction === "team" ? batchTeamId : person.teamGroup?.id,
              roleIds: batchAction === "role" ? [batchRoleId] : person.roles.map((role) => role.id),
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
          batchAction === "team" ? "Selected employees were moved to the new team." : "Selected roles were updated.",
          "Batch update complete"
        );
        setBatchAction(null);
      } else {
        toast.warning(`${successfulIds.length} updated, ${failedCount} failed.`, "Batch update partially completed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete the batch update.", "Batch update failed");
    } finally {
      setSaving(false);
    }
  }


  function beginTeamReorder(team: TeamGroup) {
    setTeamContextMenu(null);
    if (!options?.capabilities.canManageOrganization || !team.parentId) return;
    const siblings = childrenByParent.get(team.parentId) ?? [];
    if (siblings.length < 2) {
      toast.warning("There must be at least two teams to rearrange.", "Reorder teams");
      return;
    }
    setReorderParentId(team.parentId);
    setDraftOrder(siblings.map((sibling) => sibling.id));
  }

  function dropTeam(id: string, edge: "before" | "after") {
    if (!draggingTeamId || draggingTeamId === id) return;
    setDraftOrder((previous) => {
      const from = previous.indexOf(draggingTeamId);
      const target = previous.indexOf(id);
      if (from < 0 || target < 0) return previous;
      let insertAt = target + (edge === "after" ? 1 : 0);
      const next = previous.slice();
      next.splice(from, 1);
      if (from < insertAt) insertAt -= 1;
      next.splice(insertAt, 0, draggingTeamId);
      return next;
    });
  }

  function cancelTeamReorder() {
    setReorderParentId(null);
    setDraftOrder([]);
    setDraggingTeamId(null);
    setDropTarget(null);
  }

  async function saveTeamReorder() {
    if (!reorderParentId) return;
    try {
      setSaving(true);
      await apiRequest("/api/team-groups/order", {
        method: "PUT",
        body: JSON.stringify({ parentId: reorderParentId, orderedIds: draftOrder }),
      });
      cancelTeamReorder();
      await loadOptions();
      toast.success("Team display order saved.", "Organization updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save team order.", "Reorder failed");
    } finally {
      setSaving(false);
    }
  }

  function openTeamAction(action: Exclude<TeamModalAction, null>, team: TeamGroup) {
    setTeamContextMenu(null);
    setTeamActionTargetId(team.id);
    setTeamModalAction(action);
    setTeamName(action === "rename" ? team.name : "");
  }

  function openTeamColor(team: TeamGroup) {
    setTeamContextMenu(null);
    setTeamActionTargetId(team.id);
    setTeamColor(team.color ?? effectiveTeamColor(team) ?? COLOR_PRESETS[0]);
    setShowColorModal(true);
  }

  async function saveTeamColor(event: FormEvent) {
    event.preventDefault();
    if (!teamActionTarget) return;

    try {
      setSaving(true);
      await apiRequest(`/api/team-groups/${teamActionTarget.id}/color`, {
        method: "PUT",
        body: JSON.stringify({ color: teamColor }),
      });
      await loadOptions();
      setShowColorModal(false);
      toast.success("Team color updated.", "Organization updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update team color.", "Color not updated");
    } finally {
      setSaving(false);
    }
  }

  async function clearTeamColor() {
    if (!teamActionTarget) return;

    try {
      setSaving(true);
      await apiRequest(`/api/team-groups/${teamActionTarget.id}/color`, {
        method: "PUT",
        body: JSON.stringify({ color: null }),
      });
      await loadOptions();
      setShowColorModal(false);
      toast.success("Custom color removed. This team now inherits its parent team's color.", "Organization updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to clear team color.", "Color not updated");
    } finally {
      setSaving(false);
    }
  }

  async function submitTeamMutation(event: FormEvent) {
    event.preventDefault();
    if (!teamActionTarget || !teamModalAction) return;

    if (teamModalAction !== "delete" && !teamName.trim()) {
      toast.warning("Enter a team name.", "Team name required");
      return;
    }

    try {
      setSaving(true);

      if (teamModalAction === "create") {
        await apiRequest("/api/team-groups", {
          method: "POST",
          body: JSON.stringify({
            name: teamName.trim(),
            parentGroupId: teamActionTarget.id,
          }),
        });
      } else if (teamModalAction === "rename") {
        await apiRequest(`/api/team-groups/${teamActionTarget.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: teamName.trim() }),
        });
      } else {
        await apiRequest(`/api/team-groups/${teamActionTarget.id}`, { method: "DELETE" });
        if (selectedTeamId === teamActionTarget.id) {
          setSelectedTeamId(teamActionTarget.parentId ?? defaultTeamId);
        }
      }

      await Promise.all([loadOptions(), loadPeople()]);
      toast.success(
        teamModalAction === "create"
          ? "Team created."
          : teamModalAction === "rename"
            ? "Team renamed."
            : "Team deleted.",
        "Organization updated"
      );
      setTeamModalAction(null);
      setTeamActionTargetId(null);
      setTeamName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the team.", "Organization not updated");
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
        {visible.map((model) => <span key={model.id} className="people-creator-name">{model.name}</span>)}
        {remaining > 0 && <span className="people-creator-more">+{remaining}</span>}
      </span>
    );
  }

  function renderTeamNode(team: TeamGroup, depth = 0) {
    const children = childrenByParent.get(team.id) ?? [];
    const orderingSiblings = reorderParentId === team.parentId && !team.isRoot;
    const hasChildren = children.length > 0;
    // In reorder mode, show only the ancestor path and the sibling rows being
    // arranged. Hide grandchildren without changing the saved collapse state.
    const showReorderChildren = !reorderParentId
      || team.id === reorderParentId
      || collectDescendants(childrenByParent, team.id).has(reorderParentId);
    const collapsed = reorderParentId ? !showReorderChildren : collapsedTeamIds.includes(team.id);
    const selected = team.id === selectedTeamId;
    const accent = effectiveTeamColor(team);
    const itemStyle: CSSProperties = {
      "--team-accent": accent ?? "var(--accent)",
    } as CSSProperties;

    return (
      <div
        className={`people-org-node${draggingTeamId === team.id ? " is-dragging" : ""}${dropTarget?.id === team.id && draggingTeamId !== team.id ? ` drop-${dropTarget.edge}` : ""}`}
        key={team.id}
        draggable={orderingSiblings}
        onDragStart={(event) => { if (!orderingSiblings) return; event.stopPropagation(); setDraggingTeamId(team.id); setDropTarget(null); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", team.id); }}
        onDragOver={(event) => { if (!orderingSiblings || !draggingTeamId) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; const rect = event.currentTarget.querySelector(".people-org-item")?.getBoundingClientRect(); if (rect && draggingTeamId !== team.id) setDropTarget({ id: team.id, edge: event.clientY < rect.top + rect.height / 2 ? "before" : "after" }); }}
        onDrop={(event) => { if (!orderingSiblings) return; event.preventDefault(); event.stopPropagation(); if (draggingTeamId && draggingTeamId !== team.id) { const rect = event.currentTarget.querySelector(".people-org-item")?.getBoundingClientRect(); dropTeam(team.id, rect && event.clientY >= rect.top + rect.height / 2 ? "after" : "before"); } setDraggingTeamId(null); setDropTarget(null); }}
        onDragEnd={(event) => { event.stopPropagation(); setDraggingTeamId(null); setDropTarget(null); }}
      >
        <div
          className={`people-org-item${selected ? " active" : ""}${accent ? " colored" : ""}${team.isRoot ? " root" : ""}`}
          style={itemStyle}
          data-depth={depth}
          role="button"
          tabIndex={0}
          aria-current={selected ? "true" : undefined}
          onClick={() => selectTeam(team.id)}
          onKeyDown={(event) => handleTeamKeyDown(event, team)}
          onContextMenu={(event) => {
            if (team.isRoot) {
              event.preventDefault();
              event.stopPropagation();
              setTeamContextMenu(null);
              return;
            }
            if (!options?.capabilities.canManageOrganization || reorderParentId) return;
            event.preventDefault();
            event.stopPropagation();
            openTeamContextMenu(team, event.clientX, event.clientY, event.currentTarget);
          }}
        >
          <span className="people-org-branch">
            {hasChildren ? (
              <button
                type="button"
                className={`people-org-caret${collapsed ? " collapsed" : ""}`}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${team.name}`}
                aria-expanded={!collapsed}
                disabled={Boolean(reorderParentId)}
                title={reorderParentId ? "Team branches are locked during reorder mode" : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!reorderParentId) toggleTeamCollapsed(team.id);
                }}
              >
                &#9662;
              </button>
            ) : (
              <span className="people-org-caret-space" aria-hidden="true" />
            )}

            <span className={`people-org-color${team.isRoot ? " root" : ""}`} aria-hidden="true" />
            <span className="people-org-name">{team.name}</span>
          </span>

          {orderingSiblings && <span className="people-org-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>}
          {options?.capabilities.canManageOrganization && !team.isRoot && !reorderParentId && (
            <button
              type="button"
              className="people-org-actions"
              aria-label={`Actions for ${team.name}`}
              aria-haspopup="menu"
              aria-expanded={teamContextMenu?.teamId === team.id}
              onClick={(event) => {
                event.stopPropagation();
                if (teamContextMenu?.teamId === team.id) {
                  setTeamContextMenu(null);
                  return;
                }
                const bounds = event.currentTarget.getBoundingClientRect();
                openTeamContextMenu(team, bounds.right - 190, bounds.bottom + 4, event.currentTarget);
              }}
            >
              &#8943;
            </button>
          )}
          <span className="people-org-count">{teamPeopleCounts.get(team.id) ?? 0}</span>
        </div>

        {hasChildren && !collapsed && (
          <div className={`people-org-children ${team.isRoot ? "root-children" : "nested-children"}`}>
            {(reorderParentId === team.id ? draftOrder.map((id) => children.find((child) => child.id === id)).filter((child): child is TeamGroup => Boolean(child)) : children).map((child) => renderTeamNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const rootTeams = childrenByParent.get(null) ?? [];
  const peopleRangeStart = filteredPeople.length ? (peoplePage - 1) * PEOPLE_PAGE_SIZE + 1 : 0;
  const peopleRangeEnd = Math.min(peoplePage * PEOPLE_PAGE_SIZE, filteredPeople.length);
  const existingRangeStart = existingCandidates.length ? (existingPage - 1) * EXISTING_PAGE_SIZE + 1 : 0;
  const existingRangeEnd = Math.min(existingPage * EXISTING_PAGE_SIZE, existingCandidates.length);

  return (
    <div className="page people-page">
      <header className="page-header people-page-header">
        <div>
          <p className="page-eyebrow">Team management</p>
          <h2>Employee Management</h2>
          
        </div>

        <button
          type="button"
          className="primary-button"
          hidden={!options?.capabilities.canCreatePeople}
          onClick={() => openInvite(selectedTeamId)}
          disabled={!options?.capabilities.invitesAvailable}
        >
          Invite person
        </button>
      </header>

      {options?.capabilities.canCreatePeople &&
        !options.capabilities.invitesAvailable &&
        !loading && (
        <div className="people-email-notice">
          <strong>Invitation sending is temporarily disabled.</strong>
          <span>Try again later.</span>
        </div>
      )}

      <section className="people-management-shell">
        <aside className="people-organization-panel">
          <div className="people-org-header">
            <div>
              <span className="people-section-label">Organization</span>
              <strong>Teams</strong>
            </div>

            {options?.capabilities.canManageOrganization && organizationRootTeam && (
              <button
                type="button"
                className="people-org-add"
                onClick={() => openTeamAction("create", organizationRootTeam)}
              >
                + Add team
              </button>
            )}
          </div>

          {reorderParentId && <div className="people-reorder-toolbar" role="region" aria-label="Reorder teams">
            <span>Drag teams to reorder them.</span>
            <button className="secondary-button" type="button" disabled={saving} onClick={cancelTeamReorder}>Cancel</button>
            <button className="primary-button" type="button" disabled={saving} onClick={() => void saveTeamReorder()}>{saving ? "Saving…" : "Save order"}</button>
          </div>}
          <div className="people-org-tree">
            {rootTeams.length
              ? rootTeams.map((team) => renderTeamNode(team))
              : <span className="people-empty-inline">No visible teams.</span>}
          </div>

          {options?.capabilities.canManageOrganization && (
            <div className="people-org-help">Right-click a team or use its actions button to make changes.</div>
          )}
        </aside>

        <div className="people-directory">
          <div className="people-directory-header">
            <div>
              <span className="people-section-label">Employees</span>
              <div className="people-directory-title-row">
                <h3>{selectedTeam?.name ?? "Visible people"}</h3>
                <span className="people-result-count">{filteredPeople.length} result{filteredPeople.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            {selectedTeam && !selectedTeam.isRoot && options?.capabilities.canManageOrganization && (
              <button type="button" className="secondary-button people-add-employee" onClick={openExistingEmployeePicker}>
                + Add employee to the team
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
                {options?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>

            <label className="people-filter-field">
              <span>Creator</span>
              <select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}>
                <option value="ALL">All creators</option>
                {activeCreators.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>

            <label className="people-filter-field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | PersonStatus)}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING_SETUP">Pending setup</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>
            </label>

            <button type="button" className="people-reset-filters" onClick={resetFilters} disabled={!filtersActive}>Reset filters</button>
          </div>

          {!!selectedManageablePeople.length && (
            <div className="people-batch-bar">
              <div>
                <strong>{selectedManageablePeople.length} selected</strong>
                <span>Apply one change to the selected employees.</span>
              </div>
              <div className="people-batch-actions">
                <button type="button" className="secondary-button" hidden={!options?.capabilities.canManageOrganization} onClick={() => openBatchAction("team")}>Change team</button>
                <button type="button" className="secondary-button" hidden={!options?.capabilities.canAssignRoles} onClick={() => openBatchAction("role")}>Change role</button>
                <button type="button" className="text-button" onClick={() => setSelectedPersonIds([])}>Clear</button>
              </div>
            </div>
          )}

          {pageError && <div className="people-inline-error">{pageError}</div>}

          {loading ? (
            <div className="empty-state"><strong>Loading people...</strong></div>
          ) : filteredPeople.length === 0 ? (
            <div className="empty-state">
              <strong>No matching employees</strong>
              <span>Try changing the team or filters.</span>
            </div>
          ) : (
            <div className="people-table-shell">
              <div className="people-table-wrap">
                <div className="people-table people-table-head">
                  <span className="people-select-cell">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      aria-label="Select employees on this page"
                      disabled={!canUseBatchActions}
                      onChange={() => {
                        setSelectedPersonIds((current) => allVisibleSelected
                          ? current.filter((id) => !visibleSelectableIds.includes(id))
                          : [...new Set([...current, ...visibleSelectableIds])]);
                      }}
                    />
                  </span>
                  <span>Employee</span>
                  <span>Assigned creators</span>
                  <span>Role</span>
                  <span>Status</span>
                </div>

                {pagedPeople.map((person) => (
                  <div
                    key={person.id}
                    className="people-table people-table-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openPersonPage(
                        person
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPersonPage(
                          person
                        );
                      }
                    }}
                  >
                    <span className="people-select-cell" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedPersonIds.includes(person.id)}
                        disabled={!canUseBatchActions || !canManagePerson(person)}
                        aria-label={`Select ${person.name}`}
                        onChange={() => toggleSelection(selectedPersonIds, person.id, setSelectedPersonIds)}
                      />
                    </span>
                    <span className="people-person-cell"><strong>{person.name}</strong><small>{person.email}</small></span>
                    <span>{compactCreators(person.models)}</span>
                    <span className="people-role-cell">{compactRole(person.roles)}</span>
                    <span><span className={`people-status-badge ${person.status.toLowerCase()}`}>{formatStatus(person.status)}</span></span>
                  </div>
                ))}
              </div>

              <div className="people-pagination" aria-label="Employee table pagination">
                <span>{peopleRangeStart}-{peopleRangeEnd} of {filteredPeople.length}</span>
                <div className="people-pagination-controls">
                  <button type="button" onClick={() => setPeoplePage((page) => Math.max(1, page - 1))} disabled={peoplePage <= 1} aria-label="Previous employee page">&lsaquo;</button>
                  <strong>Page {peoplePage} of {peoplePageCount}</strong>
                  <button type="button" onClick={() => setPeoplePage((page) => Math.min(peoplePageCount, page + 1))} disabled={peoplePage >= peoplePageCount} aria-label="Next employee page">&rsaquo;</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {teamContextMenu && contextTeam && !contextTeam.isRoot && options?.capabilities.canManageOrganization && !reorderParentId && (
        <div
          ref={teamContextMenuRef}
          className="people-context-menu"
          role="menu"
          aria-label={`Actions for ${contextTeam.name}`}
          style={{ left: teamContextMenu.x, top: teamContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!items.length) return;
              const nextIndex = currentIndex === -1
                ? (event.key === "ArrowDown" ? 0 : items.length - 1)
                : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[nextIndex]?.focus();
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              items[event.key === "Home" ? 0 : items.length - 1]?.focus();
            } else if (event.key === "Tab") {
              setTeamContextMenu(null);
            }
          }}
        >
          <button type="button" role="menuitem" onClick={() => beginTeamReorder(contextTeam)}>Reorder</button>
          <button type="button" role="menuitem" onClick={() => openTeamAction("create", contextTeam)}>Add subteam</button>
          <button type="button" role="menuitem" onClick={() => openTeamAction("rename", contextTeam)}>Rename team</button>
          <button type="button" role="menuitem" onClick={() => openTeamColor(contextTeam)}>Team color</button>
          <button type="button" role="menuitem" className="danger" onClick={() => openTeamAction("delete", contextTeam)}>Delete team</button>
        </div>
      )}

      {options?.capabilities.canManageOrganization &&
        showAddExisting &&
        selectedTeam &&
        !selectedTeam.isRoot && (
        <div className="people-overlay">
          <section className="people-existing-picker" role="dialog" aria-modal="true" aria-label={`Add employees to ${selectedTeam.name}`}>
            <div className="people-modal-header">
              <div><span className="page-eyebrow">Existing employees</span><h3>Add employee to {selectedTeam.name}</h3></div>
              <button type="button" className="people-close" onClick={() => setShowAddExisting(false)}>&times;</button>
            </div>

            <div className="people-existing-toolbar">
              <label>
                <span className="sr-only">Search existing employees</span>
                <input className="search-input" type="search" placeholder="Search employee" value={existingSearch} onChange={(event) => setExistingSearch(event.target.value)} />
              </label>
              <label className="people-filter-field">
                <span>Role</span>
                <select value={existingRoleFilter} onChange={(event) => setExistingRoleFilter(event.target.value)}>
                  <option value="ALL">All roles</option>
                  {options?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
            </div>

            <div className="people-existing-table-shell">
              <div className="people-existing-table-wrap">
                <div className="people-existing-table people-existing-head"><span /><span>Employee</span><span>Current team</span><span>Role</span></div>
                {pagedExistingCandidates.length ? pagedExistingCandidates.map((person) => (
                  <label key={person.id} className="people-existing-table people-existing-row">
                    <input type="checkbox" checked={existingSelectedIds.includes(person.id)} onChange={() => toggleSelection(existingSelectedIds, person.id, setExistingSelectedIds)} />
                    <span className="people-person-cell"><strong>{person.name}</strong><small>{person.email}</small></span>
                    <span className="people-role-cell">{person.teamGroup?.name ?? "Not assigned"}</span>
                    <span className="people-role-cell">{compactRole(person.roles)}</span>
                  </label>
                )) : <div className="empty-state"><strong>No eligible employees</strong><span>Try a different search or role filter.</span></div>}
              </div>

              <div className="people-pagination" aria-label="Existing employee pagination">
                <span>{existingRangeStart}-{existingRangeEnd} of {existingCandidates.length}</span>
                <div className="people-pagination-controls">
                  <button type="button" onClick={() => setExistingPage((page) => Math.max(1, page - 1))} disabled={existingPage <= 1} aria-label="Previous existing employee page">&lsaquo;</button>
                  <strong>Page {existingPage} of {existingPageCount}</strong>
                  <button type="button" onClick={() => setExistingPage((page) => Math.min(existingPageCount, page + 1))} disabled={existingPage >= existingPageCount} aria-label="Next existing employee page">&rsaquo;</button>
                </div>
              </div>
            </div>

            <div className="people-modal-footer">
              <button type="button" className="secondary-button" onClick={() => setShowAddExisting(false)} disabled={saving}>Cancel</button>
              <button type="button" className="primary-button" onClick={() => { void addExistingEmployees(); }} disabled={saving || !existingSelectedIds.length}>
                {saving ? "Adding..." : `Add selected${existingSelectedIds.length ? ` (${existingSelectedIds.length})` : ""}`}
              </button>
            </div>
          </section>
        </div>
      )}

      {options?.capabilities.canCreatePeople && showInvite && (
        <div className="people-overlay">
          <form className="people-form-modal" onSubmit={submitInvite}>
            <div className="people-modal-header">
              <div><span className="page-eyebrow">New account</span><h3>Invite person</h3></div>
              <button type="button" className="people-close" onClick={() => setShowInvite(false)} aria-label="Close invitation">&times;</button>
            </div>
            <div className="people-form-body">
              <label className="form-field"><span>Name</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} autoFocus /></label>
              <label className="form-field"><span>Email</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
              <label className="form-field people-team-select-field">
                <span>Team</span>
                <div className="people-select-shell">
                  <select value={inviteTeamId} onChange={(event) => setInviteTeamId(event.target.value)}>
                    {orderedTeams.map((team) => <option key={team.id} value={team.id}>{teamOptionLabel(team)}</option>)}
                  </select>
                  <span className="people-select-caret" aria-hidden="true">&#9662;</span>
                </div>
              </label>

              <div className="people-option-section">
                <span className="people-section-label">Roles</span>
                <div className="people-option-grid">{options?.inviteRoles.map((role) => (
                  <label key={role.id} className="people-check-option">
                    <input type="checkbox" checked={inviteRoleIds.includes(role.id)} onChange={() => toggleSelection(inviteRoleIds, role.id, setInviteRoleIds)} />
                    <span><strong>{role.name}</strong><small>{formatDataScope(role.dataScope)}</small></span>
                  </label>
                ))}</div>
              </div>

              {inviteIsCreator && (
                <label className="form-field">
                  <span>Creator profile</span>
                  <select value={inviteCreatorModelId} onChange={(event) => setInviteCreatorModelId(event.target.value)}>
                    <option value="">Create automatically from this account's name</option>
                    {(options.creatorModels ?? []).filter((model) => !model.creatorUserId).map((model) => (
                      <option key={model.id} value={model.id}>{model.name}{model.isActive ? "" : " (inactive)"}</option>
                    ))}
                  </select>
                  <small>This account will appear in Creator Management. Connect an existing profile to keep its staff assignments and history.</small>
                </label>
              )}

              <div className="people-option-section">
                <span className="people-section-label">Creator assignments</span>
                <div className="people-option-grid">{options?.inviteModels.map((model) => (
                  <label key={model.id} className="people-check-option">
                    <input type="checkbox" checked={inviteModelIds.includes(model.id)} onChange={() => toggleSelection(inviteModelIds, model.id, setInviteModelIds)} />
                    <span><strong>{model.name}</strong><small>Active creator</small></span>
                  </label>
                ))}</div>
              </div>
            </div>
            <div className="people-modal-footer">
              <button type="button" className="secondary-button" onClick={() => setShowInvite(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Sending..." : "Send invitation"}</button>
            </div>
          </form>
        </div>
      )}

      {batchAction &&
        (batchAction === "team"
          ? options?.capabilities.canManageOrganization
          : options?.capabilities.canAssignRoles) && (
        <div className="people-overlay">
          <section className="people-confirm-modal">
            <div className="people-modal-header"><div><span className="page-eyebrow">Batch action</span><h3>{batchAction === "team" ? "Change team" : "Change role"}</h3></div><button type="button" className="people-close" onClick={() => setBatchAction(null)}>&times;</button></div>
            <div className="people-confirm-body">
              <p>This will update <strong>{selectedManageablePeople.length}</strong> selected employee{selectedManageablePeople.length === 1 ? "" : "s"}.</p>
              {batchAction === "team" ? (
                <label className="form-field people-team-select-field">
                  <span>New team</span>
                  <div className="people-select-shell">
                    <select value={batchTeamId} onChange={(event) => setBatchTeamId(event.target.value)}>
                      {orderedTeams.map((team) => <option key={team.id} value={team.id}>{teamOptionLabel(team)}</option>)}
                    </select>
                    <span className="people-select-caret" aria-hidden="true">&#9662;</span>
                  </div>
                </label>
              ) : (
                <label className="form-field"><span>New role</span><select value={batchRoleId} onChange={(event) => setBatchRoleId(event.target.value)}>{options?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              )}
            </div>
            <div className="people-modal-footer"><button type="button" className="secondary-button" onClick={() => setBatchAction(null)} disabled={saving}>Cancel</button><button type="button" className="primary-button" onClick={() => { void runBatchAction(); }} disabled={saving}>{saving ? "Updating..." : "Apply change"}</button></div>
          </section>
        </div>
      )}

      {teamModalAction && teamActionTarget && (
        <div className="people-overlay">
          <form className="people-confirm-modal" onSubmit={submitTeamMutation}>
            <div className="people-modal-header"><div><span className="page-eyebrow">Organization</span><h3>{teamModalAction === "create" ? (teamActionTarget.isRoot ? "Add team" : "Add subteam") : teamModalAction === "rename" ? "Rename team" : "Delete team"}</h3></div><button type="button" className="people-close" onClick={() => setTeamModalAction(null)}>&times;</button></div>
            <div className="people-confirm-body">
              {teamModalAction === "delete" ? (
                <div className="people-confirm-impact delete"><strong>Delete {teamActionTarget.name}?</strong><p>A team can only be deleted when it has no employees and no subteams.</p></div>
              ) : (
                <><label className="form-field"><span>Team name</span><input value={teamName} onChange={(event) => setTeamName(event.target.value)} autoFocus /></label>{teamModalAction === "create" && <p>The new team will be created under <strong>{teamActionTarget.name}</strong>.</p>}</>
              )}
            </div>
            <div className="people-modal-footer"><button type="button" className="secondary-button" onClick={() => setTeamModalAction(null)} disabled={saving}>Cancel</button><button type="submit" className={teamModalAction === "delete" ? "danger-button" : "primary-button"} disabled={saving}>{saving ? "Working..." : teamModalAction === "create" ? "Create team" : teamModalAction === "rename" ? "Save name" : "Delete team"}</button></div>
          </form>
        </div>
      )}

      {showColorModal && teamActionTarget && (
        <div className="people-overlay">
          <form className="people-confirm-modal" onSubmit={saveTeamColor}>
            <div className="people-modal-header"><div><span className="page-eyebrow">Team appearance</span><h3>Color for {teamActionTarget.name}</h3></div><button type="button" className="people-close" onClick={() => setShowColorModal(false)}>&times;</button></div>
            <div className="people-confirm-body">
              <p>This color identifies the team and appears as its selected-row accent. Subteams inherit it until they receive their own color.</p>
              <div className="people-color-picker-row"><input type="color" value={teamColor} onChange={(event) => setTeamColor(event.target.value.toUpperCase())} /><strong>{teamColor}</strong></div>
              <div className="people-color-presets">{COLOR_PRESETS.map((color) => <button key={color} type="button" className={teamColor === color ? "active" : ""} style={{ background: color }} onClick={() => setTeamColor(color)} aria-label={`Use ${color}`} />)}</div>
            </div>
            <div className="people-modal-footer"><button type="button" className="text-button" onClick={() => { void clearTeamColor(); }} disabled={saving || !teamActionTarget.color}>Use parent team color</button><button type="button" className="secondary-button" onClick={() => setShowColorModal(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save color"}</button></div>
          </form>
        </div>
      )}

    </div>
  );
}

export default PeoplePage;
