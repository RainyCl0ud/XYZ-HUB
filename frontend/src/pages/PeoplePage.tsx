import { useNavigationFilter } from "../lib/useNavigationFilter";
import {
  useCallback,
  useEffect,
  useMemo,
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
  systemKey:
    string | null;
  rank:
    number | null;
  dataScope:
    string;
  assignedAt:
    string;
  assignedByUserId:
    string | null;
};

type PersonModel = {
  id: string;
  name: string;
  isActive: boolean;
  assignedAt:
    string;
  assignedByUserId:
    string | null;
};

type PersonSecurity = {
  lastSignInAt:
    string | null;
};

type Person = {
  id: string;
  name: string;
  email: string;
  status:
    PersonStatus;
  createdAt:
    string;
  emailVerifiedAt:
    string | null;
  deactivatedAt:
    string | null;
  roles:
    PersonRole[];
  models:
    PersonModel[];
  security?:
    PersonSecurity;
};

type AssignableRole = {
  id: string;
  name: string;
  systemKey:
    string | null;
  rank:
    number | null;
  dataScope:
    string;
};

type AssignableModel = {
  id: string;
  name: string;
  isActive:
    boolean;
};

type PeopleOptions = {
  roles:
    AssignableRole[];
  models:
    AssignableModel[];
  capabilities: {
    isOwner:
      boolean;
    canManagePeople:
      boolean;
    canDeactivate:
      boolean;
    canDelete:
      boolean;
    canResetTwoFactor:
      boolean;
    invitesAvailable:
      boolean;
  };
};

type PeopleResponse = {
  people:
    Person[];
};

type PersonResponse = {
  person:
    Person;
};

type ConfirmAction =
  | "deactivate"
  | "reactivate"
  | "reset-2fa"
  | "delete"
  | null;

const TEXAS_TIME_ZONE =
  "America/Chicago";

function formatTexasDateTime(
  value:
    string | null
) {
  if (!value) {
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
    new Date(value)
  );
}

function formatStatus(
  status:
    PersonStatus
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
    useState<
      Person[]
    >([]);

  const [
    options,
    setOptions,
  ] =
    useState<
      PeopleOptions | null
    >(
      null
    );

  const [
    selectedPerson,
    setSelectedPerson,
  ] =
    useState<
      Person | null
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

  const [statusFilter, setStatusFilter] = useNavigationFilter<"ALL" | PersonStatus>(
    "status", ["ALL","ACTIVE","PENDING_SETUP","DEACTIVATED"], "ALL",
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
    useState<
      string[]
    >([]);

  const [
    inviteModelIds,
    setInviteModelIds,
  ] =
    useState<
      string[]
    >([]);

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
    useState<
      string[]
    >([]);

  const [
    accessModelIds,
    setAccessModelIds,
  ] =
    useState<
      string[]
    >([]);

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

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const loadPeople =
    useCallback(
      async () => {
        const response =
          await apiRequest<
            PeopleResponse
          >(
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
          await apiRequest<
            PeopleOptions
          >(
            "/api/people/options"
          );

        setOptions(
          response
        );
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

  /*
   * Invite acceptance may happen in another browser or
   * device. Keep the table and any open profile synchronized
   * when the backend reports that People data changed.
   */
  useEffect(
    () => {
      const handlePeopleChanged =
        () => {
          void loadPeople()
            .then(
              (
                refreshedPeople
              ) => {
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
      loadPeople,
    ]
  );

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
              statusFilter !==
                "ALL" &&
              person.status !==
                statusFilter
            ) {
              return false;
            }

            if (!query) {
              return true;
            }

            const searchable = [
              person.name,
              person.email,
              person.status,
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
        people,
        search,
        statusFilter,
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

  const isSelectedSelf =
    selectedPerson?.id ===
    user?.id;

  const canManageSelected =
    Boolean(
      selectedPerson &&
      !isSelectedSelf &&
      selectedPerson.roles.every(
        (
          role
        ) =>
          assignableRoleIds.has(
            role.id
          )
      ) &&
      selectedPerson.models.every(
        (
          model
        ) =>
          assignableModelIds.has(
            model.id
          )
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
    person:
      Person
  ) {
    try {
      setSelectedPerson(
        person
      );

      setDetailLoading(
        true
      );

      const response =
        await apiRequest<
          PersonResponse
        >(
          `/api/people/${person.id}`
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
    userId:
      string
  ) {
    const [
      response,
    ] =
      await Promise.all([
        apiRequest<
          PersonResponse
        >(
          `/api/people/${userId}`
        ),

        loadPeople(),
      ]);

    setSelectedPerson(
      response.person
    );
  }

  function toggleSelection(
    current:
      string[],
    value:
      string,
    setter:
      (
        value:
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
  }

  async function submitInvite(
    event:
      FormEvent
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
        0
    ) {
      toast.warning(
        "Name, email, and at least one role are required.",
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
          method:
            "POST",

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

      await loadPeople();
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

    setShowAccessEditor(
      true
    );
  }

  async function saveAccess(
    event:
      FormEvent
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

    try {
      setSaving(
        true
      );

      await apiRequest(
        `/api/people/${selectedPerson.id}/access`,
        {
          method:
            "PUT",

          body:
            JSON.stringify({
              roleIds:
                accessRoleIds,

              modelIds:
                accessModelIds,
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
        "Roles and creator assignments were updated.",
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

  async function resendInvite() {
    if (
      !selectedPerson ||
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
        `/api/people/${selectedPerson.id}/resend-invite`,
        {
          method:
            "POST",
        }
      );

      await refreshPerson(
        selectedPerson.id
      );

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

  async function runConfirmedAction() {
    if (
      !selectedPerson ||
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
          `/api/people/${selectedPerson.id}`,
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
          "The user and tied QA history were permanently deleted.",
          "User deleted"
        );

        setSelectedPerson(
          null
        );

        await loadPeople();
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
          `/api/people/${selectedPerson.id}/${endpoint}`,
          {
            method:
              "POST",
          }
        );

        await refreshPerson(
          selectedPerson.id
        );

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

  const activeCount =
    people.filter(
      (
        person
      ) =>
        person.status ===
        "ACTIVE"
    ).length;

  const pendingCount =
    people.filter(
      (
        person
      ) =>
        person.status ===
        "PENDING_SETUP"
    ).length;

  const deactivatedCount =
    people.filter(
      (
        person
      ) =>
        person.status ===
        "DEACTIVATED"
    ).length;

  return (
    <div className="page people-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Team management
          </p>

          <h2>
            People Management
          </h2>

          <p className="page-description">
            Review portal users, their roles, creator access, setup state, and account security controls.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            setShowInvite(
              true
            )
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

      <section className="people-summary-grid">
        <div className="stat-card">
          <span className="stat-label">
            Visible people
          </span>

          <strong className="stat-value">
            {people.length}
          </strong>

          <span className="stat-help">
            Based on your current role and creator scope.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Active
          </span>

          <strong className="stat-value">
            {activeCount}
          </strong>

          <span className="stat-help">
            Accounts currently allowed to sign in.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Pending setup
          </span>

          <strong className="stat-value">
            {pendingCount}
          </strong>

          <span className="stat-help">
            Invited accounts that have not completed setup.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Deactivated
          </span>

          <strong className="stat-value">
            {deactivatedCount}
          </strong>

          <span className="stat-help">
            Access is blocked while history remains preserved.
          </span>
        </div>
      </section>

      <section className="content-card">
        <div className="people-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search name, email, role, or creator"
            aria-label="Search people"
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

          <div className="filter-group">
            {[
              "ALL",
              "ACTIVE",
              "PENDING_SETUP",
              "DEACTIVATED",
            ].map(
              (
                value
              ) => (
                <button
                  key={
                    value
                  }
                  type="button"
                  className={
                    statusFilter ===
                    value
                      ? "filter-button active"
                      : "filter-button"
                  }
                  onClick={() =>
                    setStatusFilter(
                      value as
                        | "ALL"
                        | PersonStatus
                    )
                  }
                >
                  {value ===
                  "ALL"
                    ? "All"
                    : formatStatus(
                        value as PersonStatus
                      )}
                </button>
              )
            )}
          </div>
        </div>

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
              No matching people
            </strong>

            <span>
              Try changing the search or status filter.
            </span>
          </div>
        ) : (
          <div className="people-table-wrap">
            <div className="people-table people-table-head">
              <span>
                Person
              </span>

              <span>
                Status
              </span>

              <span>
                Roles
              </span>

              <span>
                Creators
              </span>
            </div>

            {filteredPeople.map(
              (
                person
              ) => (
                <button
                  key={
                    person.id
                  }
                  type="button"
                  className="people-table people-table-row"
                  onClick={() => {
                    void openPerson(
                      person
                    );
                  }}
                >
                  <span className="people-person-cell">
                    <strong>
                      {person.name}
                    </strong>

                    <small>
                      {person.email}
                    </small>
                  </span>

                  <span>
                    <span
                      className={`people-status-badge ${person.status.toLowerCase()}`}
                    >
                      {formatStatus(
                        person.status
                      )}
                    </span>
                  </span>

                  <span className="people-chip-list">
                    {person.roles.map(
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
                        </span>
                      )
                    )}
                  </span>

                  <span className="people-muted-cell">
                    {person.models.length >
                    0
                      ? person.models
                          .map(
                            (
                              model
                            ) =>
                              model.name
                          )
                          .join(
                            ", "
                          )
                      : "No creator assignment"}
                  </span>
                </button>
              )
            )}
          </div>
        )}
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
                    `people-profile-status ${selectedPerson.status.toLowerCase()}`
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
                <div className="people-detail-meta">
                  <div>
                    <span>
                      Account status
                    </span>

                    <strong>
                      {formatStatus(
                        selectedPerson.status
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Created
                    </span>

                    <strong>
                      {formatTexasDateTime(
                        selectedPerson.createdAt
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Setup status
                    </span>

                    <strong>
                      {formatSetupStatus(
                        selectedPerson.setup.status
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Invite expires
                    </span>

                    <strong>
                      {formatTexasDateTime(
                        selectedPerson.setup.expiresAt
                      )}
                    </strong>
                  </div>
                </div>

                <div className="people-detail-section">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>
                        Roles & creator access
                      </h4>

                      <p>
                        Effective access is calculated from all assigned roles and visible models.
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
                              {role.rank !==
                                null &&
                                ` · Rank ${role.rank}`}
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
                        : "This profile is visible to you, but one or more of its current roles or creator assignments are outside the access you are allowed to change."}
                    </p>
                  )}
                </div>

                {selectedPerson.security && (
                  <div className="people-detail-section">
                    <div className="people-detail-section-heading">
                      <div>
                        <h4>
                          Account security
                        </h4>

                        <p>
                          Owner-only authentication status and last sign-in information.
                        </p>
                      </div>
                    </div>

                    <div className="people-detail-meta">
                      <div>
                        <span>
                          Last sign-in
                        </span>

                        <strong>
                          {formatTexasDateTime(
                            selectedPerson.security.lastSignInAt
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Email 2FA
                        </span>

                        <strong>
                          {selectedPerson.security.twoFactor.email.enabled
                            ? "Enabled"
                            : "Disabled"}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Email verified
                        </span>

                        <strong>
                          {formatTexasDateTime(
                            selectedPerson.security.twoFactor.email.verifiedAt
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="people-detail-section">
                  <div className="people-detail-section-heading">
                    <div>
                      <h4>
                        Account actions
                      </h4>

                      <p>
                        Available actions follow your effective permissions and role hierarchy.
                      </p>
                    </div>
                  </div>

                  <div className="people-action-grid">
                    {selectedPerson.status ===
                      "PENDING_SETUP" && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void resendInvite();
                        }}
                        disabled={
                          saving ||
                          !canManageSelected ||
                          !options
                            ?.capabilities
                            .invitesAvailable
                        }
                      >
                        Resend invite
                      </button>
                    )}

                    {selectedPerson.status ===
                      "ACTIVE" &&
                      !isSelectedSelf &&
                      options
                        ?.capabilities
                        .canDeactivate && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            setConfirmAction(
                              "deactivate"
                            )
                          }
                          disabled={
                            saving ||
                            !canManageSelected
                          }
                        >
                          Deactivate
                        </button>
                      )}

                    {selectedPerson.status ===
                      "DEACTIVATED" &&
                      options
                        ?.capabilities
                        .isOwner && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            setConfirmAction(
                              "reactivate"
                            )
                          }
                          disabled={
                            saving
                          }
                        >
                          Reactivate
                        </button>
                      )}

                    {options
                      ?.capabilities
                      .canResetTwoFactor && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setConfirmAction(
                            "reset-2fa"
                          )
                        }
                        disabled={
                          saving
                        }
                      >
                        Reset 2FA
                      </button>
                    )}

                    {options
                      ?.capabilities
                      .canDelete &&
                      selectedPerson.id !==
                        user?.id && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          setConfirmAction(
                            "delete"
                          )
                        }
                        disabled={
                          saving
                        }
                      >
                        Permanently delete
                      </button>
                    )}
                  </div>

                  {options
                    ?.capabilities
                    .canDelete && (
                    <p className="people-scope-note">
                      Permanent deletion cannot be undone. Use deactivation when access should be blocked while account and operational history are preserved.
                    </p>
                  )}
                </div>
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
                            {role.rank !==
                            null
                              ? `Rank ${role.rank}`
                              : "Unranked"}
                            {" · "}
                            {role.dataScope}
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
                              {role.rank !==
                              null
                                ? `Rank ${role.rank}`
                                : "Unranked"}
                              {" · "}
                              {role.dataScope}
                            </small>
                          </span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                <div className="people-option-section">
                  <span className="people-section-label">
                    Creators
                  </span>

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

      {confirmAction &&
        selectedPerson && (
          <div className="people-overlay">
            <section className="people-confirm-modal">
              <div className="people-modal-header">
                <div>
                  <span className="page-eyebrow">
                    Confirmation
                  </span>

                  <h3>
                    {confirmAction ===
                    "delete"
                      ? "Permanently delete user?"
                      : confirmAction ===
                          "deactivate"
                        ? "Deactivate user?"
                        : confirmAction ===
                            "reactivate"
                          ? "Reactivate user?"
                          : "Reset two-factor authentication?"}
                  </h3>
                </div>
              </div>

              <div className="people-confirm-body">
                <p>
                  {confirmAction ===
                  "delete"
                    ? "This permanently deletes the account identity, authentication records, linked chatter profile, and tied QA incidents/strikes. Use deactivation when history must be preserved."
                    : confirmAction ===
                        "deactivate"
                      ? "The user will immediately lose access and all active sessions will be revoked."
                      : confirmAction ===
                          "reactivate"
                        ? "The user will be allowed to authenticate again."
                        : "Existing sessions and outstanding verification challenges will be invalidated."}
                </p>

                {confirmAction ===
                  "delete" && (
                  <label className="form-field">
                    <span>
                      Type {selectedPerson.email} to confirm
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
                        selectedPerson.email
                          .toLowerCase()
                    )
                  }
                >
                  {saving
                    ? "Working…"
                    : "Confirm"}
                </button>
              </div>
            </section>
          </div>
        )}
    </div>
  );
}

export default PeoplePage;

