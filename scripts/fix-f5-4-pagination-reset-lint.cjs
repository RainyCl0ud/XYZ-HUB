const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content.replace(/\n/g, "\r\n"), "utf8");
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

function update(path, transforms) {
  let content = read(path);
  for (const transform of transforms) {
    content = replaceOnce(content, transform.before, transform.after, `${path}: ${transform.label}`);
  }
  write(path, content);
}

update("frontend/src/pages/AuditPage.tsx", [
  {
    label: "remove effect-based audit pagination reset",
    before: `  useEffect(() => {
    setAuditPage(1);
  }, [
    search,
    action,
    successFilter,
  ]);

`,
    after: "",
  },
  {
    label: "reset audit page from search interaction",
    before: `          onChange={(
            event
          ) =>
            setSearch(
              event.target.value
            )
          }`,
    after: `          onChange={(
            event
          ) => {
            setSearch(
              event.target.value
            );
            setAuditPage(1);
          }`,
  },
  {
    label: "reset audit page from action filter interaction",
    before: `          onChange={(
            event
          ) =>
            setAction(
              event.target.value
            )
          }`,
    after: `          onChange={(
            event
          ) => {
            setAction(
              event.target.value
            );
            setAuditPage(1);
          }`,
  },
  {
    label: "reset audit page from outcome filter interaction",
    before: `          onChange={(
            event
          ) =>
            setSuccessFilter(
              event.target.value as SuccessFilter
            )
          }`,
    after: `          onChange={(
            event
          ) => {
            setSuccessFilter(
              event.target.value as SuccessFilter
            );
            setAuditPage(1);
          }`,
  },
  {
    label: "remove audit read-only history note",
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
]);

update("frontend/src/pages/ChattersPage.tsx", [
  {
    label: "remove effect-based chatter pagination reset",
    before: `  useEffect(() => {
    setChatterPage(1);
  }, [
    statusFilter,
    debouncedSearch,
  ]);

`,
    after: "",
  },
  {
    label: "reset chatter page from search interaction",
    before: `              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }`,
    after: `              onChange={(event) => {
                setSearch(
                  event.target.value
                );
                setChatterPage(1);
              }`,
  },
  {
    label: "reset chatter page when All is selected",
    before: `                onClick={() =>
                  setStatusFilter(
                    "ALL"
                  )
                }`,
    after: `                onClick={() => {
                  setStatusFilter(
                    "ALL"
                  );
                  setChatterPage(1);
                }`,
  },
  {
    label: "reset chatter page when Active is selected",
    before: `                onClick={() =>
                  setStatusFilter(
                    "ACTIVE"
                  )
                }`,
    after: `                onClick={() => {
                  setStatusFilter(
                    "ACTIVE"
                  );
                  setChatterPage(1);
                }`,
  },
  {
    label: "reset chatter page when Inactive is selected",
    before: `                onClick={() =>
                  setStatusFilter(
                    "INACTIVE"
                  )
                }`,
    after: `                onClick={() => {
                  setStatusFilter(
                    "INACTIVE"
                  );
                  setChatterPage(1);
                }`,
  },
]);

update("frontend/src/pages/RulesPage.tsx", [
  {
    label: "remove effect-based rules pagination reset",
    before: `  useEffect(() => {
    setRulePage(1);
  }, [search]);

`,
    after: "",
  },
  {
    label: "reset rules page from search interaction",
    before: `              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }`,
    after: `              onChange={(event) => {
                setSearch(
                  event.target.value
                );
                setRulePage(1);
              }`,
  },
]);

console.log("✓ Audit read-only note removed.");
console.log("✓ Audit pagination resets from filter interactions without effect-driven setState.");
console.log("✓ Chatter pagination resets from search/status interactions without effect-driven setState.");
console.log("✓ Rules pagination resets from search interaction without effect-driven setState.");
console.log("F.5.4 pagination lint repair applied successfully.");
