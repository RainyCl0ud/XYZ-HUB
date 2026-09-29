import { useNavigationFilter } from "../lib/useNavigationFilter";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  PEOPLE_CHANGED_EVENT,
  apiRequest,
} from "../lib/api";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  useToast,
} from "../components/ToastProvider";

import "./PeoplePage.css";

type PersonStatus =
  | "PENDING_SETUP"
  | "ACTIVE"
  | "DEACTIVATED";

type PersonRole = {
  id: string;
  name: string;
  systemKey: string | null;
  rank: number | null;
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

type PersonSecurity = {
  lastSignInAt: string | null;
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
  security?: PersonSecurity;
};

type AssignableRole = {
  id: string;
  name: string;
  systemKey: string | null;
  rank: number | null;
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

type PeopleResponse = {
  people: Person[];
};

type PersonResponse = {
  person: Person;
};

type ConfirmAction =
  | "deactivate"
  | "reactivate"
  | "reset-2fa"
  | "delete"
  | null;

type BatchAction =
  | "group"
  | "role"
  | null;

type GroupModalAction =
  | "create"
  | "rename"
  | "delete"
  | null;

const TEXAS_TIME_ZONE =
  "America/Chicago";

function formatTexasDateTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: TEXAS_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }
  ).format(
    new Date(value)
  );
}

function formatStatus(
  status: PersonStatus
) {
  switch (status) {
    case "PENDING_SETUP":
      return "Pending setup";

    case "DEACTIVATED":
      return "Deactivated";

    case "ACTIVE":
    default:
      return "Active";
  }
}

function formatDataScope(
  value: string
) {
  switch (value) {
    case "ALL":
      return "All data";

    case "SELF_AND_TEAM":
      return "Self + subordinates";

    case "SELF":
      return "Self only";

    default:
      return value
        .toLowerCase()
        .replaceAll("_", " ");
  }
}

function PeoplePage() {
  const toast =
    useToast();

  const {
    user,
  } =
    useAuth();

  const [
    people,
    setPeople,
  ] =
    useState<Person[]>([]);

  const [
    options,
    setOptions,
  ] =
    useState<PeopleOptions | null>(
      null
    );

  const [
    selectedPerson,
    setSelectedPerson,
  ] =
    useState<Person | null>(
      null
    );

  const [
    actionPerson,
    setActionPerson,
  ] =
    useState<Person | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(
      false
    );

  const [
    pageError,
    setPageError,
  ] =
    useState(
      ""
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [
    creatorFilter,
    setCreatorFilter,
  ] =
    useState(
      "ALL"
    );

  const [
    selectedGroupId,
    setSelectedGroupId,
  ] =
    useState<string | null>(
      null
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useNavigationFilter<"ALL" | PersonStatus>(
      "status",
      [
        "ALL",
        "ACTIVE",
        "PENDING_SETUP",
        "DEACTIVATED",
      ],
      "ALL"
    );

  const [
    selectedPersonIds,
    setSelectedPersonIds,
  ] =
    useState<string[]>(
      []
    );

  const [
    openMoreId,
    setOpenMoreId,
  ] =
    useState<string | null>(
      null
    );

  const [
    showInvite,
    setShowInvite,
  ] =
    useState(
      false
    );

  const [
    inviteName,
    setInviteName,
  ] =
    useState(
      ""
    );

  const [
    inviteEmail,
    setInviteEmail,
  ] =
    useState(
      ""
    );

  const [
    inviteRoleIds,
    setInviteRoleIds,
  ] =
    useState<string[]>(
      []
    );

  const [
    inviteModelIds,
    setInviteModelIds,
  ] =
    useState<string[]>(
      []
    );

  const [
    inviteTeamGroupId,
    setInviteTeamGroupId,
  ] =
    useState(
      ""
    );

  const [
    showAccessEditor,
    setShowAccessEditor,
  ] =
    useState(
      false
    );

  const [
    accessRoleIds,
    setAccessRoleIds,
  ] =
    useState<string[]>(
      []
    );

  const [
    accessModelIds,
    setAccessModelIds,
  ] =
    useState<string[]>(
      []
    );

  const [
    accessTeamGroupId,
    setAccessTeamGroupId,
  ] =
    useState(
      ""
    );

  const [
    confirmAction,
    setConfirmAction,
  ] =
    useState<ConfirmAction>(
      null
    );

  const [
    deleteConfirmation,
    setDeleteConfirmation,
  ] =
    useState(
      ""
    );

  const [
    batchAction,
    setBatchAction,
  ] =
    useState<BatchAction>(
      null
    );

  const [
    batchGroupId,
    setBatchGroupId,
  ] =
    useState(
      ""
    );

  const [
    batchRoleId,
    setBatchRoleId,
  ] =
    useState(
      ""
    );

  const [
    groupModalAction,
    setGroupModalAction,
  ] =
    useState<GroupModalAction>(
      null
    );

  const [
    groupName,
    setGroupName,
  ] =
    useState(
      ""
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const headerCheckboxRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const loadPeople =
    useCallback(
      async () => {
        const response =
          await apiRequest<PeopleResponse>(
            "/api/people"
          );

        setPeople(
          response.people
        );

        return response.people;
      },
      []
    );

  const loadOptions =
    useCallback(
      async () => {
        const response =
          await apiRequest<PeopleOptions>(
            "/api/people/options"
          );

        setOptions(
          response
        );

        return response;
      },
      []
    );

  const loadPage =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setPageError(
            ""
          );

          await Promise.all([
            loadPeople(),
            loadOptions(),
          ]);
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load People Management.";

          setPageError(
            message
          );

          toast.error(
            message,
            "Unable to load people"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        loadOptions,
        loadPeople,
        toast,
      ]
    );

  useEffect(
    () => {
      void loadPage();
    },
    [
      loadPage,
    ]
  );

  useEffect(
    () => {
      const handlePeopleChanged =
        () => {
          void Promise.all([
            loadPeople(),
            loadOptions(),
          ])
            .then(
              ([
                refreshedPeople,
              ]) => {
                setSelectedPerson(
                  (
                    current
                  ) => {
                    if (
                      !current
                    ) {
                      return current;
                    }

                    return (
                      refreshedPeople.find(
                        (
                          person
                        ) =>
                          person.id ===
                          current.id
                      ) ??
                      current
                    );
                  }
                );
              }
            )
            .catch(
              (
                error
              ) => {
                console.error(
                  "Unable to refresh People Management after live update:",
                  error
                );
              }
            );
        };

      window.addEventListener(
        PEOPLE_CHANGED_EVENT,
        handlePeopleChanged
      );

      return () => {
        window.removeEventListener(
          PEOPLE_CHANGED_EVENT,
          handlePeopleChanged
        );
      };
    },
    [
      loadOptions,
      loadPeople,
    ]
  );

  useEffect(
    () => {
      const closeMenus =
        () => {
          setOpenMoreId(
            null
          );
        };

      document.addEventListener(
        "click",
        closeMenus
      );

      return () => {
        document.removeEventListener(
          "click",
          closeMenus
        );
      };
    },
    []
  );

  const organizationGroups =
    options?.organization.groups ??
    [];

  const groupById =
    useMemo(
      () =>
        new Map(
          organizationGroups.map(
            (
              group
            ) => [
              group.id,
              group,
            ]
          )
        ),
      [
        organizationGroups,
      ]
    );

  const groupChildren =
    useMemo(
      () => {
        const map =
          new Map<string | null, TeamGroup[]>();

        for (
          const group
          of organizationGroups
        ) {
          const parentKey =
            group.parentId &&
            groupById.has(
              group.parentId
            )
              ? group.parentId
              : null;

          const children =
            map.get(
              parentKey
            ) ??
            [];

          children.push(
            group
          );

          map.set(
            parentKey,
            children
          );
        }

        for (
          const children
          of map.values()
        ) {
          children.sort(
            (
              left,
              right
            ) =>
              left.name.localeCompare(
                right.name
              )
          );
        }

        return map;
      },
      [
        groupById,
        organizationGroups,
      ]
    );

  const defaultGroupId =
    useMemo(
      () => {
        const rootId =
          options?.organization
            .rootGroupId;

        if (
          rootId &&
          groupById.has(
            rootId
          )
        ) {
          return rootId;
        }

        return (
          groupChildren.get(
            null
          )?.[0]?.id ??
          organizationGroups[0]?.id ??
          null
        );
      },
      [
        groupById,
        groupChildren,
        options,
        organizationGroups,
      ]
    );

  useEffect(
    () => {
      if (
        organizationGroups.length ===
        0
      ) {
        setSelectedGroupId(
          null
        );

        return;
      }

      if (
        !selectedGroupId ||
        !groupById.has(
          selectedGroupId
        )
      ) {
        setSelectedGroupId(
          defaultGroupId
        );
      }
    },
    [
      defaultGroupId,
      groupById,
      organizationGroups.length,
      selectedGroupId,
    ]
  );

  function getDescendantGroupIds(
    rootGroupId: string
  ) {
    const ids =
      new Set<string>([
        rootGroupId,
      ]);

    const stack = [
      rootGroupId,
    ];

    while (
      stack.length >
      0
    ) {
      const current =
        stack.pop();

      if (
        !current
      ) {
        continue;
      }

      const children =
        groupChildren.get(
          current
        ) ??
        [];

      for (
        const child
        of children
      ) {
        if (
          !ids.has(
            child.id
          )
        ) {
          ids.add(
            child.id
          );

          stack.push(
            child.id
          );
        }
      }
    }

    return ids;
  }

  const selectedGroupScopeIds =
    useMemo(
      () => {
        if (
          !selectedGroupId
        ) {
          return new Set(
            organizationGroups.map(
              (
                group
              ) =>
                group.id
            )
          );
        }

        const ids =
          new Set<string>([
            selectedGroupId,
          ]);

        const stack = [
          selectedGroupId,
        ];

        while (
          stack.length >
          0
        ) {
          const current =
            stack.pop();

          if (
            !current
          ) {
            continue;
          }

          const children =
            groupChildren.get(
              current
            ) ??
            [];

          for (
            const child
            of children
          ) {
            if (
              !ids.has(
                child.id
              )
            ) {
              ids.add(
                child.id
              );

              stack.push(
                child.id
              );
            }
          }
        }

        return ids;
      },
      [
        groupChildren,
        organizationGroups,
        selectedGroupId,
      ]
    );

  const activeAssignableCreators =
    useMemo(
      () =>
        options?.models.filter(
          (
            model
          ) =>
            model.isActive
        ) ??
        [],
      [
        options,
      ]
    );

  const assignableRoleIds =
    useMemo(
      () =>
        new Set(
          options?.roles.map(
            (
              role
            ) =>
              role.id
          ) ??
          []
        ),
      [
        options,
      ]
    );

  const assignableModelIds =
    useMemo(
      () =>
        new Set(
          options?.models.map(
            (
              model
            ) =>
              model.id
          ) ??
          []
        ),
      [
        options,
      ]
    );

  function canManagePerson(
    person: Person
  ) {
    if (
      person.id ===
      user?.id
    ) {
      return false;
    }

    return (
      person.roles.every(
        (
          role
        ) =>
          assignableRoleIds.has(
            role.id
          )
      ) &&
      person.models.every(
        (
          model
        ) =>
          assignableModelIds.has(
            model.id
          )
      )
    );
  }

  const filteredPeople =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return people.filter(
          (
            person
          ) => {
            if (
              person.teamGroup &&
              !selectedGroupScopeIds.has(
                person.teamGroup.id
              )
            ) {
              return false;
            }

            if (
              !person.teamGroup &&
              selectedGroupId
            ) {
              return false;
            }

            if (
              statusFilter !==
                "ALL" &&
              person.status !==
                statusFilter
            ) {
              return false;
            }

            if (
              creatorFilter !==
                "ALL" &&
              !person.models.some(
                (
                  model
                ) =>
                  model.id ===
                  creatorFilter
              )
            ) {
              return false;
            }

            if (
              !query
            ) {
              return true;
            }

            const searchable = [
              person.name,
              person.email,
              person.status,
              person.teamGroup?.name ??
                "",
              ...person.roles.map(
                (
                  role
                ) =>
                  role.name
              ),
              ...person.models.map(
                (
                  model
                ) =>
                  model.name
              ),
            ]
              .join(
                " "
              )
              .toLowerCase();

            return searchable.includes(
              query
            );
          }
        );
      },
      [
        creatorFilter,
        people,
        search,
        selectedGroupId,
        selectedGroupScopeIds,
        statusFilter,
      ]
    );

  const visibleSelectableIds =
    useMemo(
      () =>
        filteredPeople
          .filter(
            canManagePerson
          )
          .map(
            (
              person
            ) =>
              person.id
          ),
      [
        filteredPeople,
        assignableModelIds,
        assignableRoleIds,
        user?.id,
      ]
    );

  const allVisibleSelected =
    visibleSelectableIds.length >
      0 &&
    visibleSelectableIds.every(
      (
        id
      ) =>
        selectedPersonIds.includes(
          id
        )
    );

  const someVisibleSelected =
    visibleSelectableIds.some(
      (
        id
      ) =>
        selectedPersonIds.includes(
          id
        )
    );

  useEffect(
    () => {
      if (
        headerCheckboxRef.current
      ) {
        headerCheckboxRef.current.indeterminate =
          someVisibleSelected &&
          !allVisibleSelected;
      }
    },
    [
      allVisibleSelected,
      someVisibleSelected,
    ]
  );

  useEffect(
    () => {
      const existingIds =
        new Set(
          people.map(
            (
              person
            ) =>
              person.id
          )
        );

      setSelectedPersonIds(
        (
          current
        ) =>
          current.filter(
            (
              id
            ) =>
              existingIds.has(
                id
              )
          )
      );
    },
    [
      people,
    ]
  );

  const selectedGroup =
    selectedGroupId
      ? groupById.get(
          selectedGroupId
        ) ??
        null
      : null;

  const groupPeopleCounts =
    useMemo(
      () => {
        const result =
          new Map<string, number>();

        for (
          const group
          of organizationGroups
        ) {
          const ids =
            new Set<string>([
              group.id,
            ]);

          const stack = [
            group.id,
          ];

          while (
            stack.length >
            0
          ) {
            const current =
              stack.pop();

            if (
              !current
            ) {
              continue;
            }

            for (
              const child
              of groupChildren.get(
                current
              ) ??
              []
            ) {
              if (
                !ids.has(
                  child.id
                )
              ) {
                ids.add(
                  child.id
                );

                stack.push(
                  child.id
                );
              }
            }
          }

          result.set(
            group.id,
            people.filter(
              (
                person
              ) =>
                person.teamGroup &&
                ids.has(
                  person.teamGroup.id
                )
            ).length
          );
        }

        return result;
      },
      [
        groupChildren,
        organizationGroups,
        people,
      ]
    );

  const isSelectedSelf =
    selectedPerson?.id ===
    user?.id;

  const canManageSelected =
    Boolean(
      selectedPerson &&
      canManagePerson(
        selectedPerson
      )
    );

  const activeAccessCreatorIds =
    useMemo(
      () =>
        options?.models
          .filter(
            (
              model
            ) =>
              model.isActive
          )
          .map(
            (
              model
            ) =>
              model.id
          ) ??
        [],
      [
        options,
      ]
    );

  const allActiveCreatorsSelected =
    activeAccessCreatorIds.length >
      0 &&
    activeAccessCreatorIds.every(
      (
        modelId
      ) =>
        accessModelIds.includes(
          modelId
        )
    );

  const selectedManageablePeople =
    useMemo(
      () =>
        people.filter(
          (
            person
          ) =>
            selectedPersonIds.includes(
              person.id
            ) &&
            canManagePerson(
              person
            )
        ),
      [
        people,
        selectedPersonIds,
        assignableModelIds,
        assignableRoleIds,
        user?.id,
      ]
    );

  function toggleAllAccessCreators() {
    if (
      allActiveCreatorsSelected
    ) {
      setAccessModelIds(
        []
      );

      return;
    }

    const inactiveExistingIds =
      accessModelIds.filter(
        (
          modelId
        ) => {
          const model =
            options?.models.find(
              (
                item
              ) =>
                item.id ===
                modelId
            );

          return Boolean(
            model &&
            !model.isActive
          );
        }
      );

    setAccessModelIds([
      ...new Set([
        ...activeAccessCreatorIds,
        ...inactiveExistingIds,
      ]),
    ]);
  }

  async function openPerson(
    person: Person
  ) {
    try {
      setSelectedPerson(
        person
      );

      setDetailLoading(
        true
      );

      const response =
        await apiRequest<PersonResponse>(
          "/api/people/" +
            person.id
        );

      setSelectedPerson(
        response.person
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load the person.";

      toast.error(
        message,
        "Unable to load profile"
      );
    } finally {
      setDetailLoading(
        false
      );
    }
  }

  async function refreshPerson(
    userId: string
  ) {
    const [
      response,
      refreshedPeople,
      refreshedOptions,
    ] =
      await Promise.all([
        apiRequest<PersonResponse>(
          "/api/people/" +
            userId
        ),
        loadPeople(),
        loadOptions(),
      ]);

    setSelectedPerson(
      response.person
    );

    return {
      refreshedPeople,
      refreshedOptions,
    };
  }

  function toggleSelection(
    current: string[],
    value: string,
    setter: (
      value: string[]
    ) => void
  ) {
    setter(
      current.includes(
        value
      )
        ? current.filter(
            (
              item
            ) =>
              item !==
              value
          )
        : [
            ...current,
            value,
          ]
    );
  }

  function togglePersonSelection(
    personId: string
  ) {
    setSelectedPersonIds(
      (
        current
      ) =>
        current.includes(
          personId
        )
          ? current.filter(
              (
                id
              ) =>
                id !==
                personId
            )
          : [
              ...current,
              personId,
            ]
    );
  }

  function toggleAllVisiblePeople() {
    setSelectedPersonIds(
      (
        current
      ) => {
        if (
          allVisibleSelected
        ) {
          return current.filter(
            (
              id
            ) =>
              !visibleSelectableIds.includes(
                id
              )
          );
        }

        return [
          ...new Set([
            ...current,
            ...visibleSelectableIds,
          ]),
        ];
      }
    );
  }

  function resetFilters() {
    setSearch(
      ""
    );

    setCreatorFilter(
      "ALL"
    );

    setStatusFilter(
      "ALL"
    );

    setSelectedGroupId(
      defaultGroupId
    );

    setSelectedPersonIds(
      []
    );
  }

  function resetInviteForm() {
    setInviteName(
      ""
    );

    setInviteEmail(
      ""
    );

    setInviteRoleIds(
      []
    );

    setInviteModelIds(
      []
    );

    setInviteTeamGroupId(
      selectedGroupId ??
        defaultGroupId ??
        ""
    );
  }

  function openInviteForm() {
    resetInviteForm();

    setInviteTeamGroupId(
      selectedGroupId ??
        defaultGroupId ??
        ""
    );

    setShowInvite(
      true
    );
  }

  async function submitInvite(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      !options
        ?.capabilities
        .invitesAvailable
    ) {
      toast.warning(
        "Invitation email delivery is not available in the current environment.",
        "Email setup pending"
      );

      return;
    }

    if (
      !inviteName.trim() ||
      !inviteEmail.trim() ||
      inviteRoleIds.length ===
        0 ||
      !inviteTeamGroupId
    ) {
      toast.warning(
        "Name, email, team group, and at least one role are required.",
        "Check invitation"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        "/api/people/invite",
        {
          method: "POST",

          body:
            JSON.stringify({
              name:
                inviteName.trim(),

              email:
                inviteEmail.trim(),

              roleIds:
                inviteRoleIds,

              modelIds:
                inviteModelIds,

              teamGroupId:
                inviteTeamGroupId,
            }),
        }
      );

      toast.success(
        "The account invitation was created and sent.",
        "Invitation sent"
      );

      setShowInvite(
        false
      );

      resetInviteForm();

      await Promise.all([
        loadPeople(),
        loadOptions(),
      ]);
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to send the invitation.",
        "Invitation not sent"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function openAccessEditor() {
    if (
      !selectedPerson ||
      !canManageSelected
    ) {
      return;
    }

    setAccessRoleIds(
      selectedPerson.roles.map(
        (
          role
        ) =>
          role.id
      )
    );

    setAccessModelIds(
      selectedPerson.models.map(
        (
          model
        ) =>
          model.id
      )
    );

    setAccessTeamGroupId(
      selectedPerson.teamGroup?.id ??
        selectedGroupId ??
        defaultGroupId ??
        ""
    );

    setShowAccessEditor(
      true
    );
  }

  async function saveAccess(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      !selectedPerson
    ) {
      return;
    }

    if (
      accessRoleIds.length ===
      0
    ) {
      toast.warning(
        "At least one role must remain assigned.",
        "Role required"
      );

      return;
    }

    if (
      !accessTeamGroupId
    ) {
      toast.warning(
        "A team group is required.",
        "Group required"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        "/api/people/" +
          selectedPerson.id +
          "/access",
        {
          method: "PUT",

          body:
            JSON.stringify({
              roleIds:
                accessRoleIds,

              modelIds:
                accessModelIds,

              teamGroupId:
                accessTeamGroupId,
            }),
        }
      );

      await refreshPerson(
        selectedPerson.id
      );

      setShowAccessEditor(
        false
      );

      toast.success(
        "Role, creator, and team access were updated.",
        "Access updated"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update access.",
        "Access not updated"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function resendInvite(
    person: Person
  ) {
    if (
      !options
        ?.capabilities
        .invitesAvailable
    ) {
      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        "/api/people/" +
          person.id +
          "/resend-invite",
        {
          method: "POST",
        }
      );

      const refreshedPeople =
        await loadPeople();

      if (
        selectedPerson?.id ===
        person.id
      ) {
        const refreshed =
          refreshedPeople.find(
            (
              item
            ) =>
              item.id ===
              person.id
          );

        if (
          refreshed
        ) {
          await openPerson(
            refreshed
          );
        }
      }

      toast.success(
        "A fresh invitation was sent.",
        "Invitation resent"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to resend the invitation.",
        "Invitation not resent"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function requestConfirmedAction(
    person: Person,
    action: Exclude<
      ConfirmAction,
      null
    >
  ) {
    setActionPerson(
      person
    );

    setConfirmAction(
      action
    );

    setDeleteConfirmation(
      ""
    );

    setOpenMoreId(
      null
    );
  }

  async function runConfirmedAction() {
    if (
      !actionPerson ||
      !confirmAction
    ) {
      return;
    }

    try {
      setSaving(
        true
      );

      if (
        confirmAction ===
        "delete"
      ) {
        await apiRequest(
          "/api/people/" +
            actionPerson.id,
          {
            method: "DELETE",

            body:
              JSON.stringify({
                confirmEmail:
                  deleteConfirmation,
              }),
          }
        );

        toast.success(
          "The user and tied QA history were permanently deleted.",
          "User deleted"
        );

        if (
          selectedPerson?.id ===
          actionPerson.id
        ) {
          setSelectedPerson(
            null
          );
        }

        setSelectedPersonIds(
          (
            current
          ) =>
            current.filter(
              (
                id
              ) =>
                id !==
                actionPerson.id
            )
        );

        await Promise.all([
          loadPeople(),
          loadOptions(),
        ]);
      } else {
        const endpoint =
          confirmAction ===
          "deactivate"
            ? "deactivate"
            : confirmAction ===
                "reactivate"
              ? "reactivate"
              : "reset-2fa";

        await apiRequest(
          "/api/people/" +
            actionPerson.id +
            "/" +
            endpoint,
          {
            method: "POST",
          }
        );

        const refreshedPeople =
          await loadPeople();

        if (
          selectedPerson?.id ===
          actionPerson.id
        ) {
          const refreshed =
            refreshedPeople.find(
              (
                person
              ) =>
                person.id ===
                actionPerson.id
            );

          if (
            refreshed
          ) {
            await openPerson(
              refreshed
            );
          }
        }

        const message =
          confirmAction ===
          "deactivate"
            ? "The user was deactivated and their active sessions were revoked."
            : confirmAction ===
                "reactivate"
              ? "The user was reactivated."
              : "Two-factor authentication was reset and existing sessions were revoked.";

        toast.success(
          message,
          "People Management updated"
        );
      }

      setConfirmAction(
        null
      );

      setActionPerson(
        null
      );

      setDeleteConfirmation(
        ""
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to complete the action.",
        "Action failed"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function openBatchAction(
    action: Exclude<
      BatchAction,
      null
    >
  ) {
    if (
      selectedManageablePeople.length ===
      0
    ) {
      return;
    }

    if (
      action ===
      "group"
    ) {
      setBatchGroupId(
        selectedGroupId ??
          defaultGroupId ??
          ""
      );
    } else {
      setBatchRoleId(
        options?.roles[0]?.id ??
          ""
      );
    }

    setBatchAction(
      action
    );
  }

  async function runBatchAction() {
    if (
      !batchAction ||
      selectedManageablePeople.length ===
        0
    ) {
      return;
    }

    if (
      batchAction ===
        "group" &&
      !batchGroupId
    ) {
      toast.warning(
        "Choose a team group first.",
        "Group required"
      );

      return;
    }

    if (
      batchAction ===
        "role" &&
      !batchRoleId
    ) {
      toast.warning(
        "Choose a role first.",
        "Role required"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      const results =
        await Promise.allSettled(
          selectedManageablePeople.map(
            async (
              person
            ) => {
              if (
                batchAction ===
                "group"
              ) {
                await apiRequest(
                  "/api/team-groups/members/" +
                    person.id,
                  {
                    method: "PUT",

                    body:
                      JSON.stringify({
                        groupId:
                          batchGroupId,
                      }),
                  }
                );

                return person.id;
              }

              await apiRequest(
                "/api/people/" +
                  person.id +
                  "/access",
                {
                  method: "PUT",

                  body:
                    JSON.stringify({
                      roleIds: [
                        batchRoleId,
                      ],

                      modelIds:
                        person.models.map(
                          (
                            model
                          ) =>
                            model.id
                        ),
                    }),
                }
              );

              return person.id;
            }
          )
        );

      const successfulIds =
        results.flatMap(
          (
            result
          ) =>
            result.status ===
            "fulfilled"
              ? [
                  result.value,
                ]
              : []
        );

      const failedCount =
        results.length -
        successfulIds.length;

      setSelectedPersonIds(
        (
          current
        ) =>
          current.filter(
            (
              id
            ) =>
              !successfulIds.includes(
                id
              )
          )
      );

      await Promise.all([
        loadPeople(),
        loadOptions(),
      ]);

      if (
        failedCount ===
        0
      ) {
        toast.success(
          batchAction ===
            "group"
            ? "The selected people were moved to the new group."
            : "The selected people's roles were updated.",
          "Batch update complete"
        );

        setBatchAction(
          null
        );
      } else {
        toast.warning(
          String(
            successfulIds.length
          ) +
            " updated, " +
            String(
              failedCount
            ) +
            " could not be updated. Failed rows remain selected.",
          "Batch update partially completed"
        );
      }
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to complete the batch update.",
        "Batch update failed"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function openGroupModal(
    action: Exclude<
      GroupModalAction,
      null
    >
  ) {
    if (
      !selectedGroup
    ) {
      return;
    }

    setGroupModalAction(
      action
    );

    setGroupName(
      action ===
        "rename"
        ? selectedGroup.name
        : ""
    );
  }

  async function submitGroupMutation(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      !selectedGroup ||
      !groupModalAction
    ) {
      return;
    }

    if (
      groupModalAction !==
        "delete" &&
      !groupName.trim()
    ) {
      toast.warning(
        "Enter a group name.",
        "Group name required"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      if (
        groupModalAction ===
        "create"
      ) {
        await apiRequest(
          "/api/team-groups",
          {
            method: "POST",

            body:
              JSON.stringify({
                name:
                  groupName.trim(),

                parentGroupId:
                  selectedGroup.id,
              }),
          }
        );
      } else if (
        groupModalAction ===
        "rename"
      ) {
        await apiRequest(
          "/api/team-groups/" +
            selectedGroup.id,
          {
            method: "PUT",

            body:
              JSON.stringify({
                name:
                  groupName.trim(),
              }),
          }
        );
      } else {
        const nextSelection =
          selectedGroup.parentId;

        await apiRequest(
          "/api/team-groups/" +
            selectedGroup.id,
          {
            method: "DELETE",
          }
        );

        setSelectedGroupId(
          nextSelection
        );
      }

      const refreshed =
        await loadOptions();

      if (
        groupModalAction !==
        "delete"
      ) {
        const stillExists =
          refreshed.organization.groups.some(
            (
              group
            ) =>
              group.id ===
              selectedGroup.id
          );

        if (
          !stillExists
        ) {
          setSelectedGroupId(
            refreshed.organization
              .rootGroupId
          );
        }
      }

      await loadPeople();

      toast.success(
        groupModalAction ===
          "create"
          ? "Subgroup created."
          : groupModalAction ===
              "rename"
            ? "Group renamed."
            : "Group deleted.",
        "Organization updated"
      );

      setGroupModalAction(
        null
      );

      setGroupName(
        ""
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the organization.",
        "Organization not updated"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function compactRoleText(
    roles: PersonRole[]
  ) {
    if (
      roles.length ===
      0
    ) {
      return "No role";
    }

    if (
      roles.length ===
      1
    ) {
      return roles[0].name;
    }

    return (
      roles[0].name +
      " +" +
      String(
        roles.length -
        1
      )
    );
  }

  function renderCreatorNames(
    models: PersonModel[]
  ) {
    if (
      models.length ===
      0
    ) {
      return (
        <span className="people-muted-cell">
          No creator assignment
        </span>
      );
    }

    const visible =
      models.slice(
        0,
        2
      );

    const remainder =
      models.length -
      visible.length;

    return (
      <div className="people-creator-summary">
        {visible.map(
          (
            model
          ) => (
            <span
              key={
                model.id
              }
              className="people-creator-name"
            >
              {model.name}
            </span>
          )
        )}

        {remainder >
          0 && (
          <span className="people-creator-more">
            +
            {remainder}
          </span>
        )}
      </div>
    );
  }

  function renderGroupNode(
    group: TeamGroup,
    depth = 0
  ) {
    const children =
      groupChildren.get(
        group.id
      ) ??
      [];

    const selected =
      selectedGroupId ===
      group.id;

    return (
      <div
        key={
          group.id
        }
        className="people-org-node"
      >
        <button
          type="button"
          className={
            "people-org-item" +
            (
              selected
                ? " active"
                : ""
            )
          }
          style={{
            paddingLeft:
              String(
                12 +
                depth *
                  16
              ) +
              "px",
          }}
          onClick={() =>
            setSelectedGroupId(
              group.id
            )
          }
        >
          <span className="people-org-branch">
            <span
              className={
                "people-org-icon" +
                (
                  group.isRoot
                    ? " root"
                    : ""
                )
              }
              aria-hidden="true"
            >
              {group.isRoot
                ? "◆"
                : "•"}
            </span>

            <span className="people-org-name">
              {group.name}
            </span>
          </span>

          <span className="people-org-count">
            {groupPeopleCounts.get(
              group.id
            ) ??
              0}
          </span>
        </button>

        {children.map(
          (
            child
          ) =>
            renderGroupNode(
              child,
              depth +
                1
            )
        )}
      </div>
    );
  }

  const rootGroups =
    groupChildren.get(
      null
    ) ??
    [];

  const selectedCount =
    selectedManageablePeople.length;

  const filtersActive =
    Boolean(
      search.trim() ||
      creatorFilter !==
        "ALL" ||
      statusFilter !==
        "ALL" ||
      selectedGroupId !==
        defaultGroupId
    );

  return (
    <div className="page people-page">
      <header className="page-header people-page-header">
        <div>
          <p className="page-eyebrow">
            Team management
          </p>

          <h2>
            People Management
          </h2>

          <p className="page-description">
            Organize employees by group, manage role and creator access, and control account status.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={
            openInviteForm
          }
          disabled={
            !options
              ?.capabilities
              .invitesAvailable
          }
          title={
            options
              ?.capabilities
              .invitesAvailable
              ? "Invite a person"
              : "Invitation email delivery is not configured for this environment."
          }
        >
          Invite person
        </button>
      </header>

      {!options
        ?.capabilities
        .invitesAvailable &&
        !loading && (
          <div className="people-email-notice">
            <strong>
              Invitation sending is temporarily disabled.
            </strong>

            <span>
              Invitation email delivery is not configured for the current environment.
            </span>
          </div>
        )}

      <section className="people-management-shell">
        <aside className="people-organization-panel">
          <div className="people-org-header">
            <div>
              <span className="people-section-label">
                Organization
              </span>

              <strong>
                Team groups
              </strong>
            </div>

            {options
              ?.capabilities
              .canManageOrganization &&
              selectedGroup && (
                <button
                  type="button"
                  className="people-org-add"
                  onClick={() =>
                    openGroupModal(
                      "create"
                    )
                  }
                  aria-label={
                    "Add subgroup under " +
                    selectedGroup.name
                  }
                  title="Add subgroup"
                >
                  +
                </button>
              )}
          </div>

          <div className="people-org-tree">
            {rootGroups.length >
            0 ? (
              rootGroups.map(
                (
                  group
                ) =>
                  renderGroupNode(
                    group
                  )
              )
            ) : (
              <span className="people-empty-inline">
                No visible team groups.
              </span>
            )}
          </div>

          {options
            ?.capabilities
            .canManageOrganization &&
            selectedGroup && (
              <div className="people-org-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    openGroupModal(
                      "create"
                    )
                  }
                >
                  Add subgroup
                </button>

                {!selectedGroup.isRoot && (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        openGroupModal(
                          "rename"
                        )
                      }
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      className="text-button danger-text"
                      onClick={() =>
                        openGroupModal(
                          "delete"
                        )
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
        </aside>

        <div className="people-directory">
          <div className="people-directory-header">
            <div>
              <span className="people-section-label">
                Employees
              </span>

              <div className="people-directory-title-row">
                <h3>
                  {selectedGroup?.name ??
                    "Visible people"}
                </h3>

                <span className="people-result-count">
                  {filteredPeople.length}
                  {" "}
                  result
                  {filteredPeople.length ===
                  1
                    ? ""
                    : "s"}
                </span>
              </div>
            </div>
          </div>

          <div className="people-filter-toolbar">
            <label className="people-search-field">
              <span className="sr-only">
                Search employees
              </span>

              <input
                className="search-input"
                type="search"
                placeholder="Search employee"
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
            </label>

            <label className="people-filter-field">
              <span>
                Creator
              </span>

              <select
                value={
                  creatorFilter
                }
                onChange={(
                  event
                ) =>
                  setCreatorFilter(
                    event.target.value
                  )
                }
              >
                <option value="ALL">
                  All creators
                </option>

                {activeAssignableCreators.map(
                  (
                    model
                  ) => (
                    <option
                      key={
                        model.id
                      }
                      value={
                        model.id
                      }
                    >
                      {model.name}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="people-filter-field">
              <span>
                Status
              </span>

              <select
                value={
                  statusFilter
                }
                onChange={(
                  event
                ) =>
                  setStatusFilter(
                    event.target
                      .value as
                      | "ALL"
                      | PersonStatus
                  )
                }
              >
                <option value="ALL">
                  All statuses
                </option>

                <option value="ACTIVE">
                  Active
                </option>

                <option value="PENDING_SETUP">
                  Pending setup
                </option>

                <option value="DEACTIVATED">
                  Deactivated
                </option>
              </select>
            </label>

            <button
              type="button"
              className="people-reset-filters"
              onClick={
                resetFilters
              }
              disabled={
                !filtersActive
              }
            >
              Reset filters
            </button>
          </div>

          {selectedCount >
            0 && (
            <div className="people-batch-bar">
              <div>
                <strong>
                  {selectedCount}
                  {" "}
                  selected
                </strong>

                <span>
                  Apply one change to the selected employees.
                </span>
              </div>

              <div className="people-batch-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    openBatchAction(
                      "group"
                    )
                  }
                >
                  Change group
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    openBatchAction(
                      "role"
                    )
                  }
                >
                  Change role
                </button>

                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setSelectedPersonIds(
                      []
                    )
                  }
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {pageError && (
            <div className="people-inline-error">
              {pageError}
            </div>
          )}

          {loading ? (
            <div className="empty-state">
              <strong>
                Loading people…
              </strong>
            </div>
          ) : filteredPeople.length ===
            0 ? (
            <div className="empty-state">
              <strong>
                No matching employees
              </strong>

              <span>
                Try changing the group or filters.
              </span>
            </div>
          ) : (
            <div className="people-table-wrap">
              <div className="people-table people-table-head">
                <span className="people-select-cell">
                  <input
                    ref={
                      headerCheckboxRef
                    }
                    type="checkbox"
                    aria-label="Select visible employees"
                    checked={
                      allVisibleSelected
                    }
                    onChange={
                      toggleAllVisiblePeople
                    }
                    disabled={
                      visibleSelectableIds.length ===
                      0
                    }
                  />
                </span>

                <span>
                  Employee
                </span>

                <span>
                  Assigned creators
                </span>

                <span>
                  Role
                </span>

                <span>
                  Status
                </span>

                <span className="people-actions-heading">
                  Actions
                </span>
              </div>

              {filteredPeople.map(
                (
                  person
                ) => {
                  const manageable =
                    canManagePerson(
                      person
                    );

                  return (
                    <div
                      key={
                        person.id
                      }
                      className="people-table people-table-row"
                    >
                      <span className="people-select-cell">
                        <input
                          type="checkbox"
                          aria-label={
                            "Select " +
                            person.name
                          }
                          checked={
                            selectedPersonIds.includes(
                              person.id
                            )
                          }
                          disabled={
                            !manageable
                          }
                          onChange={() =>
                            togglePersonSelection(
                              person.id
                            )
                          }
                        />
                      </span>

                      <button
                        type="button"
                        className="people-person-cell people-person-link"
                        onClick={() => {
                          void openPerson(
                            person
                          );
                        }}
                      >
                        <strong>
                          {person.name}
                        </strong>

                        <small>
                          {person.email}
                        </small>
                      </button>

                      <span>
                        {renderCreatorNames(
                          person.models
                        )}
                      </span>

                      <span className="people-role-cell">
                        {compactRoleText(
                          person.roles
                        )}
                      </span>

                      <span>
                        <span
                          className={
                            "people-status-badge " +
                            person.status.toLowerCase()
                          }
                        >
                          {formatStatus(
                            person.status
                          )}
                        </span>
                      </span>

                      <span className="people-row-actions">
                        <button
                          type="button"
                          className="people-edit-button"
                          onClick={() => {
                            void openPerson(
                              person
                            );
                          }}
                        >
                          Edit
                        </button>

                        <span className="people-more-wrap">
                          <button
                            type="button"
                            className="people-more-button"
                            aria-label={
                              "More actions for " +
                              person.name
                            }
                            aria-expanded={
                              openMoreId ===
                              person.id
                            }
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              setOpenMoreId(
                                (
                                  current
                                ) =>
                                  current ===
                                  person.id
                                    ? null
                                    : person.id
                              );
                            }}
                          >
                            •••
                          </button>

                          {openMoreId ===
                            person.id && (
                            <div
                              className="people-more-menu"
                              onClick={(
                                event
                              ) =>
                                event.stopPropagation()
                              }
                            >
                              {person.status ===
                                "PENDING_SETUP" &&
                                options
                                  ?.capabilities
                                  .invitesAvailable &&
                                manageable && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMoreId(
                                        null
                                      );

                                      void resendInvite(
                                        person
                                      );
                                    }}
                                  >
                                    Resend invitation
                                  </button>
                                )}

                              {options
                                ?.capabilities
                                .canResetTwoFactor && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestConfirmedAction(
                                        person,
                                        "reset-2fa"
                                      )
                                    }
                                  >
                                    Reset 2FA
                                  </button>
                                )}

                              {person.status ===
                                "ACTIVE" &&
                                options
                                  ?.capabilities
                                  .canDeactivate &&
                                manageable && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestConfirmedAction(
                                        person,
                                        "deactivate"
                                      )
                                    }
                                  >
                                    Deactivate account
                                  </button>
                                )}

                              {person.status ===
                                "DEACTIVATED" &&
                                options
                                  ?.capabilities
                                  .isOwner && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestConfirmedAction(
                                        person,
                                        "reactivate"
                                      )
                                    }
                                  >
                                    Reactivate account
                                  </button>
                                )}

                              {options
                                ?.capabilities
                                .canDelete && (
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() =>
                                      requestConfirmedAction(
                                        person,
                                        "delete"
                                      )
                                    }
                                  >
                                    Permanently delete
                                  </button>
                                )}

                              {!manageable &&
                                !options
                                  ?.capabilities
                                  .canResetTwoFactor &&
                                !options
                                  ?.capabilities
                                  .canDelete && (
                                  <span className="people-more-empty">
                                    No available actions
                                  </span>
                                )}
                            </div>
                          )}
                        </span>
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </section>

      {selectedPerson && (
        <div
          className="people-overlay"
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedPerson(
                null
              );
            }
          }}
        >
          <section
            className="people-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Person details"
          >
            <div className="people-detail-header people-profile-header">
              <div className="people-profile-identity">
                <span className="page-eyebrow">
                  Profile
                </span>

                <div className="people-profile-title-row">
                  <h3>
                    {selectedPerson.name}
                  </h3>

                  <div className="people-profile-role-badges">
                    {selectedPerson.roles.map(
                      (
                        role
                      ) => (
                        <span
                          key={
                            role.id
                          }
                          className="people-profile-role-badge"
                        >
                          {role.name}
                        </span>
                      )
                    )}
                  </div>
                </div>

                <p>
                  {selectedPerson.email}
                </p>
              </div>

              <div className="people-profile-header-actions">
                <div
                  className={
                    "people-profile-status " +
                    selectedPerson.status.toLowerCase()
                  }
                >
                  <span>
                    Account status
                  </span>

                  <strong>
                    {formatStatus(
                      selectedPerson.status
                    )}
                  </strong>
                </div>

                <button
                  type="button"
                  className="people-close"
                  onClick={() =>
                    setSelectedPerson(
                      null
                    )
                  }
                  aria-label="Close profile"
                >
                  ×
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="empty-state">
                <strong>
                  Loading profile…
                </strong>
              </div>
            ) : (
              <div className="people-detail-body">
                <div className="people-account-facts">
                  <div className="people-account-fact">
                    <span>
                      Team group
                    </span>

                    <strong>
                      {selectedPerson.teamGroup?.name ??
                        "Not assigned"}
                    </strong>
                  </div>

                  <div className="people-account-fact">
                    <span>
                      Created
                    </span>

                    <strong>
                      {formatTexasDateTime(
                        selectedPerson.createdAt
                      )}
                    </strong>
                  </div>

                  <div className="people-account-fact">
                    <span>
                      Email verified
                    </span>

                    <strong>
                      {selectedPerson.emailVerifiedAt
                        ? formatTexasDateTime(
                            selectedPerson.emailVerifiedAt
                          )
                        : "Not verified"}
                    </strong>
                  </div>

                  {selectedPerson.security && (
                    <div className="people-account-fact">
                      <span>
                        Last sign-in
                      </span>

                      <strong>
                        {formatTexasDateTime(
                          selectedPerson.security.lastSignInAt
                        )}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="people-detail-section">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>
                        Roles & creator access
                      </h4>

                      <p>
                        Effective access is calculated from assigned roles, organization scope, and visible creators.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={
                        openAccessEditor
                      }
                      disabled={
                        !canManageSelected
                      }
                    >
                      Edit access
                    </button>
                  </div>

                  <div className="people-access-grid">
                    <div>
                      <span className="people-section-label">
                        Roles
                      </span>

                      <div className="people-chip-list">
                        {selectedPerson.roles.map(
                          (
                            role
                          ) => (
                            <span
                              key={
                                role.id
                              }
                              className="people-chip"
                            >
                              {role.name}
                              {" · "}
                              {formatDataScope(
                                role.dataScope
                              )}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="people-section-label">
                        Creators
                      </span>

                      <div className="people-chip-list">
                        {selectedPerson.models.length >
                        0 ? (
                          selectedPerson.models.map(
                            (
                              model
                            ) => (
                              <span
                                key={
                                  model.id
                                }
                                className="people-chip"
                              >
                                {model.name}
                              </span>
                            )
                          )
                        ) : (
                          <span className="people-empty-inline">
                            No creator assignments
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!canManageSelected && (
                    <p className="people-scope-note">
                      {isSelectedSelf
                        ? "Your own role and creator assignments cannot be changed from People Management. This prevents accidental self-lockout."
                        : "This profile is visible to you, but one or more of its current assignments are outside the access you are allowed to change."}
                    </p>
                  )}
                </div>

                <div className="people-detail-section people-account-actions-section">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>
                        Account access
                      </h4>

                      <p>
                        Actions here can affect sign-in access or security for this account.
                      </p>
                    </div>
                  </div>

                  <div className="people-account-action-stack">
                    {selectedPerson.status ===
                      "PENDING_SETUP" && (
                      <div className="people-account-action-card">
                        <div>
                          <strong>
                            Invitation pending
                          </strong>

                          <span>
                            Send a fresh invitation if the original email was missed or is no longer usable.
                          </span>
                        </div>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void resendInvite(
                              selectedPerson
                            );
                          }}
                          disabled={
                            saving ||
                            !canManageSelected ||
                            !options
                              ?.capabilities
                              .invitesAvailable
                          }
                        >
                          Resend invitation
                        </button>
                      </div>
                    )}

                    {options
                      ?.capabilities
                      .canResetTwoFactor && (
                      <div className="people-account-action-card">
                        <div>
                          <strong>
                            Reset two-factor authentication
                          </strong>

                          <span>
                            Use this when the user can no longer complete their current verification method.
                          </span>
                        </div>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            requestConfirmedAction(
                              selectedPerson,
                              "reset-2fa"
                            )
                          }
                          disabled={
                            saving
                          }
                        >
                          Reset 2FA
                        </button>
                      </div>
                    )}

                    {selectedPerson.status ===
                      "ACTIVE" &&
                      !isSelectedSelf &&
                      options
                        ?.capabilities
                        .canDeactivate && (
                        <div className="people-account-action-card warning">
                          <div>
                            <strong>
                              Deactivate account
                            </strong>

                            <span>
                              Blocks new sign-ins immediately and revokes active sessions while preserving roles, creator assignments, and history.
                            </span>
                          </div>

                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              requestConfirmedAction(
                                selectedPerson,
                                "deactivate"
                              )
                            }
                            disabled={
                              saving ||
                              !canManageSelected
                            }
                          >
                            Deactivate account
                          </button>
                        </div>
                      )}

                    {selectedPerson.status ===
                      "DEACTIVATED" &&
                      options
                        ?.capabilities
                        .isOwner && (
                        <div className="people-account-action-card restore">
                          <div>
                            <strong>
                              Restore account access
                            </strong>

                            <span>
                              Allows the user to sign in again. Previously revoked sessions remain revoked and a fresh sign-in is required.
                            </span>
                          </div>

                          <button
                            type="button"
                            className="primary-button"
                            onClick={() =>
                              requestConfirmedAction(
                                selectedPerson,
                                "reactivate"
                              )
                            }
                            disabled={
                              saving
                            }
                          >
                            Reactivate account
                          </button>
                        </div>
                      )}
                  </div>
                </div>

                {options
                  ?.capabilities
                  .canDelete &&
                  selectedPerson.id !==
                    user?.id && (
                  <div className="people-detail-section people-danger-zone">
                    <div className="people-detail-section-heading">
                      <div>
                        <h4>
                          Danger zone
                        </h4>

                        <p>
                          Permanent deletion removes the account and tied QA history. Use deactivation whenever history must be preserved.
                        </p>
                      </div>
                    </div>

                    <div className="people-danger-action">
                      <div>
                        <strong>
                          Permanently delete account
                        </strong>

                        <span>
                          This cannot be undone and requires the account email as confirmation.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          requestConfirmedAction(
                            selectedPerson,
                            "delete"
                          )
                        }
                        disabled={
                          saving
                        }
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
          <form
            className="people-form-modal"
            onSubmit={
              submitInvite
            }
          >
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">
                  New account
                </span>

                <h3>
                  Invite person
                </h3>
              </div>

              <button
                type="button"
                className="people-close"
                onClick={() => {
                  setShowInvite(
                    false
                  );

                  resetInviteForm();
                }}
                aria-label="Close invitation"
              >
                ×
              </button>
            </div>

            <div className="people-form-body">
              <label className="form-field">
                <span>
                  Name
                </span>

                <input
                  value={
                    inviteName
                  }
                  onChange={(
                    event
                  ) =>
                    setInviteName(
                      event.target.value
                    )
                  }
                  autoFocus
                />
              </label>

              <label className="form-field">
                <span>
                  Email
                </span>

                <input
                  type="email"
                  value={
                    inviteEmail
                  }
                  onChange={(
                    event
                  ) =>
                    setInviteEmail(
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="form-field">
                <span>
                  Team group
                </span>

                <select
                  value={
                    inviteTeamGroupId
                  }
                  onChange={(
                    event
                  ) =>
                    setInviteTeamGroupId(
                      event.target.value
                    )
                  }
                >
                  {organizationGroups.map(
                    (
                      group
                    ) => (
                      <option
                        key={
                          group.id
                        }
                        value={
                          group.id
                        }
                      >
                        {group.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <div className="people-option-section">
                <span className="people-section-label">
                  Roles
                </span>

                <div className="people-option-grid">
                  {options?.roles.map(
                    (
                      role
                    ) => (
                      <label
                        key={
                          role.id
                        }
                        className="people-check-option"
                      >
                        <input
                          type="checkbox"
                          checked={
                            inviteRoleIds.includes(
                              role.id
                            )
                          }
                          onChange={() =>
                            toggleSelection(
                              inviteRoleIds,
                              role.id,
                              setInviteRoleIds
                            )
                          }
                        />

                        <span>
                          <strong>
                            {role.name}
                          </strong>

                          <small>
                            {formatDataScope(
                              role.dataScope
                            )}
                          </small>
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div className="people-option-section">
                <span className="people-section-label">
                  Creator assignments
                </span>

                <div className="people-option-grid">
                  {activeAssignableCreators.length ? (
                    activeAssignableCreators.map(
                      (
                        model
                      ) => (
                        <label
                          key={
                            model.id
                          }
                          className="people-check-option"
                        >
                          <input
                            type="checkbox"
                            checked={
                              inviteModelIds.includes(
                                model.id
                              )
                            }
                            onChange={() =>
                              toggleSelection(
                                inviteModelIds,
                                model.id,
                                setInviteModelIds
                              )
                            }
                          />

                          <span>
                            <strong>
                              {model.name}
                            </strong>

                            <small>
                              Active creator
                            </small>
                          </span>
                        </label>
                      )
                    )
                  ) : (
                    <span className="people-empty-inline">
                      No assignable creators are currently available.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="people-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowInvite(
                    false
                  );

                  resetInviteForm();
                }}
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving ||
                  !options
                    ?.capabilities
                    .invitesAvailable
                }
              >
                {saving
                  ? "Sending…"
                  : "Send invitation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAccessEditor &&
        selectedPerson && (
          <div className="people-overlay">
            <form
              className="people-form-modal"
              onSubmit={
                saveAccess
              }
            >
              <div className="people-modal-header">
                <div>
                  <span className="page-eyebrow">
                    Access control
                  </span>

                  <h3>
                    Edit {selectedPerson.name}
                  </h3>
                </div>

                <button
                  type="button"
                  className="people-close"
                  onClick={() =>
                    setShowAccessEditor(
                      false
                    )
                  }
                  aria-label="Close access editor"
                >
                  ×
                </button>
              </div>

              <div className="people-form-body">
                <label className="form-field">
                  <span>
                    Team group
                  </span>

                  <select
                    value={
                      accessTeamGroupId
                    }
                    onChange={(
                      event
                    ) =>
                      setAccessTeamGroupId(
                        event.target.value
                      )
                    }
                  >
                    {organizationGroups.map(
                      (
                        group
                      ) => (
                        <option
                          key={
                            group.id
                          }
                          value={
                            group.id
                          }
                        >
                          {group.name}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div className="people-option-section">
                  <span className="people-section-label">
                    Roles
                  </span>

                  <div className="people-option-grid">
                    {options?.roles.map(
                      (
                        role
                      ) => (
                        <label
                          key={
                            role.id
                          }
                          className="people-check-option"
                        >
                          <input
                            type="checkbox"
                            checked={
                              accessRoleIds.includes(
                                role.id
                              )
                            }
                            onChange={() =>
                              toggleSelection(
                                accessRoleIds,
                                role.id,
                                setAccessRoleIds
                              )
                            }
                          />

                          <span>
                            <strong>
                              {role.name}
                            </strong>

                            <small>
                              {formatDataScope(
                                role.dataScope
                              )}
                            </small>
                          </span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                <div className="people-option-section">
                  <div className="people-option-heading">
                    <div>
                      <span className="people-section-label">
                        Creators
                      </span>

                      <small>
                        {accessModelIds.length} selected
                      </small>
                    </div>

                    {activeAccessCreatorIds.length >
                      0 && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={
                          toggleAllAccessCreators
                        }
                      >
                        {allActiveCreatorsSelected
                          ? "Clear all"
                          : "Select all creators"}
                      </button>
                    )}
                  </div>

                  <div className="people-option-grid">
                    {options?.models.length ? (
                      options.models.map(
                        (
                          model
                        ) => {
                          const currentlySelected =
                            accessModelIds.includes(
                              model.id
                            );

                          return (
                            <label
                              key={
                                model.id
                              }
                              className="people-check-option"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  currentlySelected
                                }
                                disabled={
                                  !model.isActive &&
                                  !currentlySelected
                                }
                                onChange={() =>
                                  toggleSelection(
                                    accessModelIds,
                                    model.id,
                                    setAccessModelIds
                                  )
                                }
                              />

                              <span>
                                <strong>
                                  {model.name}
                                </strong>

                                <small>
                                  {model.isActive
                                    ? "Active creator"
                                    : currentlySelected
                                      ? "Inactive creator · existing assignment"
                                      : "Inactive creator · unavailable"}
                                </small>
                              </span>
                            </label>
                          );
                        }
                      )
                    ) : (
                      <span className="people-empty-inline">
                        No assignable creators are available.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="people-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setShowAccessEditor(
                      false
                    )
                  }
                  disabled={
                    saving
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Saving…"
                    : "Save access"}
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
                <span className="page-eyebrow">
                  Batch action
                </span>

                <h3>
                  {batchAction ===
                  "group"
                    ? "Change group"
                    : "Change role"}
                </h3>
              </div>

              <button
                type="button"
                className="people-close"
                onClick={() =>
                  setBatchAction(
                    null
                  )
                }
                aria-label="Close batch action"
              >
                ×
              </button>
            </div>

            <div className="people-confirm-body">
              <p>
                This will update
                {" "}
                <strong>
                  {selectedCount}
                </strong>
                {" "}
                selected employee
                {selectedCount ===
                1
                  ? ""
                  : "s"}.
              </p>

              {batchAction ===
              "group" ? (
                <label className="form-field">
                  <span>
                    New team group
                  </span>

                  <select
                    value={
                      batchGroupId
                    }
                    onChange={(
                      event
                    ) =>
                      setBatchGroupId(
                        event.target.value
                      )
                    }
                  >
                    {organizationGroups.map(
                      (
                        group
                      ) => (
                        <option
                          key={
                            group.id
                          }
                          value={
                            group.id
                          }
                        >
                          {group.name}
                        </option>
                      )
                    )}
                  </select>
                </label>
              ) : (
                <>
                  <label className="form-field">
                    <span>
                      New role
                    </span>

                    <select
                      value={
                        batchRoleId
                      }
                      onChange={(
                        event
                      ) =>
                        setBatchRoleId(
                          event.target.value
                        )
                      }
                    >
                      {options?.roles.map(
                        (
                          role
                        ) => (
                          <option
                            key={
                              role.id
                            }
                            value={
                              role.id
                            }
                          >
                            {role.name}
                            {" · "}
                            {formatDataScope(
                              role.dataScope
                            )}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <div className="people-confirm-impact">
                    <strong>
                      Existing role assignments will be replaced.
                    </strong>

                    <p>
                      Creator assignments and team groups will stay unchanged. This batch action sets the selected employees to the chosen role.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="people-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setBatchAction(
                    null
                  )
                }
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void runBatchAction();
                }}
                disabled={
                  saving
                }
              >
                {saving
                  ? "Updating…"
                  : "Apply change"}
              </button>
            </div>
          </section>
        </div>
      )}

      {groupModalAction &&
        selectedGroup && (
          <div className="people-overlay">
            <form
              className="people-confirm-modal"
              onSubmit={
                submitGroupMutation
              }
            >
              <div className="people-modal-header">
                <div>
                  <span className="page-eyebrow">
                    Organization
                  </span>

                  <h3>
                    {groupModalAction ===
                    "create"
                      ? "Add subgroup"
                      : groupModalAction ===
                          "rename"
                        ? "Rename group"
                        : "Delete group"}
                  </h3>
                </div>

                <button
                  type="button"
                  className="people-close"
                  onClick={() =>
                    setGroupModalAction(
                      null
                    )
                  }
                  aria-label="Close group editor"
                >
                  ×
                </button>
              </div>

              <div className="people-confirm-body">
                {groupModalAction ===
                "delete" ? (
                  <div className="people-confirm-impact delete">
                    <strong>
                      Delete {selectedGroup.name}?
                    </strong>

                    <p>
                      A group can only be deleted when it has no members and no child groups. The XYZ Management root cannot be deleted.
                    </p>
                  </div>
                ) : (
                  <>
                    {groupModalAction ===
                      "create" && (
                      <p>
                        The new subgroup will be created under
                        {" "}
                        <strong>
                          {selectedGroup.name}
                        </strong>.
                      </p>
                    )}

                    <label className="form-field">
                      <span>
                        Group name
                      </span>

                      <input
                        value={
                          groupName
                        }
                        onChange={(
                          event
                        ) =>
                          setGroupName(
                            event.target.value
                          )
                        }
                        autoFocus
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="people-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setGroupModalAction(
                      null
                    )
                  }
                  disabled={
                    saving
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={
                    groupModalAction ===
                    "delete"
                      ? "danger-button"
                      : "primary-button"
                  }
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Working…"
                    : groupModalAction ===
                        "create"
                      ? "Create subgroup"
                      : groupModalAction ===
                          "rename"
                        ? "Save name"
                        : "Delete group"}
                </button>
              </div>
            </form>
          </div>
        )}

      {confirmAction &&
        actionPerson && (
          <div className="people-overlay">
            <section className="people-confirm-modal">
              <div className="people-modal-header">
                <div>
                  <span className="page-eyebrow">
                    {confirmAction ===
                    "delete"
                      ? "Danger zone"
                      : confirmAction ===
                          "reset-2fa"
                        ? "Account security"
                        : "Account access"}
                  </span>

                  <h3>
                    {confirmAction ===
                    "delete"
                      ? "Permanently delete " +
                        actionPerson.name +
                        "?"
                      : confirmAction ===
                          "deactivate"
                        ? "Deactivate " +
                          actionPerson.name +
                          "?"
                        : confirmAction ===
                            "reactivate"
                          ? "Reactivate " +
                            actionPerson.name +
                            "?"
                          : "Reset 2FA for " +
                            actionPerson.name +
                            "?"}
                  </h3>
                </div>
              </div>

              <div className="people-confirm-body">
                <div
                  className={
                    "people-confirm-impact " +
                    confirmAction
                  }
                >
                  <strong>
                    {confirmAction ===
                    "delete"
                      ? "This action cannot be undone."
                      : confirmAction ===
                          "deactivate"
                        ? "This action takes effect immediately."
                        : confirmAction ===
                            "reactivate"
                          ? "This restores sign-in access."
                          : "The user will need to set up verification again."}
                  </strong>

                  <p>
                    {confirmAction ===
                    "delete"
                      ? "The account identity, authentication records, linked chatter profile, and tied QA incidents or strikes will be permanently removed."
                      : confirmAction ===
                          "deactivate"
                        ? "New sign-ins will be blocked and every active session will be revoked. Roles, creator assignments, and operational history will remain intact."
                        : confirmAction ===
                            "reactivate"
                          ? "The account can authenticate again, but previously revoked sessions will not return. The user must complete a fresh sign-in."
                          : "Existing sessions and outstanding verification challenges will be invalidated as part of the reset."}
                  </p>
                </div>

                {confirmAction ===
                  "delete" && (
                  <label className="form-field">
                    <span>
                      Type {actionPerson.email} to confirm
                    </span>

                    <input
                      value={
                        deleteConfirmation
                      }
                      onChange={(
                        event
                      ) =>
                        setDeleteConfirmation(
                          event.target.value
                        )
                      }
                      autoFocus
                    />
                  </label>
                )}
              </div>

              <div className="people-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setConfirmAction(
                      null
                    );

                    setActionPerson(
                      null
                    );

                    setDeleteConfirmation(
                      ""
                    );
                  }}
                  disabled={
                    saving
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className={
                    confirmAction ===
                      "delete" ||
                    confirmAction ===
                      "deactivate"
                      ? "danger-button"
                      : "primary-button"
                  }
                  onClick={() => {
                    void runConfirmedAction();
                  }}
                  disabled={
                    saving ||
                    (
                      confirmAction ===
                        "delete" &&
                      deleteConfirmation
                        .trim()
                        .toLowerCase() !==
                        actionPerson.email
                          .toLowerCase()
                    )
                  }
                >
                  {saving
                    ? "Working…"
                    : confirmAction ===
                        "delete"
                      ? "Permanently delete"
                      : confirmAction ===
                          "deactivate"
                        ? "Deactivate account"
                        : confirmAction ===
                            "reactivate"
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
