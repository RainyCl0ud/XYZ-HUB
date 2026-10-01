const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const files = [
  "frontend/src/pages/PeoplePage.tsx",
  "frontend/src/pages/ChattersPage.tsx",
  "frontend/src/pages/IncidentsPage.tsx",
];
const fileEndings = new Map();

function read(file) {
  const raw = fs.readFileSync(path.join(root, file), "utf8");

  if (!fileEndings.has(file)) {
    fileEndings.set(
      file,
      raw.includes("\r\n") ? "\r\n" : "\n"
    );
  }

  return raw.replace(/\r\n/g, "\n");
}

function write(file, content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const eol = fileEndings.get(file) ?? "\n";
  const output = eol === "\r\n"
    ? normalized.replace(/\n/g, "\r\n")
    : normalized;

  fs.writeFileSync(path.join(root, file), output, "utf8");
}

function replaceOnce(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  const last = source.lastIndexOf(oldText);

  if (first < 0) {
    throw new Error(`F.4 navigation codemod could not find: ${label}`);
  }
  if (first !== last) {
    throw new Error(`F.4 navigation codemod found multiple matches for: ${label}`);
  }

  return source.slice(0, first) + newText + source.slice(first + oldText.length);
}

const originals = new Map(files.map((file) => [file, read(file)]));

try {
  {
    const file = files[0];
    let source = read(file);

    source = replaceOnce(
      source,
      `import type {\n  CSSProperties,\n  FormEvent,\n  KeyboardEvent as ReactKeyboardEvent,\n} from "react";\n\nimport {\n  PEOPLE_CHANGED_EVENT,`,
      `import type {\n  CSSProperties,\n  FormEvent,\n  KeyboardEvent as ReactKeyboardEvent,\n} from "react";\n\nimport {\n  useSearchParams,\n} from "react-router-dom";\n\nimport {\n  PEOPLE_CHANGED_EVENT,`,
      "People search-param import"
    );

    source = replaceOnce(
      source,
      `function PeoplePage() {\n  const toast = useToast();\n  const { user } = useAuth();`,
      `function PeoplePage() {\n  const toast = useToast();\n  const { user } = useAuth();\n  const [\n    searchParams,\n    setSearchParams,\n  ] = useSearchParams();\n  const requestedPersonId =\n    searchParams.get(\n      "personId"\n    );`,
      "People deep-link state"
    );

    source = replaceOnce(
      source,
      `  async function refreshPerson(userId: string) {\n    const [response] = await Promise.all([`,
      `  useEffect(() => {\n    if (\n      !requestedPersonId ||\n      loading ||\n      selectedPerson?.id ===\n        requestedPersonId\n    ) {\n      return;\n    }\n\n    const requestedPerson =\n      people.find(\n        (person) =>\n          person.id ===\n          requestedPersonId\n      );\n\n    if (requestedPerson) {\n      void openPerson(\n        requestedPerson\n      );\n    }\n    // This effect intentionally opens a visible employee from the URL.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [\n    requestedPersonId,\n    loading,\n    people,\n    selectedPerson?.id,\n  ]);\n\n  function closePersonProfile() {\n    setSelectedPerson(null);\n\n    if (requestedPersonId) {\n      const nextParams =\n        new URLSearchParams(\n          searchParams\n        );\n      nextParams.delete(\n        "personId"\n      );\n      setSearchParams(\n        nextParams,\n        {\n          replace: true,\n        }\n      );\n    }\n  }\n\n  async function refreshPerson(userId: string) {\n    const [response] = await Promise.all([`,
      "People deep-link effect and close helper"
    );

    source = source.split('setSelectedPerson(null);').join('closePersonProfile();');

    /* Restore helper internals, which the broad replacement above also touched. */
    source = replaceOnce(
      source,
      `  function closePersonProfile() {\n    closePersonProfile();`,
      `  function closePersonProfile() {\n    setSelectedPerson(null);`,
      "People close helper recursion guard"
    );

    write(file, source);
  }

  {
    const file = files[1];
    let source = read(file);

    source = replaceOnce(
      source,
      `  const [searchParams] =\n    useSearchParams();`,
      `  const [\n    searchParams,\n    setSearchParams,\n  ] = useSearchParams();`,
      "Chatters mutable search params"
    );

    source = replaceOnce(
      source,
      `    resetChatterProfile();\n  }\n\n  function handleRowKeyDown(`,
      `    resetChatterProfile();\n\n    if (requestedChatterId) {\n      const nextParams =\n        new URLSearchParams(\n          searchParams\n        );\n      nextParams.delete(\n        "chatterId"\n      );\n      setSearchParams(\n        nextParams,\n        {\n          replace: true,\n        }\n      );\n    }\n  }\n\n  function handleRowKeyDown(`,
      "Chatter deep-link close cleanup"
    );

    write(file, source);
  }

  {
    const file = files[2];
    let source = read(file);

    source = replaceOnce(
      source,
      `                      >\n                        View Chatter Profile\n                      </button>\n\n                      {canManageQaIncidents && selectedIncident.status ===`,
      `                      >\n                        View Chatter Profile\n                      </button>\n\n                      {selectedIncident.chatter.userId && (\n                        <button\n                          type="button"\n                          className="secondary-button"\n                          onClick={() =>\n                            navigate(\n                              \`/people?personId=\${encodeURIComponent(\n                                selectedIncident.chatter.userId ?? ""\n                              )}\`\n                            )\n                          }\n                        >\n                          View Employee Profile\n                        </button>\n                      )}\n\n                      {canManageQaIncidents && selectedIncident.status ===`,
      "Incident to employee profile navigation"
    );

    write(file, source);
  }

  console.log("F.4 profile-navigation codemod applied successfully.");
} catch (error) {
  for (const [file, content] of originals.entries()) {
    write(file, content);
  }
  console.error("F.4 profile-navigation codemod aborted; source files were restored.");
  throw error;
}
