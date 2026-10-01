const fs = require("fs");
const path = require("path");

const root = process.cwd();
const files = {
  incidents: "frontend/src/pages/IncidentsPage.tsx",
  chatters: "frontend/src/pages/ChattersPage.tsx",
};

const originals = new Map();
const endings = new Map();

function read(relativePath) {
  const full = path.join(root, relativePath);
  const original = fs.readFileSync(full, "utf8");
  originals.set(relativePath, original);
  endings.set(relativePath, original.includes("\r\n") ? "\r\n" : "\n");
  return original.replace(/\r\n/g, "\n");
}

function write(relativePath, source) {
  const eol = endings.get(relativePath) || "\n";
  fs.writeFileSync(
    path.join(root, relativePath),
    source.replace(/\n/g, eol),
    "utf8"
  );
}

function replaceOne(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`F.5 expected 1 match for ${label}, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceCount(source, before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`F.5 expected ${expected} matches for ${label}, found ${count}`);
  }
  return source.split(before).join(after);
}

function replaceRegexOne(source, regex, after, label) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);
  const matches = [...source.matchAll(global)];
  if (matches.length !== 1) {
    throw new Error(`F.5 expected 1 regex match for ${label}, found ${matches.length}`);
  }
  return source.replace(regex, after);
}

try {
  let incidents = read(files.incidents);
  let chatters = read(files.chatters);

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
    "QA profile import"
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
    "Incidents page setup"
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
    "Incident pagination state"
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
    "QA overlay state"
  );

  incidents = replaceOne(
    incidents,
`    }, [
      incidents,
      search,
      strikeActivityFilter,
    ]);

  /*
   * =========================================================
   * LOG INCIDENT
   * =========================================================
   */`,
`    }, [
      incidents,
      search,
      strikeActivityFilter,
    ]);

  const incidentPageCount =
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
    "Model context overlay reset"
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
`                {visibleIncidents.map(`,
`                {paginatedIncidents.map(`,
    "Incident paginated rows"
  );

  incidents = replaceRegexOne(
    incidents,
    /<td>\n\s*\{incident\n\s*\.weightNameSnapshot \? \([\s\S]*?\n\s*<\/td>/,
`<td>
                          {incident.weightNameSnapshot ??
                            "—"}
                        </td>`,
    "Incident table weight"
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
    "Incident pagination controls"
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
    "Incident QA profile placement"
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
    "Incident modal Rule Version"
  );

  incidents = replaceRegexOne(
    incidents,
    /<span>\n\s*Weight\n\s*<\/span>\n\n\s*<strong>\n\s*\{selectedIncident[\s\S]*?<\/strong>/,
`<span>
                            Weight
                          </span>

                          <strong>
                            {selectedIncident.weightNameSnapshot ??
                              "None"}
                          </strong>`,
    "Incident modal weight"
  );

  incidents = replaceRegexOne(
    incidents,
    /(<div className="incident-detail-actions">)\n\s*<button\n\s*type="button"\n\s*className="secondary-button"[\s\S]*?View Chatter Profile\n\s*<\/button>\n\n\s*\{selectedIncident\.chatter\.userId && \([\s\S]*?View Employee Profile\n\s*<\/button>\n\s*\)\}\n/,
`$1
`,
    "Incident footer profile buttons"
  );

  incidents = replaceCount(
    incidents,
`                            setSelectedIncident(
                              null
                            );

                            openAction(`,
`                            closeIncidentDetails();

                            openAction(`,
    2,
    "Resolve and Void close flow"
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
    "QA overlay render"
  );

  chatters = replaceOne(
    chatters,
`const TEXAS_TIME_ZONE =
  "America/Chicago";`,
`const TEXAS_TIME_ZONE =
  "America/Chicago";

const CHATTER_HISTORY_PAGE_SIZE = 5;`,
    "Chatter page size"
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

  chatters = replaceCount(
    chatters,
`    setExpandedIncidentId(
      null
    );`,
`    setExpandedIncidentId(
      null
    );

    setHistoryPage(1);`,
    2,
    "Chatter history resets"
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
    "Duplicate chatter Ladder Version"
  );

  chatters = replaceOne(
    chatters,
`                    )}
                  </div>
                )}
              </section>
            </div>`,
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
              </section>
            </div>`,
    "Chatter history pagination controls"
  );

  write(files.incidents, incidents);
  write(files.chatters, chatters);

  console.log("✓ Incidents: in-context QA profile, modal cleanup and 7-row pagination applied.");
  console.log("✓ Chatters: QA history pagination and redundant Ladder Version removal applied.");
  console.log("F.5 QA modal/pagination v2 codemod applied successfully.");
} catch (error) {
  for (const [relativePath, original] of originals) {
    fs.writeFileSync(
      path.join(root, relativePath),
      original,
      "utf8"
    );
  }

  console.error(
    error instanceof Error
      ? error.message
      : error
  );
  process.exit(1);
}
