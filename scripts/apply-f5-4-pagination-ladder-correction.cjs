const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected source for: ${label}`);
  }
  if (content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected a single source match for: ${label}`);
  }
  return content.slice(0, first) + after + content.slice(first + before.length);
}

function updateFile(path, transforms) {
  let content = read(path);
  for (const transform of transforms) {
    content = replaceOnce(
      content,
      transform.before,
      transform.after,
      `${path}: ${transform.label}`
    );
  }
  write(path, content);
}

updateFile("frontend/src/pages/IncidentsPage.tsx", [
  {
    label: "show five incidents per page",
    before: "const INCIDENTS_PAGE_SIZE = 7;",
    after: "const INCIDENTS_PAGE_SIZE = 5;",
  },
]);

updateFile("frontend/src/F5QaCleanup.css", [
  {
    label: "shrink incident table footprint to five rows",
    before: ".table-wrapper:has(> .incidents-table) {\n  min-height: 458px;\n}",
    after: ".table-wrapper:has(> .incidents-table) {\n  min-height: 346px;\n}",
  },
  {
    label: "add shared compact table pagination",
    before: "@media (max-width: 720px) {",
    after: `/* Shared pagination for management record tables. */
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
  },
]);

updateFile("frontend/src/pages/RoleSettingsRankPage.tsx", [
  {
    label: "show six roles per page",
    before: "const PAGE_SIZE = 10;",
    after: "const PAGE_SIZE = 6;",
  },
]);

updateFile("frontend/src/pages/ChattersPage.tsx", [
  {
    label: "add seven-row chatter page size",
    before: "const CHATTER_HISTORY_PAGE_SIZE = 5;",
    after: "const CHATTER_HISTORY_PAGE_SIZE = 5;\nconst CHATTER_LIST_PAGE_SIZE = 7;",
  },
  {
    label: "add chatter list page state",
    before: `  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    isLoading,`,
    after: `  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    chatterPage,
    setChatterPage,
  ] = useState(1);

  const [
    isLoading,`,
  },
  {
    label: "reset chatter pagination when filters change",
    before: `  }, [search]);

  /*
   * Load chatter list
   */`,
    after: `  }, [search]);

  useEffect(() => {
    setChatterPage(1);
  }, [
    statusFilter,
    debouncedSearch,
  ]);

  /*
   * Load chatter list
   */`,
  },
  {
    label: "derive paginated chatter rows",
    before: `  return (
    <div className="page">`,
    after: `  const chatterPageCount = Math.max(
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
  },
  {
    label: "render only paginated chatter rows",
    before: "                {chatters.map(",
    after: "                {paginatedChatters.map(",
  },
  {
    label: "add chatter list pagination controls",
    before: `        )}
      </section>

      {/* CHATTER PROFILE */}`,
    after: `        )}

        {!isLoading &&
          chatters.length > 0 && (
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
                    Math.max(
                      1,
                      safeChatterPage - 1
                    )
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
                disabled={
                  safeChatterPage >=
                  chatterPageCount
                }
                onClick={() =>
                  setChatterPage(
                    Math.min(
                      chatterPageCount,
                      safeChatterPage + 1
                    )
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
  },
]);

updateFile("frontend/src/pages/RulesPage.tsx", [
  {
    label: "add six-row rules page size",
    before: "function RulesPage() {",
    after: "const RULES_PAGE_SIZE = 6;\n\nfunction RulesPage() {",
  },
  {
    label: "add rule page state",
    before: `  const [
    search,
    setSearch,
  ] = useState("");

  const [
    isLoading,`,
    after: `  const [
    search,
    setSearch,
  ] = useState("");

  const [
    rulePage,
    setRulePage,
  ] = useState(1);

  const [
    isLoading,`,
  },
  {
    label: "derive paginated rule rows",
    before: `  function openArchivedRules() {`,
    after: `  useEffect(() => {
    setRulePage(1);
  }, [search]);

  const rulePageCount = Math.max(
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
    safeRulePage *
      RULES_PAGE_SIZE,
    visibleRules.length
  );

  function openArchivedRules() {`,
  },
  {
    label: "render only paginated rules",
    before: "                {visibleRules.map(",
    after: "                {paginatedRules.map(",
  },
  {
    label: "add rules pagination controls",
    before: `        )}
      </section>

      {/* =====================================================
          ARCHIVED RULES`,
    after: `        )}

        {!isLoading &&
          visibleRules.length > 0 && (
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
                    Math.max(
                      1,
                      safeRulePage - 1
                    )
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
                disabled={
                  safeRulePage >=
                  rulePageCount
                }
                onClick={() =>
                  setRulePage(
                    Math.min(
                      rulePageCount,
                      safeRulePage + 1
                    )
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
  },
]);

updateFile("frontend/src/pages/AuditPage.tsx", [
  {
    label: "add eight-row audit page size",
    before: `const CENTRAL_TIME_ZONE =
  "America/Chicago";`,
    after: `const CENTRAL_TIME_ZONE =
  "America/Chicago";

const AUDIT_PAGE_SIZE = 8;`,
  },
  {
    label: "add audit page state",
    before: `  const loadAudit =`,
    after: `  const [
    auditPage,
    setAuditPage,
  ] = useState(1);

  const loadAudit =`,
  },
  {
    label: "derive paginated audit rows",
    before: `  useEffect(
    () => {
      if (
        !selectedEvent`,
    after: `  useEffect(() => {
    setAuditPage(1);
  }, [
    search,
    action,
    successFilter,
  ]);

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
        !selectedEvent`,
  },
  {
    label: "remove audit read-only note",
    before: `      <div className="audit-readonly-note">
        <strong>
          Read-only history
        </strong>

        <span>
          Audit records cannot be edited or deleted.
        </span>
      </div>

`,
    after: "",
  },
  {
    label: "render only paginated audit rows",
    before: "            {events.map(",
    after: "            {paginatedAuditEvents.map(",
  },
  {
    label: "add audit pagination controls",
    before: `        )}
      </section>

      {selectedEvent && (`,
    after: `        )}

        {!loading &&
          events.length > 0 && (
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
                    Math.max(
                      1,
                      safeAuditPage - 1
                    )
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
                disabled={
                  safeAuditPage >=
                  auditPageCount
                }
                onClick={() =>
                  setAuditPage(
                    Math.min(
                      auditPageCount,
                      safeAuditPage + 1
                    )
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
  },
]);

updateFile("frontend/src/pages/ConfigurationPage.tsx", [
  {
    label: "mark implicit strike ladder base row",
    before: `type LadderDraftStep = {
  clientId: string;
  standingLabel: string;
  deductionPercent: string;
};`,
    after: `type LadderDraftStep = {
  clientId: string;
  isImplicitBase: boolean;
  standingLabel: string;
  deductionPercent: string;
};`,
  },
  {
    label: "preserve or synthesize the hidden base row in the editor",
    before: `    setLadderDraftSteps(
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
    after: `    const orderedSteps =
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
        (step) =>
          step.isImplicitBase
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
  },
  {
    label: "new ladder rows are never implicit base rows",
    before: `        {
          clientId:
            newStepId,

          standingLabel:
            "New Standing",`,
    after: `        {
          clientId:
            newStepId,

          isImplicitBase: false,

          standingLabel:
            "New Standing",`,
  },
  {
    label: "hide only the actual implicit base row",
    before: `                  ) =>
                    index === 0
                      ? null
                      : (`,
    after: `                  ) =>
                    step.isImplicitBase
                      ? null
                      : (`,
  },
]);

console.log("✓ QA Incidents now shows 5 records per page with a smaller stable table footprint.");
console.log("✓ Team Management → Chatters now paginates 7 records per page.");
console.log("✓ Policy Management → Rules & Strike Reasons now paginates 6 records per page.");
console.log("✓ Access Control → Role Settings now paginates 6 roles per page.");
console.log("✓ Audit Log now paginates 8 records per page and the read-only note is removed.");
console.log("✓ Edit Strike Ladder hides only the implicit Clear base row and keeps Formal Warning visible.");
console.log("F.5.4 guarded codemod applied successfully.");
