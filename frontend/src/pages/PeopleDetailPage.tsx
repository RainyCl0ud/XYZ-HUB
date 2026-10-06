import {
  useCallback,
  useEffect,
  useMemo,
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
  useToast,
} from "../components/ToastProvider";

import PeopleQaPanel from "../components/PeopleQaPanel";

import "./PeoplePage.css";


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

type ConfirmAction =
  | "deactivate"
  | "reactivate"
  | "reset-2fa"
  | "delete"
  | null;


const TEXAS_TIME_ZONE =
  "America/Chicago";

const EMPTY_TEAMS:
  TeamGroup[] =
    [];


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


function formatDataScope(
  value:
    string
) {
  if (
    value ===
      "ALL"
  ) {
    return "All data";
  }

  if (
    value ===
      "SELF_AND_TEAM"
  ) {
    return "Self + subordinates";
  }

  if (
    value ===
      "SELF"
  ) {
    return "Self only";
  }

  return value
    .toLowerCase()
    .replaceAll(
      "_",
      " "
    );
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
    )
  ) {
    return requested;
  }

  return "/people";
}


function PeopleDetailPage() {
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
  ] =
    useSearchParams();

  const returnPath =
    getReturnPath(
      searchParams.get(
        "from"
      )
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
    showAccessEditor,
    setShowAccessEditor,
  ] =
    useState(
      false
    );

  const [
    accessTeamId,
    setAccessTeamId,
  ] =
    useState(
      ""
    );

  const [
    accessRoleIds,
    setAccessRoleIds,
  ] =
    useState<
      string[]
    >(
      []
    );

  const [
    accessModelIds,
    setAccessModelIds,
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

  const defaultTeamId =
    useMemo(
      () => {
        const rootId =
          options
            ?.organization
            .rootGroupId;

        if (
          rootId &&
          teamById.has(
            rootId
          )
        ) {
          return rootId;
        }

        return (
          teams[0]
            ?.id ??
          ""
        );
      },
      [
        options
          ?.organization
          .rootGroupId,
        teamById,
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

  const activeCreators =
    useMemo(
      () =>
        options
          ?.models
          .filter(
            (
              model
            ) =>
              model.isActive
          ) ??
        [],
      [
        options?.models,
      ]
    );

  const activeAccessCreatorIds =
    useMemo(
      () =>
        activeCreators.map(
          (
            model
          ) =>
            model.id
        ),
      [
        activeCreators,
      ]
    );

  const allActiveCreatorsSelected =
    activeAccessCreatorIds.length >
      0 &&
    activeAccessCreatorIds.every(
      (
        id
      ) =>
        accessModelIds.includes(
          id
        )
    );

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

  const accessTeamColor =
    useMemo(
      () => {
        if (
          !accessTeamId
        ) {
          return null;
        }

        let current =
          teamById.get(
            accessTeamId
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
        accessTeamId,
        teamById,
      ]
    );


  function teamOptionLabel(
    team:
      TeamGroup
  ) {
    if (
      team.isRoot
    ) {
      return team.name;
    }

    const names = [
      team.name,
    ];

    let current =
      team.parentId
        ? teamById.get(
            team.parentId
          )
        : undefined;

    const seen =
      new Set<string>([
        team.id,
      ]);

    while (
      current &&
      !current.isRoot &&
      !seen.has(
        current.id
      )
    ) {
      seen.add(
        current.id
      );

      names.unshift(
        current.name
      );

      current =
        current.parentId
          ? teamById.get(
              current.parentId
            )
          : undefined;
    }

    return names.join(
      " / "
    );
  }


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


  function openAccessEditor() {
    if (
      !person ||
      !options ||
      !canManagePerson
    ) {
      return;
    }

    setAccessTeamId(
      person.teamGroup
        ?.id ??
      defaultTeamId
    );

    setAccessRoleIds(
      person.roles.map(
        (
          role
        ) =>
          role.id
      )
    );

    setAccessModelIds(
      person.models.map(
        (
          model
        ) =>
          model.id
      )
    );

    setShowAccessEditor(
      true
    );
  }


  function toggleAllAccessCreators() {
    if (
      allActiveCreatorsSelected
    ) {
      const inactive =
        accessModelIds.filter(
          (
            id
          ) => {
            const model =
              options
                ?.models
                .find(
                  (
                    item
                  ) =>
                    item.id ===
                    id
                );

            return Boolean(
              model &&
              !model.isActive
            );
          }
        );

      setAccessModelIds(
        inactive
      );

      return;
    }

    const inactive =
      accessModelIds.filter(
        (
          id
        ) => {
          const model =
            options
              ?.models
              .find(
                (
                  item
                ) =>
                  item.id ===
                  id
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
        ...inactive,
      ]),
    ]);
  }


  async function saveAccess(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !person ||
      !canManagePerson
    ) {
      return;
    }

    if (
      !accessTeamId ||
      !accessRoleIds.length
    ) {
      toast.warning(
        "A team and at least one role are required.",
        "Check access"
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
              teamGroupId:
                accessTeamId,

              roleIds:
                accessRoleIds,

              modelIds:
                accessModelIds,
            }),
        }
      );

      await refreshProfile();

      setShowAccessEditor(
        false
      );

      toast.success(
        "Role, creator, and team access were updated.",
        "Access updated"
      );
    } catch (
      saveError
    ) {
      toast.error(
        saveError instanceof
          Error
          ? saveError.message
          : "Unable to update access.",
        "Access not updated"
      );
    } finally {
      setSaving(
        false
      );
    }
  }


  async function resendInvite() {
    if (
      !person
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
        "People Management updated"
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


  if (
    loading
  ) {
    return (
      <div className="page people-profile-page">
        <button
          type="button"
          className="secondary-button people-profile-page-back"
          onClick={
            goBack
          }
        >
          ← Back to People
        </button>

        <div className="empty-state">
          <strong>
            Loading employee profile…
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
      <div className="page people-profile-page">
        <button
          type="button"
          className="secondary-button people-profile-page-back"
          onClick={
            goBack
          }
        >
          ← Back to People
        </button>

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
    <div className="page people-profile-page">
      <button
        type="button"
        className="secondary-button people-profile-page-back"
        onClick={
          goBack
        }
      >
        ← Back to People
      </button>

      <section
        className={`people-detail-panel${profileTeamColor ? " team-colored" : ""}`}
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
          <div className="people-profile-identity">
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

          <div
            className="people-profile-header-status"
            aria-label={`Account status: ${formatStatus(
              person.status
            )}`}
          >
            <span className="people-profile-status-label">
              Account status:
            </span>

            <span
              className={`people-profile-status-pill ${person.status.toLowerCase()}`}
            >
              {formatStatus(
                person.status
              )}
            </span>
          </div>
        </div>


        <div className="people-detail-body">
          <div className="people-detail-section people-access-section">
            <div className="people-detail-section-heading">
              <div>
                <h4>
                  Roles & creator access
                </h4>

                <p>
                  Current organizational and creator access for this employee.
                </p>
              </div>

              <button
                type="button"
                className="primary-button people-edit-access"
                onClick={
                  openAccessEditor
                }
                disabled={
                  !canManagePerson
                }
              >
                Edit access
              </button>
            </div>

            <div className="people-access-grid">
              <div className="people-access-team-card">
                <span className="people-section-label">
                  Team
                </span>

                <strong className="people-access-value">
                  {person.teamGroup?.name ??
                    "Not assigned"}
                </strong>
              </div>

              <div>
                <span className="people-section-label">
                  Roles
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
                  Creators
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
                      No creator assignments
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>


          {!canManagePerson && (
            <p className="people-scope-note">
              {isSelf
                ? "Your own role and creator assignments cannot be changed from People Management."
                : "This profile is visible to you, but one or more assignments are outside the access you may change."}
            </p>
          )}


          <PeopleQaPanel
            personId={
              person.id
            }
          />


          <div className="people-detail-section">
            <div className="people-detail-section-heading">
              <div>
                <h4>
                  Account access
                </h4>

                <p>
                  Security and sign-in controls for this employee account.
                </p>
              </div>
            </div>

            <div className="people-account-action-stack">
              {person.status ===
                "PENDING_SETUP" && (
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
                options
                  .capabilities
                  .isOwner && (
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


          {options
            .capabilities
            .isOwner &&
            person.id !==
              user?.id && (
              <div className="people-detail-section people-danger-zone">
                <div className="people-detail-section-heading">
                  <div>
                    <h4>
                      Owner-only danger zone
                    </h4>

                    <p>
                      Only Owners can deactivate or permanently delete people. These actions cannot be granted through Role Settings.
                    </p>
                  </div>
                </div>


                {person.status ===
                  "ACTIVE" &&
                  options
                    .capabilities
                    .canDeactivate && (
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
                          !canManagePerson
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


          <div className="people-profile-facts-bottom">
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
        </div>
      </section>


      {showAccessEditor && (
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
                  Edit {person.name}
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
              <label className="form-field people-team-select-field">
                <span>
                  Team
                </span>

                <div
                  className="people-select-shell team-accented"
                  style={
                    {
                      "--team-select-accent":
                        accessTeamColor ??
                        "var(--accent)",
                    } as
                      CSSProperties
                  }
                >
                  <select
                    value={
                      accessTeamId
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setAccessTeamId(
                          event.target.value
                        )
                    }
                  >
                    {teams.map(
                      (
                        team
                      ) => (
                        <option
                          key={
                            team.id
                          }
                          value={
                            team.id
                          }
                        >
                          {teamOptionLabel(
                            team
                          )}
                        </option>
                      )
                    )}
                  </select>

                  <span
                    className="people-select-caret"
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </div>
              </label>


              <div className="people-option-section">
                <span className="people-section-label">
                  Roles
                </span>

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

                  <button
                    type="button"
                    className="text-button"
                    onClick={
                      toggleAllAccessCreators
                    }
                  >
                    {allActiveCreatorsSelected
                      ? "Clear active creators"
                      : "Select all creators"}
                  </button>
                </div>

                <div className="people-option-grid">
                  {options.models.map(
                    (
                      model
                    ) => {
                      const checked =
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
                              checked
                            }
                            disabled={
                              !model.isActive &&
                              !checked
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
                                : "Inactive creator · existing assignment"}
                            </small>
                          </span>
                        </label>
                      );
                    }
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


      {confirmAction && (
        <div className="people-overlay">
          <section className="people-confirm-modal">
            <div className="people-modal-header">
              <div>
                <span className="page-eyebrow">
                  Account action
                </span>

                <h3>
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


export default PeopleDetailPage;
