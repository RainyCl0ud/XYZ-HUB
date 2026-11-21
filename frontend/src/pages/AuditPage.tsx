import AuditRetainedChannels from "./AuditRetainedChannels";
import AuditEmailDelivery from "./AuditEmailDelivery";
import { useEmailDelivery } from "./useEmailDelivery";
import { useAuth } from "../auth/AuthContext";
import {
  useNavigationFilter,
} from "../lib/useNavigationFilter";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  apiRequest,
} from "../lib/api";

import {
  useToast,
} from "../components/ToastProvider";

import "./AuditPage.css";
import { Link, useLocation, useSearchParams, type SetURLSearchParams } from "react-router-dom";

const CENTRAL_TIME_ZONE =
  "America/Chicago";

const AUDIT_PAGE_SIZE = 8;

type AuditParty = {
  label: string;
  secondary: string | null;
  kind: string | null;
};

type AuditChange = {
  label: string;
  before: string | null;
  after: string | null;
  added: string[];
  removed: string[];
};

type AuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  actionLabel: string;
  success: boolean;
  statusCode: number;
  actor: AuditParty;
  target: AuditParty;
  summary: string;
  retainedChannelId?: string;
  changes: AuditChange[];
  source: {
    ipAddress: string | null;
    deviceLabel: string | null;
  };
};

type AuditResponse = {
  events:
    AuditEvent[];
};

type SuccessFilter =
  | "ALL"
  | "SUCCESS"
  | "FAILED";

function formatCentralDateTime(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
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
      second:
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

function AuditPartyDisplay({
  party,
}: {
  party:
    AuditParty;
}) {
  return (
    <span className="audit-party">
      <strong>
        {party.label}
      </strong>

      {party.secondary && (
        <small>
          {party.secondary}
        </small>
      )}
    </span>
  );
}

function AuditPage() {
  const { access } = useAuth();
  const isOwner = access?.roles.some(role => role.systemKey === "OWNER");
  // Sections are tabs so the activity log always comes first. Owners also get
  // Email delivery (with a "!" count when something needs attention) and
  // Cleaned-up channels. The tab lives in the URL; bell notices link to it.
  const emailEnabled = !!isOwner && import.meta.env.VITE_BLOCK2_CHAT_ENABLED === "true";
  const email = useEmailDelivery(emailEnabled);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [channelsRefresh, setChannelsRefresh] = useState(0);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const emailPanel = useRef<HTMLElement>(null);
  const loadEmail = email.load;
  const tabs = [
    { id: "activity", label: "Activity" },
    ...(emailEnabled && !email.hidden ? [{ id: "email", label: "Email delivery" }] : []),
    ...(isOwner ? [{ id: "channels", label: "Cleaned-up channels" }] : []),
  ];
  const requestedTab = searchParams.get("tab") ?? (location.hash === "#email-delivery" ? "email" : "activity");
  const tab = tabs.some((t) => t.id === requestedTab) ? requestedTab : "activity";
  // Arriving at the Email tab (from the bell, or a tab click) shows fresh data.
  // A bell visit also moves focus to the panel; tab clicks keep focus on the tab.
  const fromTabClick = (location.state as { fromTab?: boolean } | null)?.fromTab === true;
  useEffect(() => {
    if (tab !== "email") return;
    void loadEmail();
    if (!fromTabClick) emailPanel.current?.focus();
  }, [tab, location.key, fromTabClick, loadEmail]);
  const toast =
    useToast();

  const [
    events,
    setEvents,
  ] =
    useState<
      AuditEvent[]
    >([]);

  const [
    selectedEvent,
    setSelectedEvent,
  ] =
    useState<
      AuditEvent |
      null
    >(
      null
    );

  const [
    knownActions,
    setKnownActions,
  ] =
    useState<
      {
        value:
          string;
        label:
          string;
      }[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [
    action,
    setAction,
  ] =
    useState(
      ""
    );

  const [
    successFilter,
    setSuccessFilter,
  ] =
    useNavigationFilter<
      SuccessFilter
    >(
      "result",
      [
        "ALL",
        "SUCCESS",
        "FAILED",
      ],
      "ALL"
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    auditPage,
    setAuditPage,
  ] = useState(1);

  const loadAudit =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const params =
            new URLSearchParams();

          if (
            search.trim()
          ) {
            params.set(
              "search",
              search.trim()
            );
          }

          if (
            action
          ) {
            params.set(
              "action",
              action
            );
          }

          if (
            successFilter ===
            "SUCCESS"
          ) {
            params.set(
              "success",
              "true"
            );
          }

          if (
            successFilter ===
            "FAILED"
          ) {
            params.set(
              "success",
              "false"
            );
          }

          params.set(
            "limit",
            "300"
          );

          const response =
            await apiRequest<
              AuditResponse
            >(
              "/api/audit?" +
                params.toString()
            );

          setEvents(
            response.events
          );

          setKnownActions(
            (
              current
            ) => {
              const map =
                new Map(
                  current.map(
                    (
                      item
                    ) => [
                      item.value,
                      item.label,
                    ]
                  )
                );

              for (
                const event
                of response.events
              ) {
                map.set(
                  event.action,
                  event.actionLabel
                );
              }

              return [
                ...map.entries(),
              ]
                .map(
                  (
                    [
                      value,
                      label,
                    ]
                  ) => ({
                    value,
                    label,
                  })
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    first.label.localeCompare(
                      second.label
                    )
                );
            }
          );

          setSelectedEvent(
            (
              current
            ) =>
              current
                ? response.events.find(
                    (
                      event
                    ) =>
                      event.id ===
                      current.id
                  ) ??
                  current
                : null
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load the audit log.";

          setError(
            message
          );

          toast.error(
            message,
            "Audit Log unavailable"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        action,
        search,
        successFilter,
        toast,
      ]
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void loadAudit();
          },
          180
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      loadAudit,
    ]
  );

  const auditPageCount = Math.max(
    1,
    Math.ceil(
      events.length /
        AUDIT_PAGE_SIZE
    )
  );

  const safeAuditPage = Math.min(
    auditPage,
    auditPageCount
  );

  const paginatedAuditEvents = events.slice(
    (safeAuditPage - 1) *
      AUDIT_PAGE_SIZE,
    safeAuditPage *
      AUDIT_PAGE_SIZE
  );

  const auditRangeStart =
    events.length === 0
      ? 0
      : (safeAuditPage - 1) *
          AUDIT_PAGE_SIZE +
        1;

  const auditRangeEnd = Math.min(
    safeAuditPage * AUDIT_PAGE_SIZE,
    events.length
  );

  useEffect(
    () => {
      if (
        !selectedEvent
      ) {
        return;
      }

      const previousOverflow =
        document.body.style
          .overflow;

      document.body.style
        .overflow =
        "hidden";

      const handleKeyDown =
        (
          event:
            KeyboardEvent
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            setSelectedEvent(
              null
            );
          }
        };

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () => {
        document.body.style
          .overflow =
          previousOverflow;

        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      selectedEvent,
    ]
  );

  return (
    <div className="page audit-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Security history
          </p>

          <h2>
            Audit Log
          </h2>

          <p className="page-description">
            Review account, access, role, and creator changes across the agency. Times are shown in US Central time.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            if (tab === "email") void email.load();
            else if (tab === "channels") setChannelsRefresh((n) => n + 1);
            else void loadAudit();
          }}
          disabled={tab === "email" ? email.loading : tab === "channels" ? channelsLoading : loading}
        >
          {(tab === "email" ? email.loading : tab === "channels" ? channelsLoading : loading) ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {tabs.length > 1 && <AuditTabs tabs={tabs} active={tab} setSearchParams={setSearchParams}
        emailBadge={email.attentionTotal ? `! ${email.attentionTotal}` : email.problem ? "!" : ""} />}

      {tab === "email" && <section ref={emailPanel} tabIndex={-1} id="audit-panel-email" role="tabpanel" aria-labelledby="audit-tab-email" className="content-card audit-tab-panel">
        <AuditEmailDelivery state={email} />
      </section>}
      {tab === "channels" && <section id="audit-panel-channels" role="tabpanel" aria-labelledby="audit-tab-channels" className="content-card audit-tab-panel">
        <AuditRetainedChannels refreshKey={channelsRefresh} onLoadingChange={setChannelsLoading} />
      </section>}

      {tab === "activity" && <div id="audit-panel-activity" {...(tabs.length > 1 ? { role: "tabpanel", "aria-labelledby": "audit-tab-activity" } : {})}>
      <section className="content-card audit-toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search people, creators, roles or actions"
          aria-label="Search audit log"
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

        <select
          aria-label="Filter audit log by action"
          value={
            action
          }
          onChange={(
            event
          ) =>
            setAction(
              event.target.value
            )
          }
        >
          <option value="">
            All actions
          </option>

          {knownActions.map(
            (
              item
            ) => (
              <option
                key={
                  item.value
                }
                value={
                  item.value
                }
              >
                {item.label}
              </option>
            )
          )}
        </select>

        <select
          aria-label="Filter audit log by outcome"
          value={
            successFilter
          }
          onChange={(
            event
          ) =>
            setSuccessFilter(
              event.target.value as SuccessFilter
            )
          }
        >
          <option value="ALL">
            All outcomes
          </option>

          <option value="SUCCESS">
            Successful
          </option>

          <option value="FAILED">
            Failed
          </option>
        </select>
      </section>

      {error && (
        <div className="audit-error">
          {error}
        </div>
      )}

      <section className="content-card audit-list-card">
        {loading ? (
          <div className="empty-state">
            <strong>
              Loading audit events…
            </strong>
          </div>
        ) : events.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching audit events
            </strong>

            <span>
              Security and management actions will appear here as they occur.
            </span>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <div className="audit-table audit-table-head">
              <span>
                Time
              </span>

              <span>
                Action
              </span>

              <span>
                Performed by
              </span>

              <span>
                Affected
              </span>

              <span>
                Result
              </span>
            </div>

            {paginatedAuditEvents.map(
              (
                event
              ) => (
                <button
                  key={
                    event.id
                  }
                  type="button"
                  className="audit-table audit-table-row"
                  onClick={() =>
                    setSelectedEvent(
                      event
                    )
                  }
                  aria-label={
                    "View details for " +
                    event.actionLabel
                  }
                >
                  <span className="audit-time">
                    {formatCentralDateTime(
                      event.occurredAt
                    )}
                  </span>

                  <span>
                    <strong className="audit-action">
                      {event.actionLabel}
                    </strong>

                    <small className="audit-summary">
                      {event.summary}
                    </small>
                  </span>

                  <AuditPartyDisplay
                    party={
                      event.actor
                    }
                  />

                  <AuditPartyDisplay
                    party={
                      event.target
                    }
                  />

                  <span className="audit-result-cell">
                    <span
                      className={
                        event.success
                          ? "audit-result success"
                          : "audit-result failed"
                      }
                    >
                      {event.success
                        ? "Success"
                        : "Failed"}
                    </span>

                    <svg
                      className="audit-row-arrow"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="m9 6 6 6-6 6"
                      />
                    </svg>
                  </span>
                </button>
              )
            )}
          </div>
        )}

        {!loading &&
          events.length > 0 &&
          auditPageCount > 1 && (
          <div
            className="compact-table-pagination"
            aria-label="Audit log pagination"
          >
            <span>
              {auditRangeStart}–{auditRangeEnd} of {events.length}
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={safeAuditPage <= 1}
                onClick={() =>
                  setAuditPage(
                    Math.max(1, safeAuditPage - 1)
                  )
                }
              >
                Previous
              </button>

              <strong>
                Page {safeAuditPage} of {auditPageCount}
              </strong>

              <button
                type="button"
                className="secondary-button"
                disabled={safeAuditPage >= auditPageCount}
                onClick={() =>
                  setAuditPage(
                    Math.min(auditPageCount, safeAuditPage + 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
      </div>}

      {selectedEvent && (
        <div
          className="audit-overlay"
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedEvent(
                null
              );
            }
          }}
        >
          <section
            className="audit-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label={
              selectedEvent.actionLabel +
              " details"
            }
          >
            <div className="audit-detail-header">
              <div>
                <span className="page-eyebrow">
                  Audit details
                </span>

                <h3>
                  {selectedEvent.actionLabel}
                </h3>

                <p>
                  {selectedEvent.summary}
                </p>
              </div>

              <button
                type="button"
                className="audit-close"
                onClick={() =>
                  setSelectedEvent(
                    null
                  )
                }
                aria-label="Close audit details"
              >
                ×
              </button>
            </div>

            <div className="audit-detail-body">
              <div className="audit-detail-facts">
                <div>
                  <span>
                    Performed by
                  </span>

                  <strong>
                    {selectedEvent.actor.label}
                  </strong>

                  {selectedEvent.actor.secondary && (
                    <small>
                      {selectedEvent.actor.secondary}
                    </small>
                  )}
                </div>

                <div>
                  <span>
                    Affected
                  </span>

                  <strong>
                    {selectedEvent.target.label}
                  </strong>

                  {selectedEvent.target.secondary && (
                    <small>
                      {selectedEvent.target.secondary}
                    </small>
                  )}
                </div>

                <div>
                  <span>
                    When
                  </span>

                  <strong>
                    {formatCentralDateTime(
                      selectedEvent.occurredAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Result
                  </span>

                  <strong
                    className={
                      selectedEvent.success
                        ? "audit-detail-result success"
                        : "audit-detail-result failed"
                    }
                  >
                    {selectedEvent.success
                      ? "Successful"
                      : "Failed"}
                  </strong>

                  {!selectedEvent.success && (
                    <small>
                      Status {selectedEvent.statusCode}
                    </small>
                  )}
                </div>
              </div>

              {selectedEvent.retainedChannelId && (
                <p>
                  <Link to={`/chat?retained=${encodeURIComponent(selectedEvent.retainedChannelId)}`}>View retained channel history</Link>
                </p>
              )}
              <section className="audit-detail-section">
                <div className="audit-detail-section-heading">
                  <h4>
                    What changed
                  </h4>

                  <p>
                    Only the values that actually changed are shown. Added and removed access is highlighted separately.
                  </p>
                </div>

                {selectedEvent.changes.length >
                0 ? (
                  <div className="audit-change-list">
                    {selectedEvent.changes.map(
                      (
                        change
                      ) => (
                        <div
                          key={
                            change.label
                          }
                          className="audit-change-row"
                        >
                          <strong>
                            {change.label}
                          </strong>

                          {change.added.length >
                            0 ||
                          change.removed.length >
                            0 ? (
                            <div className="audit-change-delta">
                              {change.removed.length >
                                0 && (
                                <div className="audit-delta-group removed">
                                  <span className="audit-delta-label">
                                    <span className="audit-delta-symbol">
                                      −
                                    </span>
                                    Removed
                                  </span>

                                  <div className="audit-delta-chips">
                                    {change.removed.map(
                                      (
                                        item
                                      ) => (
                                        <span
                                          key={
                                            item
                                          }
                                          className="audit-delta-chip removed"
                                        >
                                          {item}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {change.added.length >
                                0 && (
                                <div className="audit-delta-group added">
                                  <span className="audit-delta-label">
                                    <span className="audit-delta-symbol">
                                      +
                                    </span>
                                    Added
                                  </span>

                                  <div className="audit-delta-chips">
                                    {change.added.map(
                                      (
                                        item
                                      ) => (
                                        <span
                                          key={
                                            item
                                          }
                                          className="audit-delta-chip added"
                                        >
                                          {item}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="audit-change-values">
                              <span className="audit-change-value before">
                                <small>
                                  Before
                                </small>

                                <strong>
                                  {change.before ??
                                    "—"}
                                </strong>
                              </span>

                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  d="M5 12h14m-5-5 5 5-5 5"
                                />
                              </svg>

                              <span className="audit-change-value after">
                                <small>
                                  After
                                </small>

                                <strong>
                                  {change.after ??
                                    "—"}
                                </strong>
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="audit-detail-empty">
                    {selectedEvent.success
                      ? "This event did not record a before-and-after data change."
                      : "The requested action failed, so no data change was applied."}
                  </div>
                )}
              </section>

              <section className="audit-detail-section">
                <div className="audit-detail-section-heading">
                  <h4>
                    Request source
                  </h4>

                  <p>
                    Connection information captured with the audit event.
                  </p>
                </div>

                <div className="audit-source-grid">
                  <div>
                    <span>
                      IP address
                    </span>

                    <strong>
                      {selectedEvent.source.ipAddress ??
                        "Not available"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Browser / device
                    </span>

                    <strong>
                      {selectedEvent.source.deviceLabel ??
                        "Not available"}
                    </strong>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type AuditTab = { id: string; label: string };
/** Accessible tab list: arrow keys, Home and End move between sections. */
function AuditTabs({ tabs, active, setSearchParams, emailBadge }: { tabs: AuditTab[]; active: string; setSearchParams: SetURLSearchParams; emailBadge: string }) {
  const choose = (id: string, focus = false) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id === "activity") next.delete("tab"); else next.set("tab", id);
      return next;
    }, { replace: true, state: { fromTab: true } });
    if (focus) window.setTimeout(() => document.getElementById("audit-tab-" + id)?.focus(), 0);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === active);
    const target = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (target < 0) return;
    event.preventDefault();
    choose(tabs[target].id, true);
  };
  return <div className="audit-tabs" role="tablist" aria-label="Audit Log sections" onKeyDown={onKeyDown}>
    {tabs.map((t) => <button key={t.id} type="button" role="tab" id={"audit-tab-" + t.id} aria-selected={active === t.id} aria-controls={"audit-panel-" + t.id}
      tabIndex={active === t.id ? 0 : -1} onClick={() => choose(t.id)}>
      {t.label}
      {t.id === "email" && emailBadge && <>
        <span className="audit-tab-badge" aria-hidden="true">{emailBadge}</span>
        <span className="audit-sr">{emailBadge === "!" ? ", needs a look" : emailBadge === "! 1" ? ", 1 needs attention" : `, ${emailBadge.slice(2)} need attention`}</span>
      </>}
    </button>)}
  </div>;
}

export default AuditPage;
