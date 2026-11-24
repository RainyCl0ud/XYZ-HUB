import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  CSSProperties,
  FormEvent,
} from "react";

import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  PEOPLE_CHANGED_EVENT,
  apiRequest,
} from "../lib/api";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  getPersonAvatarUrl,
} from "../lib/profile-avatar";

import UserAvatar from "../components/UserAvatar";

import {
  useToast,
} from "../components/ToastProvider";

import PeopleQaPanel from "../components/PeopleQaPanel";

import {
  PhoneActionMenu,
} from "../components/PhoneActionMenu";

import type {
  PhoneActionMenuItem,
} from "../components/PhoneActionMenu";

import {
  ProfilePhoneFacts,
} from "../components/ProfilePhoneViews";

import {
  PHONE_QUERY,
  useMediaQuery,
} from "../lib/useMediaQuery";

import "./PeoplePage.css";
import { formatDataScope } from "../lib/data-scope";


type PersonStatus =
  | "PENDING_SETUP"
  | "ACTIVE"
  | "DEACTIVATED";

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
  avatarUpdatedAt: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
  deactivatedAt: string | null;
  canChangeDelegatedStatus?: boolean;
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

type TeamGroup = {
  id: string;
  name: string;
  parentId: string | null;
  isRoot: boolean;
  color: string | null;
  memberCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
};

type PeopleOptions = {
  creatorModels: (AssignableModel & { creatorUserId: string | null })[];
  roles: AssignableRole[];
  models: AssignableModel[];
  organization: {
    rootGroupId: string;
    groups: TeamGroup[];
  };
  capabilities: {
    isOwner: boolean;
    canManagePeople: boolean;
    canCreatePeople: boolean;
    canAssignRoles: boolean;
    canAssignModels: boolean;
    canManageOrganization: boolean;
    canDeactivate: boolean;
    canDelete: boolean;
    canResetTwoFactor: boolean;
    invitesAvailable: boolean;
  };
};

type ConfirmAction =
  | "deactivate"
  | "reactivate"
  | "reset-2fa"
  | "delete"
  | null;

type ProfileTab =
  | "overview"
  | "qa"
  | "strikes"
  | "account-access";


const TEXAS_TIME_ZONE =
  "America/Chicago";

const EMPTY_TEAMS:
  TeamGroup[] =
    [];

const PROFILE_TABS: Array<{
  id: ProfileTab;
  label: string;
}> = [
  {
    id: "overview",
    label: "Overview",
  },
  {
    id: "qa",
    label: "QA",
  },
  {
    id: "strikes",
    label: "Strikes",
  },
  {
    id: "account-access",
    label: "Account Access",
  },
];


function formatStatus(
  status:
    PersonStatus
) {
  if (
    status ===
      "PENDING_SETUP"
  ) {
    return "Pending setup";
  }

  if (
    status ===
      "DEACTIVATED"
  ) {
    return "Deactivated";
  }

  return "Active";
}

function formatTexasDateTime(
  value:
    string |
    null
) {
  if (
    !value
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        TEXAS_TIME_ZONE,
      month:
        "short",
      day:
        "numeric",
      year:
        "numeric",
      hour:
        "numeric",
      minute:
        "2-digit",
      timeZoneName:
        "short",
    }
  ).format(
    new Date(
      value
    )
  );
}


function getReturnPath(
  requested:
    string |
    null
) {
  if (
    requested ===
      "/people" ||
    requested?.startsWith(
      "/people?"
    ) ||
    requested ===
      "/incidents" ||
    requested?.startsWith(
      "/incidents?"
    ) ||
    requested ===
      "/strikes" ||
    requested?.startsWith(
      "/strikes?"
    )
  ) {
    return requested;
  }

  return "/people";
}


function getReturnLabel(
  returnPath:
    string
) {
  if (
    returnPath.startsWith(
      "/incidents"
    )
  ) {
    return "\u2190 Back to Incidents";
  }

  if (
    returnPath.startsWith(
      "/strikes"
    )
  ) {
    return "\u2190 Back to Strike Management";
  }

  return "\u2190 Back to Employee Management";
}


// Phones: the page the back link returns to, shown as a small word.
function getReturnName(
  returnPath:
    string
) {
  if (
    returnPath.startsWith(
      "/incidents"
    )
  ) {
    return "Incidents";
  }

  if (
    returnPath.startsWith(
      "/strikes"
    )
  ) {
    return "Strike Management";
  }

  return "Employee Management";
}


// Phones: \u22ef in the header. Focus returns here when a window opened from it closes.
const PHONE_MENU_BUTTON =
  ".people-profile-phone-identity .phone-action-menu-button";


function getProfileTab(
  value:
    string |
    null
): ProfileTab {
  if (
    value ===
      "overview" ||
    value ===
      "qa" ||
    value ===
      "strikes" ||
    value ===
      "account-access"
  ) {
    return value;
  }

  return "overview";
}


function PeopleDetailPage() {
  const [creatorModelId, setCreatorModelId] = useState("");
  const navigate =
    useNavigate();

  const toast =
    useToast();

  const {
    user,
  } =
    useAuth();

  const {
    personId,
  } =
    useParams<{
      personId:
        string;
    }>();

  const [
    searchParams,
    setSearchParams,
  ] =
    useSearchParams();

  const returnPath =
    getReturnPath(
      searchParams.get(
        "from"
      )
    );

  const activeTab =
    getProfileTab(
      searchParams.get(
        "tab"
      )
    );

  const isPhone =
    useMediaQuery(
      PHONE_QUERY
    );

  const [
    phoneMenuOpen,
    setPhoneMenuOpen,
  ] =
    useState(
      false
    );

  // Phones: where focus goes once a window opened from ⋯ or an
  // Account Access row closes.
  const phoneReturnFocus =
    useRef<
      string |
      null
    >(
      null
    );

  const [
    person,
    setPerson,
  ] =
    useState<
      Person |
      null
    >(
      null
    );

  const [
    options,
    setOptions,
  ] =
    useState<
      PeopleOptions |
      null
    >(
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
    error,
    setError,
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

  const [
    showRoleEditor,
    setShowRoleEditor,
  ] =
    useState(
      false
    );

  const [showTeamEditor, setShowTeamEditor] = useState(false);
  const [destinationTeamId, setDestinationTeamId] = useState("");

  const [
    assignedRoleIds,
    setAssignedRoleIds,
  ] =
    useState<
      string[]
    >(
      []
    );

  const [
    assignedModelIds,
    setAssignedModelIds,
  ] =
    useState<
      string[]
    >(
      []
    );

  const [
    confirmAction,
    setConfirmAction,
  ] =
    useState<
      ConfirmAction
    >(
      null
    );

  const [
    deleteConfirmation,
    setDeleteConfirmation,
  ] =
    useState(
      ""
    );


  const loadProfile =
    useCallback(
      async () => {
        if (
          !personId
        ) {
          setPerson(
            null
          );

          setOptions(
            null
          );

          setError(
            "A valid employee ID is required."
          );

          setLoading(
            false
          );

          return;
        }

        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const [
            personResponse,
            optionsResponse,
          ] =
            await Promise.all([
              apiRequest<{
                person:
                  Person;
              }>(
                `/api/people/${encodeURIComponent(
                  personId
                )}`
              ),

              apiRequest<
                PeopleOptions
              >(
                "/api/people/options"
              ),
            ]);

          setPerson(
            personResponse.person
          );

          setOptions(
            optionsResponse
          );
        } catch (
          loadError
        ) {
          setPerson(
            null
          );

          setOptions(
            null
          );

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Unable to load the employee profile."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        personId,
      ]
    );


  const refreshProfile =
    useCallback(
      async () => {
        if (
          !personId
        ) {
          return;
        }

        const [
          personResponse,
          optionsResponse,
        ] =
          await Promise.all([
            apiRequest<{
              person:
                Person;
            }>(
              `/api/people/${encodeURIComponent(
                personId
              )}`
            ),

            apiRequest<
              PeopleOptions
            >(
              "/api/people/options"
            ),
          ]);

        setPerson(
          personResponse.person
        );

        setOptions(
          optionsResponse
        );
      },
      [
        personId,
      ]
    );


  useEffect(
    () => {
      void loadProfile();
    },
    [
      loadProfile,
    ]
  );


  useEffect(
    () => {
      const handlePeopleChanged =
        () => {
          void refreshProfile()
            .catch(
              (
                refreshError
              ) => {
                console.error(
                  "Unable to refresh employee profile after People update:",
                  refreshError
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
      refreshProfile,
    ]
  );


  const teams =
    options
      ?.organization
      .groups ??
    EMPTY_TEAMS;

  const teamById =
    useMemo(
      () =>
        new Map(
          teams.map(
            (
              team
            ) => [
              team.id,
              team,
            ]
          )
        ),
      [
        teams,
      ]
    );

  const assignableRoleIds =
    useMemo(
      () =>
        new Set(
          options
            ?.roles
            .map(
              (
                role
              ) =>
                role.id
            ) ??
          []
        ),
      [
        options?.roles,
      ]
    );

  const assignableModelIds =
    useMemo(
      () =>
        new Set(
          options
            ?.models
            .map(
              (
                model
              ) =>
                model.id
            ) ??
          []
        ),
      [
        options?.models,
      ]
    );

  const canManagePerson =
    Boolean(
      person &&
      person.id !==
        user?.id &&
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

  const isSelf =
    Boolean(
      person &&
      person.id ===
        user?.id
    );
  const canChangeAccountStatus = !!options?.capabilities.canDeactivate &&
    (options.capabilities.isOwner || person?.canChangeDelegatedStatus === true);

  const profileTeamColor =
    useMemo(
      () => {
        if (
          !person
            ?.teamGroup
        ) {
          return null;
        }

        let current =
          teamById.get(
            person.teamGroup.id
          );

        const seen =
          new Set<
            string
          >();

        while (
          current &&
          !seen.has(
            current.id
          )
        ) {
          seen.add(
            current.id
          );

          if (
            current.color
          ) {
            return current.color;
          }

          current =
            current.parentId
              ? teamById.get(
                  current.parentId
                )
              : undefined;
        }

        return null;
      },
      [
        person,
        teamById,
      ]
    );

  // Phones: the ⋯ menu closes when the layout switches to desktop, so it
  // doesn't reappear open later.
  useEffect(
    () => {
      if (
        !isPhone
      ) {
        setPhoneMenuOpen(
          false
        );

        // The phone row or ⋯ it pointed at is gone on desktop.
        phoneReturnFocus.current =
          null;
      }
    },
    [
      isPhone,
    ]
  );

  const anyWindowOpen =
    showRoleEditor ||
    showTeamEditor ||
    Boolean(
      confirmAction
    );

  // Phones: focus moves into a window when it opens, and once it closes
  // returns to what opened it (or to the chosen tab when that is gone, e.g.
  // after deactivating).
  useEffect(
    () => {
      if (
        anyWindowOpen
      ) {
        const overlay =
          isPhone
            ? document.querySelector<HTMLElement>(
                ".people-profile-page-phone .people-overlay"
              )
            : null;

        // The delete confirmation's field already takes focus itself.
        if (
          overlay &&
          !overlay.contains(
            document.activeElement
          )
        ) {
          overlay
            .querySelector<HTMLElement>(
              "input:not([type='checkbox']), select, button"
            )
            ?.focus();
        }

        return;
      }

      const selector =
        phoneReturnFocus.current;

      if (
        !selector
      ) {
        return;
      }

      phoneReturnFocus.current =
        null;

      (
        document.querySelector<HTMLElement>(
          selector
        ) ??
        document.querySelector<HTMLElement>(
          ".people-profile-tab.active"
        )
      )?.focus();
    },
    [
      anyWindowOpen,
      isPhone,
    ]
  );

  function toggleSelection(
    current:
      string[],
    value:
      string,
    setter:
      (
        next:
          string[]
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


  function goBack() {
    navigate(
      returnPath,
      {
        replace:
          true,
      }
    );
  }


  function selectProfileTab(
    tab:
      ProfileTab
  ) {
    const next =
      new URLSearchParams(
        searchParams
      );

    next.set(
      "tab",
      tab
    );

    setSearchParams(
      next,
      {
        replace:
          true,
      }
    );
  }


  function openTeamEditor() {
    if (!person || !options || !canManagePerson || !options.capabilities.canAssignRoles) return;
    setDestinationTeamId(person.teamGroup?.id ?? "");
    setShowTeamEditor(true);
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    if (!person || !destinationTeamId || !canManagePerson) return;
    try {
      setSaving(true);
      await apiRequest(
        `/api/team-groups/members/${encodeURIComponent(person.id)}`,
        { method: "PUT", body: JSON.stringify({ groupId: destinationTeamId }) }
      );
      await refreshProfile();
      setShowTeamEditor(false);
      toast.success("The employee's team has been updated.", "Team updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change team.", "Team unchanged");
    } finally {
      setSaving(false);
    }
  }

  function openRoleEditor() {
    if (
      !person ||
      !options ||
      !options.capabilities.canAssignRoles ||
      !canManagePerson ||
      !person.teamGroup
    ) {
      return;
    }

    setAssignedRoleIds(
      person.roles.map(
        (role) =>
          role.id
      )
    );

    setAssignedModelIds(
      person.models.map(
        (model) =>
          model.id
      )
    );

    setCreatorModelId((options.creatorModels ?? []).find((model) => model.creatorUserId === person.id)?.id ?? "");
    setShowRoleEditor(
      true
    );
  }

  async function saveRoles(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !options?.capabilities.canAssignRoles
    ) {
      return;
    }

    if (
      !person ||
      !canManagePerson
    ) {
      return;
    }

    if (
      !person.teamGroup
    ) {
      toast.warning(
        "A team assignment is required before roles can be changed.",
        "Role assignment unavailable"
      );

      return;
    }

    if (
      !assignedRoleIds.length
    ) {
      toast.warning(
        "At least one role is required.",
        "Check role assignment"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        `/api/people/${encodeURIComponent(
          person.id
        )}/access`,
        {
          method:
            "PUT",

          body:
            JSON.stringify({
              /*
               * Employee Profile changes role membership only.
               * The current team remains unchanged.
               */
              teamGroupId:
                person.teamGroup.id,

              roleIds:
                assignedRoleIds,
              creatorModelId: options.roles.some((role) => role.systemKey === "MODEL" && assignedRoleIds.includes(role.id))
                ? creatorModelId || null : undefined,

              modelIds:
                options.capabilities.canAssignModels
                  ? assignedModelIds
                  : person.models.map(
                      (model) =>
                        model.id
                    ),
            }),
        }
      );

      await refreshProfile();

      setShowRoleEditor(
        false
      );

      toast.success(
        "The employee's assignments were updated.",
        "Assignments updated"
      );
    } catch (
      saveError
    ) {
      toast.error(
        saveError instanceof
          Error
          ? saveError.message
          : "Unable to update employee assignments.",
        "Assignments not updated"
      );
    } finally {
      setSaving(
        false
      );
    }
  }


  async function resendInvite() {
    if (
      !person ||
      !options?.capabilities.canCreatePeople
    ) {
      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        `/api/people/${encodeURIComponent(
          person.id
        )}/resend-invite`,
        {
          method:
            "POST",
        }
      );

      await refreshProfile();

      toast.success(
        "A fresh invitation was sent.",
        "Invitation resent"
      );
    } catch (
      resendError
    ) {
      toast.error(
        resendError instanceof
          Error
          ? resendError.message
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
    action:
      Exclude<
        ConfirmAction,
        null
      >
  ) {
    const allowed =
      action === "deactivate" ||
      action === "reactivate"
        ? canChangeAccountStatus
        : action === "delete"
          ? Boolean(
              options?.capabilities.canDelete
            )
          : action === "reset-2fa"
            ? Boolean(
                options?.capabilities.canResetTwoFactor
              )
            : false;

    if (
      !allowed
    ) {
      return;
    }

    setConfirmAction(
      action
    );

    setDeleteConfirmation(
      ""
    );
  }


  async function runConfirmedAction() {
    if (
      !person ||
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
          `/api/people/${encodeURIComponent(
            person.id
          )}`,
          {
            method:
              "DELETE",

            body:
              JSON.stringify({
                confirmEmail:
                  deleteConfirmation,
              }),
          }
        );

        toast.success(
          "The account and tied QA history were permanently deleted.",
          "User deleted"
        );

        setConfirmAction(
          null
        );

        setDeleteConfirmation(
          ""
        );

        navigate(
          returnPath,
          {
            replace:
              true,
          }
        );

        return;
      }

      const endpoint =
        confirmAction ===
          "deactivate"
          ? "deactivate"
          : confirmAction ===
              "reactivate"
            ? "reactivate"
            : "reset-2fa";

      await apiRequest(
        `/api/people/${encodeURIComponent(
          person.id
        )}/${endpoint}`,
        {
          method:
            "POST",
        }
      );

      await refreshProfile();

      toast.success(
        confirmAction ===
          "deactivate"
          ? "The user was deactivated and active sessions were revoked."
          : confirmAction ===
              "reactivate"
            ? "The user was reactivated."
            : "Two-factor authentication was reset and existing sessions were revoked.",
        "Employee Management updated"
      );

      setConfirmAction(
        null
      );

      setDeleteConfirmation(
        ""
      );
    } catch (
      actionError
    ) {
      toast.error(
        actionError instanceof
          Error
          ? actionError.message
          : "Unable to complete the action.",
        "Action failed"
      );
    } finally {
      setSaving(
        false
      );
    }
  }


  function closeConfirmation() {
    if (
      saving
    ) {
      return;
    }

    setConfirmAction(
      null
    );

    setDeleteConfirmation(
      ""
    );
  }


  const pageClassName =
    `page people-profile-page${isPhone ? " people-profile-page-phone" : ""}`;

  // Phones: a small back link naming the page it returns to.
  const backButton =
    isPhone ? (
      <button
        type="button"
        className="people-profile-phone-back"
        onClick={
          goBack
        }
        inert={
          anyWindowOpen
            ? true
            : undefined
        }
        aria-label={`Back to ${getReturnName(returnPath)}`}
      >
        <span
          className="people-profile-phone-back-arrow"
          aria-hidden="true"
        />
        <span>
          {getReturnName(returnPath)}
        </span>
      </button>
    ) : (
      <button
        type="button"
        className="secondary-button people-profile-page-back"
        onClick={
          goBack
        }
      >
        {getReturnLabel(returnPath)}
      </button>
    );

  // Phones: the Overview edits, in the ⋯ beside the name. Each shows only
  // when it can be used (desktop's Edit also needs a team to open).
  const canEditFromMenu =
    Boolean(
      person &&
      options?.capabilities.canAssignRoles &&
      canManagePerson
    );

  const phoneMenuItems: PhoneActionMenuItem[] = [
    ...(canEditFromMenu &&
    person?.teamGroup
      ? [
          {
            key: "assignments",
            label: "Edit assignments",
            onSelect: () => {
              phoneReturnFocus.current =
                PHONE_MENU_BUTTON;
              openRoleEditor();
            },
          },
        ]
      : []),
    ...(canEditFromMenu
      ? [
          {
            key: "team",
            label: person?.teamGroup
              ? "Change team"
              : "Add to a team",
            onSelect: () => {
              // Like desktop's Change Team button, wait for a save to finish.
              if (
                saving
              ) {
                return;
              }

              phoneReturnFocus.current =
                PHONE_MENU_BUTTON;
              openTeamEditor();
            },
          },
        ]
      : []),
  ];

  // Phones: an Account Access row opens its confirmation; focus comes back
  // to the row afterwards.
  function requestPhoneAction(
    action:
      Exclude<
        ConfirmAction,
        null
      >
  ) {
    phoneReturnFocus.current =
      `[data-profile-action="${action}"]`;
    requestConfirmedAction(
      action
    );
  }


  if (
    loading
  ) {
    return (
      <div className={pageClassName}>
        {backButton}

        <div className="empty-state">
          <strong>
            Loading employee profile...
          </strong>
        </div>
      </div>
    );
  }


  if (
    error ||
    !person ||
    !options
  ) {
    return (
      <div className={pageClassName}>
        {backButton}

        <section className="content-card people-profile-route-error">
          <strong>
            Unable to open employee profile
          </strong>

          <span>
            {error ||
              "The employee profile is unavailable."}
          </span>
        </section>
      </div>
    );
  }


  return (
    <div className={pageClassName}>
      {backButton}

      <section
        className={`people-detail-panel${profileTeamColor ? " team-colored" : ""}`}
        // Phones: while a window is open, the profile behind it can't be reached.
        inert={
          isPhone &&
          anyWindowOpen
            ? true
            : undefined
        }
        style={
          profileTeamColor
            ? {
                "--profile-team-accent":
                  profileTeamColor,
              } as
                CSSProperties
            : undefined
        }
        aria-label="Employee details"
      >
        <div className="people-detail-header people-profile-header">
          {isPhone ? (
            // Phones: initials, the name, one grey line, and ⋯ for the edits.
            <div className="people-profile-phone-identity">
              <UserAvatar
                name={
                  person.name
                }
                src={
                  getPersonAvatarUrl(
                    person.id,
                    person.avatarUpdatedAt
                  )
                }
                className="people-profile-avatar people-profile-phone-avatar"
              />

              <div className="people-profile-phone-copy">
                <h3>
                  {person.name}
                </h3>

                <p>
                  {[
                    person.roles
                      .map(
                        (role) =>
                          role.name
                      )
                      .join(", "),
                    person.email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              {canEditFromMenu && (
                <PhoneActionMenu
                  label="More employee actions"
                  panelId="people-profile-phone-menu-panel"
                  open={
                    phoneMenuOpen
                  }
                  onOpenChange={
                    setPhoneMenuOpen
                  }
                  items={
                    phoneMenuItems
                  }
                />
              )}
            </div>
          ) : (
          <div className="people-profile-identity">
            <UserAvatar
              name={
                person.name
              }
              src={
                getPersonAvatarUrl(
                  person.id,
                  person.avatarUpdatedAt
                )
              }
              className="people-profile-avatar"
            />

            <div className="people-profile-identity-copy">
              <span className="page-eyebrow">
                Employee profile
              </span>

              <div className="people-profile-title-row">
                <h3>
                  {person.name}
                </h3>

                <div className="people-profile-role-badges">
                  {person.roles.map(
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
                {person.email}
              </p>
            </div>
          </div>
          )}

        </div>


        <div
          className="people-profile-tabs"
          role="tablist"
          aria-label="Employee profile sections"
        >
          {PROFILE_TABS.map(
            (
              tab
            ) => (
              <button
                key={
                  tab.id
                }
                type="button"
                role="tab"
                aria-selected={
                  activeTab ===
                  tab.id
                }
                className={`people-profile-tab${activeTab === tab.id ? " active" : ""}`}
                onClick={() =>
                  selectProfileTab(
                    tab.id
                  )
                }
              >
                {isPhone &&
                tab.id ===
                  "account-access"
                  ? "Access"
                  : tab.label}
              </button>
            )
          )}
        </div>


        <div className="people-detail-body">
          {/* Phones: one list for team, role and models; edits are in ⋯. */}
          {activeTab ===
            "overview" &&
            isPhone && (
            <div
              className="people-profile-tab-panel people-profile-phone-tab"
              role="tabpanel"
            >
              <ProfilePhoneFacts
                facts={[
                  {
                    label: "Team",
                    value:
                      person.teamGroup?.name ??
                      "Not assigned",
                  },
                  {
                    label:
                      person.roles.length > 1
                        ? "Roles"
                        : "Role",
                    value:
                      person.roles.length
                        ? person.roles
                            .map(
                              (role) =>
                                `${role.name} · ${formatDataScope(
                                  role.dataScope
                                )}`
                            )
                            .join(", ")
                        : "No role",
                  },
                  {
                    label: "Models",
                    value:
                      person.models.length
                        ? person.models
                            .map(
                              (model) =>
                                model.name
                            )
                            .join(", ")
                        : "None",
                  },
                ]}
              />

              {!canManagePerson && (
                <p className="people-scope-note">
                  {isSelf
                    ? "Your own role assignment cannot be changed from Employee Management."
                    : "This profile is visible to you, but this employee's role assignment is outside the scope you may manage."}
                </p>
              )}
            </div>
          )}

          {activeTab ===
            "overview" &&
            !isPhone && (
            <div
              className="people-profile-tab-panel"
              role="tabpanel"
            >
              <div className="people-detail-section people-access-section">
                <div className="people-detail-section-heading">
                  <div>
                    <h4>
                      Employee assignments
                    </h4>

                    <p>
                      Review the employee's team, assigned role, and assigned models. Role permissions are configured centrally in Role Settings.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="primary-button people-edit-access"
                    hidden={
                      !options.capabilities.canAssignRoles
                    }
                    onClick={
                      openRoleEditor
                    }
                    disabled={
                      !canManagePerson
                    }
                  >
                    Edit
                  </button>
                </div>

                <div className="people-access-grid">
                  <div className="people-access-team-card">
                    <span className="people-section-label">
                      Team
                    </span>

                    <div className="people-access-team-content">
                      <strong className="people-access-value">
                        {person.teamGroup?.name ?? "Not assigned"}
                      </strong>
                      {options.capabilities.canAssignRoles && canManagePerson && (
                        <button
                          type="button"
                          className="secondary-button people-team-action"
                          onClick={openTeamEditor}
                          disabled={saving}
                        >
                          {person.teamGroup ? "Change Team" : "Add to a Team"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="people-section-label">
                      Assigned Role
                    </span>

                    <div className="people-chip-list">
                      {person.roles.length ? (
                        person.roles.map(
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
                        )
                      ) : (
                        <span className="people-empty-inline">
                          No role assignments
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="people-section-label">
                      Assigned Models
                    </span>

                    <div className="people-chip-list">
                      {person.models.length ? (
                        person.models.map(
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
                          No model assignments
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {!canManagePerson && (
                <p className="people-scope-note">
                  {isSelf
                    ? "Your own role assignment cannot be changed from Employee Management."
                    : "This profile is visible to you, but this employee's role assignment is outside the scope you may manage."}
                </p>
              )}
            </div>
          )}


          {activeTab ===
            "qa" && (
            <div
              className="people-profile-tab-panel"
              role="tabpanel"
            >
              <PeopleQaPanel
                key="qa"
                personId={
                  person.id
                }
                view="qa"
                layout={
                  isPhone
                    ? "phone"
                    : "desktop"
                }
              />
            </div>
          )}


          {activeTab ===
            "strikes" && (
            <div
              className="people-profile-tab-panel"
              role="tabpanel"
            >
              <PeopleQaPanel
                key="strikes"
                personId={
                  person.id
                }
                view="strikes"
                layout={
                  isPhone
                    ? "phone"
                    : "desktop"
                }
              />
            </div>
          )}


          {/* Phones: the account facts, actions as rows, and the risky ones as
              quiet links at the bottom. Each still asks for confirmation. */}
          {activeTab ===
            "account-access" &&
            isPhone && (
            <div
              className="people-profile-tab-panel people-profile-phone-tab"
              role="tabpanel"
            >
              <ProfilePhoneFacts
                facts={[
                  {
                    label: "Status",
                    value: formatStatus(
                      person.status
                    ),
                  },
                  {
                    label: "Created",
                    value: formatTexasDateTime(
                      person.createdAt
                    ),
                  },
                  {
                    label: "Email verified",
                    value: person.emailVerifiedAt
                      ? formatTexasDateTime(
                          person.emailVerifiedAt
                        )
                      : "Not verified",
                  },
                  {
                    label: "Last sign-in",
                    value: formatTexasDateTime(
                      person.security
                        ?.lastSignInAt ??
                        null
                    ),
                  },
                ]}
              />

              {(
                (person.status ===
                  "PENDING_SETUP" &&
                  options.capabilities.canCreatePeople) ||
                options.capabilities.canResetTwoFactor ||
                (person.status ===
                  "DEACTIVATED" &&
                  canChangeAccountStatus)
              ) && (
                <div className="people-profile-phone-actions">
                  {person.status ===
                    "PENDING_SETUP" &&
                    options.capabilities.canCreatePeople && (
                    <button
                      type="button"
                      className="people-profile-phone-action"
                      data-profile-action="resend-invite"
                      onClick={() => {
                        void resendInvite();
                      }}
                      disabled={
                        saving ||
                        !canManagePerson ||
                        !options
                          .capabilities
                          .invitesAvailable
                      }
                    >
                      <span className="people-profile-phone-action-text">
                        <span className="people-profile-phone-action-title">
                          Resend invitation
                        </span>{" "}
                        <span className="people-profile-phone-action-note">
                          If the first one was missed or expired
                        </span>
                      </span>
                    </button>
                  )}

                  {options
                    .capabilities
                    .canResetTwoFactor && (
                    <button
                      type="button"
                      className="people-profile-phone-action"
                      data-profile-action="reset-2fa"
                      onClick={() =>
                        requestPhoneAction(
                          "reset-2fa"
                        )
                      }
                      disabled={
                        saving
                      }
                    >
                      <span className="people-profile-phone-action-text">
                        <span className="people-profile-phone-action-title">
                          Reset 2FA
                        </span>{" "}
                        <span className="people-profile-phone-action-note">
                          If they can't complete verification
                        </span>
                      </span>
                      <span
                        className="people-profile-phone-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  )}

                  {person.status ===
                    "DEACTIVATED" &&
                    canChangeAccountStatus && (
                    <button
                      type="button"
                      className="people-profile-phone-action"
                      data-profile-action="reactivate"
                      onClick={() =>
                        requestPhoneAction(
                          "reactivate"
                        )
                      }
                      disabled={
                        saving
                      }
                    >
                      <span className="people-profile-phone-action-text">
                        <span className="people-profile-phone-action-title">
                          Reactivate account
                        </span>{" "}
                        <span className="people-profile-phone-action-note">
                          Restores sign-in. Revoked sessions stay revoked.
                        </span>
                      </span>
                      <span
                        className="people-profile-phone-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              )}

              {person.id !==
                user?.id &&
                (
                  (person.status ===
                    "ACTIVE" &&
                    canChangeAccountStatus) ||
                  options.capabilities.canDelete
                ) && (
                <div className="people-profile-phone-danger">
                  {person.status ===
                    "ACTIVE" &&
                    canChangeAccountStatus && (
                    <button
                      type="button"
                      className="people-profile-phone-quiet-link"
                      data-profile-action="deactivate"
                      onClick={() =>
                        requestPhoneAction(
                          "deactivate"
                        )
                      }
                      disabled={
                        saving ||
                        (options.capabilities.isOwner && !canManagePerson)
                      }
                    >
                      Deactivate account
                    </button>
                  )}

                  {options
                    .capabilities
                    .canDelete && (
                    <button
                      type="button"
                      className="people-profile-phone-quiet-link"
                      data-profile-action="delete"
                      onClick={() =>
                        requestPhoneAction(
                          "delete"
                        )
                      }
                      disabled={
                        saving
                      }
                    >
                      Permanently delete account
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab ===
            "account-access" &&
            !isPhone && (
            <div
              className="people-profile-tab-panel"
              role="tabpanel"
            >
              <div className="people-account-summary">
                <div>
                  <span>
                    Account status
                  </span>

                  <strong
                    className={`people-profile-status-pill ${person.status.toLowerCase()}`}
                  >
                    {formatStatus(
                      person.status
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Created
                  </span>

                  <strong>
                    {formatTexasDateTime(
                      person.createdAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Email verified
                  </span>

                  <strong>
                    {person.emailVerifiedAt
                      ? formatTexasDateTime(
                          person.emailVerifiedAt
                        )
                      : "Not verified"}
                  </strong>
                </div>

                <div>
                  <span>
                    Last sign-in
                  </span>

                  <strong>
                    {formatTexasDateTime(
                      person.security
                        ?.lastSignInAt ??
                        null
                    )}
                  </strong>
                </div>
              </div>
              <div className="people-detail-section people-account-access-section">
                <div className="people-detail-section-heading">
                  <div>
                    <h4>
                      Security & sign-in controls
                    </h4>

                    <p>
                      Manage authentication, invitations, and account availability.
                    </p>
                  </div>
                </div>

                <div className="people-account-action-stack">
                  {person.status ===
                    "PENDING_SETUP" &&
                    options.capabilities.canCreatePeople && (
                    <div className="people-account-action-card">
                      <div>
                        <strong>
                          Invitation pending
                        </strong>

                        <span>
                          Send a fresh invitation if the original email was missed or expired.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void resendInvite();
                        }}
                        disabled={
                          saving ||
                          !canManagePerson ||
                          !options
                            .capabilities
                            .invitesAvailable
                        }
                      >
                        Resend invitation
                      </button>
                    </div>
                  )}


                  {options
                    .capabilities
                    .canResetTwoFactor && (
                    <div className="people-account-action-card">
                      <div>
                        <strong>
                          Reset two-factor authentication
                        </strong>

                        <span>
                          Use this if the employee can no longer complete verification.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          requestConfirmedAction(
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


                  {person.status ===
                    "DEACTIVATED" &&
                    canChangeAccountStatus && (
                    <div className="people-account-action-card restore">
                      <div>
                        <strong>
                          Reactivate account
                        </strong>

                        <span>
                          Restores sign-in access. Previously revoked sessions stay revoked.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          requestConfirmedAction(
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


              {(canChangeAccountStatus ||
                options.capabilities.canDelete) &&
                person.id !==
                  user?.id && (
                <div className="people-detail-section people-danger-zone">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>
                        Danger Zone
                      </h4>

                      <p>
                        High-risk account actions are isolated from routine security controls.
                      </p>
                    </div>
                  </div>


                  {person.status ===
                    "ACTIVE" &&
                    canChangeAccountStatus && (
                    <div className="people-danger-action">
                      <div>
                        <strong>
                          Deactivate account
                        </strong>

                        <span>
                          Immediately blocks sign-in and revokes active sessions while preserving assignments and history.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          requestConfirmedAction(
                            "deactivate"
                          )
                        }
                        disabled={
                          saving ||
                          (options.capabilities.isOwner && !canManagePerson)
                        }
                      >
                        Deactivate account
                      </button>
                    </div>
                  )}


                  {options
                    .capabilities
                    .canDelete && (
                    <div className="people-danger-action">
                      <div>
                        <strong>
                          Permanently delete account
                        </strong>

                        <span>
                          Deletes the account and tied QA history. This cannot be undone and requires the account email as confirmation.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          requestConfirmedAction(
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
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>


      {showTeamEditor && person && options && (
        <div className="people-overlay">
          <form
            className="people-form-modal"
            onSubmit={saveTeam}
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            aria-labelledby={isPhone ? "people-team-window-title" : undefined}
          >
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">Team assignment</span>
                <h3 id={isPhone ? "people-team-window-title" : undefined}>{person.teamGroup ? "Change Team" : "Add to a Team"}</h3>
                
              </div>
              <button type="button" className="people-close" aria-label="Close team assignment" onClick={() => setShowTeamEditor(false)} disabled={saving}>&times;</button>
            </div>
            <div className="people-form-body">
              <label className="people-form-field">
                <span>Destination team</span>
                <select value={destinationTeamId} onChange={(event) => setDestinationTeamId(event.target.value)} required>
                  <option value="">Select a team</option>
                  {teams.filter((team) => !team.isRoot).map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
              <p className="people-scope-note">Moving teams may change who can manage this employee. Roles and creator assignments stay the same.</p>
            </div>
            <div className="people-modal-footer">
              <button type="button" className="secondary-button" disabled={saving} onClick={() => setShowTeamEditor(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving || !destinationTeamId || destinationTeamId === person.teamGroup?.id}>
                {saving ? "Saving..." : "Confirm team change"}
              </button>
            </div>
          </form>
        </div>
      )}

      {options?.capabilities.canAssignRoles &&
        showRoleEditor && (
        <div className="people-overlay">
          <form
            className="people-form-modal"
            onSubmit={
              saveRoles
            }
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            aria-labelledby={isPhone ? "people-assignments-window-title" : undefined}
          >
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">
                  Employee assignments
                </span>

                <h3 id={isPhone ? "people-assignments-window-title" : undefined}>
                  Edit assignments for {person.name}
                </h3>

                <p>
                  Update the employee's assigned role and models. Role permissions remain configured in Role Settings.
                </p>
              </div>

              <button
                type="button"
                className="people-close"
                onClick={() =>
                  setShowRoleEditor(
                    false
                  )
                }
                aria-label="Close employee assignments"
              >
                &times;
              </button>
            </div>


            <div className="people-form-body">
              <div className="people-option-section">
                <div className="people-option-heading">
                  <div>
                    <span className="people-section-label">
                      Assigned roles
                    </span>

                    <small>
                      {assignedRoleIds.length} selected
                    </small>
                  </div>
                </div>

                <div className="people-option-grid">
                  {options.roles.map(
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
                            assignedRoleIds.includes(
                              role.id
                            )
                          }
                          onChange={() =>
                            toggleSelection(
                              assignedRoleIds,
                              role.id,
                              setAssignedRoleIds
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

              {options.roles.some((role) => role.systemKey === "MODEL" && assignedRoleIds.includes(role.id)) && (
                <label className="form-field">
                  <span>Creator profile</span>
                  <select
                    value={creatorModelId}
                    disabled={(options.creatorModels ?? []).some((model) => model.creatorUserId === person.id)}
                    onChange={(event) => setCreatorModelId(event.target.value)}
                  >
                    <option value="">Create automatically from this account's name</option>
                    {(options.creatorModels ?? []).filter((model) => !model.creatorUserId || model.creatorUserId === person.id).map((model) => (
                      <option key={model.id} value={model.id}>{model.name}{model.isActive ? "" : " (inactive)"}</option>
                    ))}
                  </select>
                  <small>The Creator role connects this account to Creator Management. Existing profiles keep their staff assignments and history.</small>
                </label>
              )}

              {options.capabilities.canAssignModels && (
              <div className="people-option-section">
                <div className="people-option-heading">
                  <div>
                    <span className="people-section-label">
                      Assigned models
                    </span>

                    <small>
                      {assignedModelIds.length} selected
                    </small>
                  </div>
                </div>

                <div className="people-option-grid">
                  {options.models.map(
                    (
                      model
                    ) => {
                      const isAssigned =
                        assignedModelIds.includes(
                          model.id
                        );

                      const isUnavailable =
                        !model.isActive &&
                        !isAssigned;

                      return (
                        <label
                          key={
                            model.id
                          }
                          className={
                            "people-check-option people-model-option" +
                            (
                              !model.isActive
                                ? " is-inactive"
                                : ""
                            ) +
                            (
                              isUnavailable
                                ? " is-unavailable"
                                : ""
                            )
                          }
                          aria-disabled={
                            isUnavailable
                              ? true
                              : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={
                              isAssigned
                            }
                            disabled={
                              isUnavailable
                            }
                            onChange={() =>
                              toggleSelection(
                                assignedModelIds,
                                model.id,
                                setAssignedModelIds
                              )
                            }
                          />

                          <span>
                            <strong>
                              {model.name}
                            </strong>

                            <small
                              className={
                                model.isActive
                                  ? undefined
                                  : "people-model-status-inactive"
                              }
                            >
                              {model.isActive
                                ? "Active model"
                                : isAssigned
                                  ? "Inactive · currently assigned"
                                  : "Inactive · unavailable for assignment"}
                            </small>
                          </span>
                        </label>
                      );
                    }
                  )}
                </div>
              </div>
              )}

              <p className="people-scope-note">
                Role permissions are managed centrally in Role Settings.
              </p>
            </div>


            <div className="people-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowRoleEditor(
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
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}


      {confirmAction && (
        <div className="people-overlay">
          <section
            className="people-confirm-modal"
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            aria-labelledby={isPhone ? "people-confirm-window-title" : undefined}
          >
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">
                  Account action
                </span>

                <h3 id={isPhone ? "people-confirm-window-title" : undefined}>
                  {confirmAction ===
                    "delete"
                    ? `Permanently delete ${person.name}?`
                    : confirmAction ===
                        "deactivate"
                      ? `Deactivate ${person.name}?`
                      : confirmAction ===
                          "reactivate"
                        ? `Reactivate ${person.name}?`
                        : `Reset 2FA for ${person.name}?`}
                </h3>
              </div>
            </div>


            <div className="people-confirm-body">
              <div
                className={`people-confirm-impact ${confirmAction}`}
              >
                <strong>
                  {confirmAction ===
                    "delete"
                    ? "This action cannot be undone."
                    : "Confirm this account change."}
                </strong>

                <p>
                  {confirmAction ===
                    "delete"
                    ? "The account identity, authentication records, linked chatter profile, and tied QA history will be permanently removed."
                    : "This action changes the employee's ability to sign in or complete verification."}
                </p>
              </div>


              {confirmAction ===
                "delete" && (
                <label className="form-field">
                  <span>
                    Type {person.email} to confirm
                  </span>

                  <input
                    value={
                      deleteConfirmation
                    }
                    onChange={
                      (
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
                onClick={
                  closeConfirmation
                }
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
                      person.email
                        .toLowerCase()
                  )
                }
              >
                {saving
                  ? "Working..."
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


export default PeopleDetailPage;
