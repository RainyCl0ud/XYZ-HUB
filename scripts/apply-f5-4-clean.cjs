const fs = require("fs");

const files = new Map();

function read(path) {
  if (!files.has(path)) {
    files.set(path, fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
  }
  return files.get(path);
}

function replaceOnce(path, before, after, label) {
  const content = read(path);
  const first = content.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected source for: ${label}`);
  }
  if (content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one source match for: ${label}`);
  }
  files.set(
    path,
    content.slice(0, first) + after + content.slice(first + before.length)
  );
}

function assertContains(path, value, label) {
  if (!read(path).includes(value)) {
    throw new Error(`Validation failed: ${label}`);
  }
}

function assertNotContains(path, value, label) {
  if (read(path).includes(value)) {
    throw new Error(`Validation failed: ${label}`);
  }
}

// 1) QA Incidents: 5 rows/page + smaller stable footprint.
replaceOnce(
  "frontend/src/pages/IncidentsPage.tsx",
  "const INCIDENTS_PAGE_SIZE = 7;",
  "const INCIDENTS_PAGE_SIZE = 5;",
  "Incidents page size"
);

replaceOnce(
  "frontend/src/F5QaCleanup.css",
  ".table-wrapper:has(> .incidents-table) {\n  min-height: 458px;\n}",
  ".table-wrapper:has(> .incidents-table) {\n  min-height: 346px;\n}",
  "Incidents table stable five-row footprint"
);

replaceOnce(
  "frontend/src/F5QaCleanup.css",
  "@media (max-width: 720px) {",
  `/* Shared compact pagination for management record tables. */
.compact-table-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border-soft);
}

.compact-table-pagination > span {
  color: var(--text-muted);
  font-size: 11px;
}

.compact-table-pagination > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-table-pagination strong {
  min-width: 78px;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
}

.compact-table-pagination .secondary-button {
  min-height: 32px;
  padding: 6px 10px;
}

@media (max-width: 720px) {`,
  "Shared compact pagination styling"
);

// 2) Team Management -> Chatters: 7 rows/page.
replaceOnce(
  "frontend/src/pages/ChattersPage.tsx",
  "const CHATTER_HISTORY_PAGE_SIZE = 5;",
  "const CHATTER_HISTORY_PAGE_SIZE = 5;\nconst CHATTER_LIST_PAGE_SIZE = 7;",
  "Chatter list page size"
);

replaceOnce(
  "frontend/src/pages/ChattersPage.tsx",
  `  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    isLoading,`,
  `  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    chatterPage,
    setChatterPage,
  ] = useState(1);

  const [
    isLoading,`,
  "Chatter list page state"
);

replaceOnce(
  "frontend/src/pages/ChattersPage.tsx",
  `  return (
    <div className="page">`,
  `  const chatterPageCount = Math.max(
    1,
    Math.ceil(
      chatters.length /
        CHATTER_LIST_PAGE_SIZE
    )
  );

  const safeChatterPage = Math.min(
    chatterPage,
    chatterPageCount
  );

  const paginatedChatters = chatters.slice(
    (safeChatterPage - 1) *
      CHATTER_LIST_PAGE_SIZE,
    safeChatterPage *
      CHATTER_LIST_PAGE_SIZE
  );

  const chatterRangeStart =
    chatters.length === 0
      ? 0
      : (safeChatterPage - 1) *
          CHATTER_LIST_PAGE_SIZE +
        1;

  const chatterRangeEnd = Math.min(
    safeChatterPage *
      CHATTER_LIST_PAGE_SIZE,
    chatters.length
  );

  return (
    <div className="page">`,
  "Chatter paginated row derivation"
);

replaceOnce(
  "frontend/src/pages/ChattersPage.tsx",
  "                {chatters.map(",
  "                {paginatedChatters.map(",
  "Chatter paginated render"
);

replaceOnce(
  "frontend/src/pages/ChattersPage.tsx",
  `        )}
      </section>

      {/* CHATTER PROFILE */}`,
  `        )}

        {!isLoading &&
          chatters.length > 0 &&
          chatterPageCount > 1 && (
          <div
            className="compact-table-pagination"
            aria-label="Chatter table pagination"
          >
            <span>
              {chatterRangeStart}–{chatterRangeEnd} of {chatters.length}
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={safeChatterPage <= 1}
                onClick={() =>
                  setChatterPage(
                    Math.max(1, safeChatterPage - 1)
                  )
                }
              >
                Previous
              </button>

              <strong>
                Page {safeChatterPage} of {chatterPageCount}
              </strong>

              <button
                type="button"
                className="secondary-button"
                disabled={safeChatterPage >= chatterPageCount}
                onClick={() =>
                  setChatterPage(
                    Math.min(chatterPageCount, safeChatterPage + 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* CHATTER PROFILE */}`,
  "Chatter pagination controls"
);

// 3) Policy Management -> Rules: 6 rows/page.
replaceOnce(
  "frontend/src/pages/RulesPage.tsx",
  "function RulesPage() {",
  "const RULES_PAGE_SIZE = 6;\n\nfunction RulesPage() {",
  "Rules page size"
);

replaceOnce(
  "frontend/src/pages/RulesPage.tsx",
  `  const [
    search,
    setSearch,
  ] = useState("");

  const [
    isLoading,`,
  `  const [
    search,
    setSearch,
  ] = useState("");

  const [
    rulePage,
    setRulePage,
  ] = useState(1);

  const [
    isLoading,`,
  "Rules page state"
);

replaceOnce(
  "frontend/src/pages/RulesPage.tsx",
  "  function openArchivedRules() {",
  `  const rulePageCount = Math.max(
    1,
    Math.ceil(
      visibleRules.length /
        RULES_PAGE_SIZE
    )
  );

  const safeRulePage = Math.min(
    rulePage,
    rulePageCount
  );

  const paginatedRules = visibleRules.slice(
    (safeRulePage - 1) *
      RULES_PAGE_SIZE,
    safeRulePage *
      RULES_PAGE_SIZE
  );

  const ruleRangeStart =
    visibleRules.length === 0
      ? 0
      : (safeRulePage - 1) *
          RULES_PAGE_SIZE +
        1;

  const ruleRangeEnd = Math.min(
    safeRulePage * RULES_PAGE_SIZE,
    visibleRules.length
  );

  function openArchivedRules() {`,
  "Rules paginated row derivation"
);

replaceOnce(
  "frontend/src/pages/RulesPage.tsx",
  "                {visibleRules.map(",
  "                {paginatedRules.map(",
  "Rules paginated render"
);

replaceOnce(
  "frontend/src/pages/RulesPage.tsx",
  `        )}
      </section>

      {/* =====================================================
          ARCHIVED RULES`,
  `        )}

        {!isLoading &&
          visibleRules.length > 0 &&
          rulePageCount > 1 && (
          <div
            className="compact-table-pagination"
            aria-label="Rules table pagination"
          >
            <span>
              {ruleRangeStart}–{ruleRangeEnd} of {visibleRules.length}
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={safeRulePage <= 1}
                onClick={() =>
                  setRulePage(
                    Math.max(1, safeRulePage - 1)
                  )
                }
              >
                Previous
              </button>

              <strong>
                Page {safeRulePage} of {rulePageCount}
              </strong>

              <button
                type="button"
                className="secondary-button"
                disabled={safeRulePage >= rulePageCount}
                onClick={() =>
                  setRulePage(
                    Math.min(rulePageCount, safeRulePage + 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =====================================================
          ARCHIVED RULES`,
  "Rules pagination controls"
);

// 4) Access Control -> Role Settings: 6 rows/page.
replaceOnce(
  "frontend/src/pages/RoleSettingsRankPage.tsx",
  "const PAGE_SIZE = 10;",
  "const PAGE_SIZE = 6;",
  "Role Settings page size"
);

// 5) Audit Log: 8 rows/page + remove read-only note.
replaceOnce(
  "frontend/src/pages/AuditPage.tsx",
  `const CENTRAL_TIME_ZONE =
  "America/Chicago";`,
  `const CENTRAL_TIME_ZONE =
  "America/Chicago";

const AUDIT_PAGE_SIZE = 8;`,
  "Audit page size"
);

replaceOnce(
  "frontend/src/pages/AuditPage.tsx",
  `  const loadAudit =`,
  `  const [
    auditPage,
    setAuditPage,
  ] = useState(1);

  const loadAudit =`,
  "Audit page state"
);

replaceOnce(
  "frontend/src/pages/AuditPage.tsx",
  `  useEffect(
    () => {
      if (
        !selectedEvent`,
  `  const auditPageCount = Math.max(
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
        !selectedEvent`,
  "Audit paginated row derivation"
);

replaceOnce(
  "frontend/src/pages/AuditPage.tsx",
  `      <div className="audit-readonly-note">
        <strong>
          Read-only history
        </strong>

        <span>
          Audit records cannot be edited or deleted.
        </span>
      </div>

`,
  "",
  "Remove Audit read-only note"
);

replaceOnce(
  "frontend/src/pages/AuditPage.tsx",
  "            {events.map(",
  "            {paginatedAuditEvents.map(",
  "Audit paginated render"
);

replaceOnce(
  "frontend/src/pages/AuditPage.tsx",
  `        )}
      </section>

      {selectedEvent && (`,
  `        )}

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

      {selectedEvent && (`,
  "Audit pagination controls"
);

// 6) Strike Ladder editor: hide only the actual 0-strike base row.
replaceOnce(
  "frontend/src/pages/ConfigurationPage.tsx",
  `type LadderDraftStep = {
  clientId: string;
  standingLabel: string;
  deductionPercent: string;
};`,
  `type LadderDraftStep = {
  clientId: string;
  isImplicitBase: boolean;
  standingLabel: string;
  deductionPercent: string;
};`,
  "Ladder draft implicit-base marker"
);

replaceOnce(
  "frontend/src/pages/ConfigurationPage.tsx",
  `    setLadderDraftSteps(
      [...currentLadder.steps]
        .sort(
          (first, second) =>
            first.minActiveStrikes -
            second.minActiveStrikes
        )
        .map(
          (step, index) => ({
            clientId:
              nextLadderDraftId(),

            standingLabel:
              step.standingLabel,

            /*
             * The base 0-strike row always carries a fixed
             * 0% deduction. Historical data is therefore
             * normalized in the editor as well.
             */
            deductionPercent:
              index === 0
                ? "0"
                : String(
                    step.deductionPercent
                  ),
          })
        )
    );`,
  `    const orderedSteps =
      [...currentLadder.steps].sort(
        (first, second) =>
          first.minActiveStrikes -
          second.minActiveStrikes
      );

    const draftSteps:
      LadderDraftStep[] =
      orderedSteps.map(
        (step) => ({
          clientId:
            nextLadderDraftId(),

          isImplicitBase:
            step.minActiveStrikes === 0,

          standingLabel:
            step.standingLabel,

          deductionPercent:
            step.minActiveStrikes === 0
              ? "0"
              : String(
                  step.deductionPercent
                ),
        })
      );

    if (
      !draftSteps.some(
        (step) => step.isImplicitBase
      )
    ) {
      draftSteps.unshift({
        clientId:
          nextLadderDraftId(),
        isImplicitBase: true,
        standingLabel: "Clear",
        deductionPercent: "0",
      });
    }

    setLadderDraftSteps(
      draftSteps
    );`,
  "Ladder editor base-row preservation"
);

replaceOnce(
  "frontend/src/pages/ConfigurationPage.tsx",
  `        {
          clientId:
            newStepId,

          standingLabel:
            "New Standing",`,
  `        {
          clientId:
            newStepId,

          isImplicitBase: false,

          standingLabel:
            "New Standing",`,
  "New ladder step implicit-base flag"
);

replaceOnce(
  "frontend/src/pages/ConfigurationPage.tsx",
  `                  ) =>
                    index === 0
                      ? null
                      : (`,
  `                  ) =>
                    step.isImplicitBase
                      ? null
                      : (`,
  "Hide only actual implicit ladder base row"
);

// Sanity checks before ANY file is written.
assertContains("frontend/src/pages/IncidentsPage.tsx", "const INCIDENTS_PAGE_SIZE = 5;", "Incidents page size = 5");
assertContains("frontend/src/pages/ChattersPage.tsx", "const CHATTER_LIST_PAGE_SIZE = 7;", "Chatters page size = 7");
assertContains("frontend/src/pages/ChattersPage.tsx", "{paginatedChatters.map(", "Chatters renders paginated rows");
assertContains("frontend/src/pages/RulesPage.tsx", "const RULES_PAGE_SIZE = 6;", "Rules page size = 6");
assertContains("frontend/src/pages/RulesPage.tsx", "{paginatedRules.map(", "Rules renders paginated rows");
assertContains("frontend/src/pages/RoleSettingsRankPage.tsx", "const PAGE_SIZE = 6;", "Role Settings page size = 6");
assertContains("frontend/src/pages/AuditPage.tsx", "const AUDIT_PAGE_SIZE = 8;", "Audit page size = 8");
assertContains("frontend/src/pages/AuditPage.tsx", "{paginatedAuditEvents.map(", "Audit renders paginated rows");
assertNotContains("frontend/src/pages/AuditPage.tsx", "Read-only history", "Audit read-only note removed");
assertNotContains("frontend/src/pages/AuditPage.tsx", "Audit records cannot be edited or deleted.", "Audit explanatory note removed");
assertContains("frontend/src/pages/ConfigurationPage.tsx", "step.isImplicitBase", "Ladder hides by actual base marker");
assertContains("frontend/src/pages/ConfigurationPage.tsx", "step.minActiveStrikes === 0", "Ladder marks actual zero threshold");
assertContains("frontend/src/F5QaCleanup.css", "min-height: 346px;", "Incident table five-row footprint");

// All guards passed. Only now write application files.
for (const [path, content] of files) {
  fs.writeFileSync(path, content.replace(/\n/g, "\r\n"), "utf8");
}

console.log("✓ QA Incidents: 5 rows/page and compact stable table footprint.");
console.log("✓ Chatters: 7 rows/page.");
console.log("✓ Rules & Strike Reasons: 6 rows/page.");
console.log("✓ Role Settings: 6 rows/page.");
console.log("✓ Audit Log: 8 rows/page; read-only note removed.");
console.log("✓ Strike Ladder: only Clear/0 is hidden; Formal Warning remains visible.");
console.log("F.5.4 clean transactional patch applied successfully.");
