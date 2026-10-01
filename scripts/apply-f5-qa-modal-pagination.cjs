const fs = require("fs");
const path = require("path");

const root = process.cwd();
const targets = [
  "frontend/src/pages/IncidentsPage.tsx",
  "frontend/src/pages/ChattersPage.tsx",
];

const originals = new Map();
const lineEndings = new Map();

function readNormalized(relativePath) {
  const fullPath = path.join(root, relativePath);
  const original = fs.readFileSync(fullPath, "utf8");
  originals.set(relativePath, original);
  lineEndings.set(relativePath, original.includes("\r\n") ? "\r\n" : "\n");
  return original.replace(/\r\n/g, "\n");
}

function writeNormalized(relativePath, source) {
  const eol = lineEndings.get(relativePath) || "\n";
  fs.writeFileSync(
    path.join(root, relativePath),
    source.replace(/\n/g, eol),
    "utf8"
  );
}

function replaceOne(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) {
    throw new Error(`F.5 codemod could not find: ${label}`);
  }
  const second = source.indexOf(before, first + before.length);
  if (second !== -1) {
    throw new Error(`F.5 codemod found multiple matches for: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceAllExpected(source, before, after, expectedCount, label) {
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `F.5 codemod expected ${expectedCount} matches for ${label}, found ${count}`
    );
  }
  return source.split(before).join(after);
}

try {
  let incidents = readNormalized(targets[0]);
  let chatters = readNormalized(targets[1]);

  incidents = replaceOne(
    incidents,
`import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";`,
`import {
  useSearchParams,
} from "react-router-dom";`,
    "Incidents router import"
  );

  incidents = replaceOne(
    incidents,
`import {
  useToast,
} from "../components/ToastProvider";`,
`import {
  useToast,
} from "../components/ToastProvider";

import QaProfileModal from "../components/QaProfileModal";`,
    "QA profile modal import"
  );

  incidents = replaceOne(
    incidents,
`function IncidentsPage() {
  const toast = useToast();
  const navigate =
    useNavigate();`,
`const INCIDENTS_PAGE_SIZE = 7;

function IncidentsPage() {
  const toast = useToast();`,
    "Incidents page constant and navigate removal"
  );

  incidents = replaceOne(
    incidents,
`  const [
    search,
    setSearch,
  ] = useState("");`,
`  const [
    search,
    setSearch,
  ] = useState("");

  const [
    incidentPage,
    setIncidentPage,
  ] = useState(1);`,
    "Incident page state"
  );

  incidents = replaceOne(
    incidents,
`  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);`,
`  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    qaProfileChatterId,
    setQaProfileChatterId,
  ] = useState<string | null>(
    null
  );`,
    "QA profile overlay state"
  );

  incidents = replaceOne(
    incidents,
`  /*
   * =========================================================
   * LOG INCIDENT
   * =========================================================
   */`,
`  const incidentPageCount =
    Math.max(
      1,
      Math.ceil(
        visibleIncidents.length /
        INCIDENTS_PAGE_SIZE
      )
    );

  const paginatedIncidents =
    useMemo(() => {
      const start =
        (incidentPage - 1) *
        INCIDENTS_PAGE_SIZE;

      return visibleIncidents.slice(
        start,
        start +
          INCIDENTS_PAGE_SIZE
      );
    }, [
      visibleIncidents,
      incidentPage,
    ]);

  useEffect(() => {
    setIncidentPage(1);
  }, [
    search,
    chatterFilter,
    ruleFilter,
    statusFilter,
    strikeActivityFilter,
    modelContextRevision,
  ]);

  useEffect(() => {
    if (
      incidentPage >
      incidentPageCount
    ) {
      setIncidentPage(
        incidentPageCount
      );
    }
  }, [
    incidentPage,
    incidentPageCount,
  ]);

  /*
   * =========================================================
   * LOG INCIDENT
   * =========================================================
   */`,
    "Incident pagination derivation"
  );

  incidents = replaceOne(
    incidents,
`        setShowLogModal(false);
        setSelectedIncident(null);
        setActionType(null);`,
`        setShowLogModal(false);
        setSelectedIncident(null);
        setQaProfileChatterId(null);
        setActionType(null);`,
    "Model-context QA overlay reset"
  );

  incidents = replaceOne(
    incidents,
`  function closeIncidentDetails() {
    if (detailLoading) {
      return;
    }

    setSelectedIncident(null);`,
`  function closeIncidentDetails() {
    if (detailLoading) {
      return;
    }

    setQaProfileChatterId(null);
    setSelectedIncident(null);`,
    "Incident close overlay reset"
  );

  incidents = replaceOne(
    incidents,
`  function formatExpiryLabel(
    status: StrikeActivityStatus
  ) {`,
`  function formatWeightSnapshot(
    name: string | null,
    value: number | null
  ) {
    if (!name) {
      return "—";
    }

    if (value === null) {
      return name;
    }

    const numberPattern =
      new RegExp(
        \\`(^|\\\\D)\\${value}(\\\\D|$)\\`
      );

    return numberPattern.test(name)
      ? name
      : \\`\\${name} (\\${value})\\`;
  }

  function formatExpiryLabel(
    status: StrikeActivityStatus
  ) {`,
    "Weight formatter"
  );

  incidents = replaceOne(
    incidents,
`                {visibleIncidents.map(`,
`                {paginatedIncidents.map(`,
    "Paginated incident rows"
  );

  incidents = replaceOne(
    incidents,
`                        <td>
                          {incident
                            .weightNameSnapshot ? (
                            <div className="weight-display">
                              <span>
                                {
                                  incident
                                    .weightNameSnapshot
                                }
                              </span>

                              {incident
                                .weightValueSnapshot !==
                                null && (
                                <span className="weight-value">
                                  {
                                    incident
                                      .weightValueSnapshot
                                  }
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>`,
`                        <td>
                          {formatWeightSnapshot(
                            incident.weightNameSnapshot,
                            incident.weightValueSnapshot
                          )}
                        </td>`,
    "Incident table weight display"
  );

  incidents = replaceOne(
    incidents,
`            </table>
          </div>
        )}
      </section>`,
`            </table>
          </div>
        )}

        {!isLoading &&
          visibleIncidents.length > 0 &&
          incidentPageCount > 1 && (
          <div className="incident-pagination" aria-label="Incident table pagination">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setIncidentPage(
                  (current) =>
                    Math.max(
                      1,
                      current - 1
                    )
                )
              }
              disabled={
                incidentPage <= 1
              }
            >
              Previous
            </button>

            <span>
              Page {incidentPage} of {incidentPageCount}
            </span>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setIncidentPage(
                  (current) =>
                    Math.min(
                      incidentPageCount,
                      current + 1
                    )
                )
              }
              disabled={
                incidentPage >=
                incidentPageCount
              }
            >
              Next
            </button>
          </div>
        )}
      </section>`,
    "Incident table pagination controls"
  );

  incidents = replaceOne(
    incidents,
`                    <div className="incident-detail-top">
                      <div>
                        <span className="detail-label">
                          Chatter
                        </span>

                        <strong>
                          {
                            selectedIncident
                              .chatter
                              .name
                          }
                        </strong>
                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "8px",
                          flexWrap:
                            "wrap",
                          justifyContent:
                            "flex-end",
                        }}
                      >`,
`                    <div className="incident-detail-top">
                      <div className="incident-detail-chatter-row">
                        <div>
                          <span className="detail-label">
                            Chatter
                          </span>

                          <strong>
                            {
                              selectedIncident
                                .chatter
                                .name
                            }
                          </strong>
                        </div>

                        <button
                          type="button"
                          className="secondary-button incident-qa-profile-button"
                          onClick={() =>
                            setQaProfileChatterId(
                              selectedIncident.chatter.id
                            )
                          }
                        >
                          View QA Profile
                        </button>
                      </div>

                      <div className="incident-detail-statuses">`,
    "Incident header QA profile placement"
  );

  incidents = replaceOne(
    incidents,
`                        <div>
                          <span>
                            Rule Version
                          </span>

                          <strong>
                            v
                            {
                              selectedIncident
                                .ruleVersion
                                .versionNumber
                            }
                          </strong>
                        </div>

`,
``,
    "Incident modal Rule Version removal"
  );

  incidents = replaceOne(
    incidents,
`                          <strong>
                            {selectedIncident
                              .weightNameSnapshot ??
                              "None"}

                            {selectedIncident
                              .weightValueSnapshot !==
                              null &&
                              \\` (\\${selectedIncident.weightValueSnapshot})\\`}
                          </strong>`,
`                          <strong>
                            {formatWeightSnapshot(
                              selectedIncident.weightNameSnapshot,
                              selectedIncident.weightValueSnapshot
                            )}
                          </strong>`,
    "Incident modal weight display"
  );

  incidents = replaceOne(
    incidents,
`                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          navigate(
                            \\`/chatters?chatterId=\\${encodeURIComponent(
                              selectedIncident.chatter.id
                            )}\\`
                          )
                        }
                      >
                        View Chatter Profile
                      </button>

                      {selectedIncident.chatter.userId && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            navigate(
                              \\`/people?personId=\\${encodeURIComponent(
                                selectedIncident.chatter.userId ?? ""
                              )}\\`
                            )
                          }
                        >
                          View Employee Profile
                        </button>
                      )}

`,
``,
    "Incident footer profile buttons"
  );

  incidents = replaceAllExpected(
    incidents,
`                            setSelectedIncident(
                              null
                            );

                            openAction(`,
`                            closeIncidentDetails();

                            openAction(`,
    2,
    "Resolve/Void URL-safe close"
  );

  incidents = replaceOne(
    incidents,
`      {/* =====================================================
          RESOLVE / VOID MODAL
          ===================================================== */}`,
`      {qaProfileChatterId && (
        <QaProfileModal
          chatterId={qaProfileChatterId}
          onClose={() =>
            setQaProfileChatterId(
              null
            )
          }
          onOpenIncident={(incidentId) => {
            setQaProfileChatterId(
              null
            );

            const nextParams =
              new URLSearchParams(
                searchParams
              );
            nextParams.set(
              "incidentId",
              incidentId
            );
            setSearchParams(
              nextParams,
              {
                replace: true,
              }
            );

            void openIncidentDetails(
              incidentId
            );
          }}
        />
      )}

      {/* =====================================================
          RESOLVE / VOID MODAL
          ===================================================== */}`,
    "QA profile overlay render"
  );

  chatters = replaceOne(
    chatters,
`const TEXAS_TIME_ZONE =
  "America/Chicago";`,
`const TEXAS_TIME_ZONE =
  "America/Chicago";

const CHATTER_HISTORY_PAGE_SIZE = 5;`,
    "Chatter history page size"
  );

  chatters = replaceOne(
    chatters,
`  const [
    expandedIncidentId,
    setExpandedIncidentId,
  ] =
    useState<string | null>(
      null
    );`,
`  const [
    expandedIncidentId,
    setExpandedIncidentId,
  ] =
    useState<string | null>(
      null
    );

  const [
    historyPage,
    setHistoryPage,
  ] = useState(1);`,
    "Chatter history page state"
  );

  chatters = replaceAllExpected(
    chatters,
`    setExpandedIncidentId(
      null
    );`,
`    setExpandedIncidentId(
      null
    );

    setHistoryPage(1);`,
    2,
    "Chatter profile history reset"
  );

  chatters = replaceOne(
    chatters,
`  const visibleIncidents =
    useMemo(() => {
      return chatterIncidents
        .filter(
          (incident) => {
            const matchesIncidentStatus =
              incidentFilter === "ALL" ||
              incident.status ===
                incidentFilter;

            const matchesStrikeStatus =
              strikeFilter === "ALL" ||
              incident.strikeActivityStatus ===
                strikeFilter;

            return (
              matchesIncidentStatus &&
              matchesStrikeStatus
            );
          }
        )
        .slice(0, 5);
    }, [
      chatterIncidents,
      incidentFilter,
      strikeFilter,
    ]);`,
`  const filteredIncidents =
    useMemo(() => {
      return chatterIncidents.filter(
        (incident) => {
          const matchesIncidentStatus =
            incidentFilter === "ALL" ||
            incident.status ===
              incidentFilter;

          const matchesStrikeStatus =
            strikeFilter === "ALL" ||
            incident.strikeActivityStatus ===
              strikeFilter;

          return (
            matchesIncidentStatus &&
            matchesStrikeStatus
          );
        }
      );
    }, [
      chatterIncidents,
      incidentFilter,
      strikeFilter,
    ]);

  const historyPageCount =
    Math.max(
      1,
      Math.ceil(
        filteredIncidents.length /
        CHATTER_HISTORY_PAGE_SIZE
      )
    );

  const visibleIncidents =
    useMemo(() => {
      const start =
        (historyPage - 1) *
        CHATTER_HISTORY_PAGE_SIZE;

      return filteredIncidents.slice(
        start,
        start +
          CHATTER_HISTORY_PAGE_SIZE
      );
    }, [
      filteredIncidents,
      historyPage,
    ]);

  useEffect(() => {
    setHistoryPage(1);
    setExpandedIncidentId(
      null
    );
  }, [
    incidentFilter,
    strikeFilter,
    selectedChatter?.id,
  ]);

  useEffect(() => {
    if (
      historyPage >
      historyPageCount
    ) {
      setHistoryPage(
        historyPageCount
      );
    }
  }, [
    historyPage,
    historyPageCount,
  ]);`,
    "Chatter history pagination derivation"
  );

  chatters = replaceOne(
    chatters,
`                      <div className="chatter-standing-metric">
                        <span>
                          Ladder Version
                        </span>

                        <strong>
                          v
                          {
                            chatterStrikeSummary.ladderVersion
                          }
                        </strong>
                      </div>
`,
``,
    "Duplicate Ladder Version metric"
  );

  chatters = replaceOne(
    chatters,
`                    )}
                  </div>
                )}
              </section>`,
`                    )}
                  </div>
                )}

                {!detailsLoading &&
                  filteredIncidents.length > 0 &&
                  historyPageCount > 1 && (
                  <div className="qa-history-pagination" aria-label="Chatter QA history pagination">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setHistoryPage(
                          (current) =>
                            Math.max(
                              1,
                              current - 1
                            )
                        )
                      }
                      disabled={
                        historyPage <= 1
                      }
                    >
                      Previous
                    </button>

                    <span>
                      Page {historyPage} of {historyPageCount}
                    </span>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setHistoryPage(
                          (current) =>
                            Math.min(
                              historyPageCount,
                              current + 1
                            )
                        )
                      }
                      disabled={
                        historyPage >=
                        historyPageCount
                      }
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>`,
    "Chatter QA history pagination controls"
  );

  writeNormalized(targets[0], incidents);
  writeNormalized(targets[1], chatters);

  console.log("✓ Incidents modal flow, presentation and 7-row pagination updated.");
  console.log("✓ Chatter QA history now paginates and removes duplicate ladder version.");
  console.log("F.5 QA modal/pagination codemod applied successfully.");
} catch (error) {
  for (const [relativePath, original] of originals) {
    fs.writeFileSync(path.join(root, relativePath), original, "utf8");
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
