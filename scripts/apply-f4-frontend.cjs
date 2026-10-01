const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const fileEndings = new Map();

function read(relativePath) {
  const raw = fs.readFileSync(path.join(root, relativePath), "utf8");

  if (!fileEndings.has(relativePath)) {
    fileEndings.set(
      relativePath,
      raw.includes("\r\n") ? "\r\n" : "\n"
    );
  }

  return raw.replace(/\r\n/g, "\n");
}

function write(relativePath, content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const eol = fileEndings.get(relativePath) ?? "\n";
  const output = eol === "\r\n"
    ? normalized.replace(/\n/g, "\r\n")
    : normalized;

  fs.writeFileSync(path.join(root, relativePath), output, "utf8");
}

function replaceOnce(content, oldText, newText, label) {
  const first = content.indexOf(oldText);
  const last = content.lastIndexOf(oldText);

  if (first < 0) {
    throw new Error(`F.4 codemod could not find: ${label}`);
  }

  if (first !== last) {
    throw new Error(`F.4 codemod found multiple matches for: ${label}`);
  }

  return content.slice(0, first) + newText + content.slice(first + oldText.length);
}

function replaceCount(content, oldText, newText, count, label) {
  const matches = content.split(oldText).length - 1;

  if (matches !== count) {
    throw new Error(
      `F.4 codemod expected ${count} matches for ${label}, found ${matches}`
    );
  }

  return content.split(oldText).join(newText);
}

function updatePeoplePage() {
  const file = "frontend/src/pages/PeoplePage.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    'import { useToast } from "../components/ToastProvider";\n\nimport "./PeoplePage.css";',
    'import { useToast } from "../components/ToastProvider";\nimport PeopleQaPanel from "../components/PeopleQaPanel";\n\nimport "./PeoplePage.css";',
    "People QA panel import"
  );

  source = replaceOnce(
    source,
    "const PEOPLE_PAGE_SIZE = 7;",
    "const PEOPLE_PAGE_SIZE = 10;",
    "People page size"
  );

  source = replaceOnce(
    source,
    `                {!canManageSelected && (\n                  <p className="people-scope-note">\n                    {isSelectedSelf\n                      ? "Your own role and creator assignments cannot be changed from People Management."\n                      : "This profile is visible to you, but one or more assignments are outside the access you may change."}\n                  </p>\n                )}\n\n                <div className="people-detail-section">`,
    `                {!canManageSelected && (\n                  <p className="people-scope-note">\n                    {isSelectedSelf\n                      ? "Your own role and creator assignments cannot be changed from People Management."\n                      : "This profile is visible to you, but one or more assignments are outside the access you may change."}\n                  </p>\n                )}\n\n                <PeopleQaPanel\n                  personId={selectedPerson.id}\n                />\n\n                <div className="people-detail-section">`,
    "Employee QA standing placement"
  );

  write(file, source);
}

function updateChattersPage() {
  const file = "frontend/src/pages/ChattersPage.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    `import type {\n  FormEvent,\n  KeyboardEvent,\n} from "react";\n\nimport {\n  apiRequest,`,
    `import type {\n  FormEvent,\n  KeyboardEvent,\n} from "react";\n\nimport {\n  useNavigate,\n  useSearchParams,\n} from "react-router-dom";\n\nimport {\n  apiRequest,`,
    "Chatters router imports"
  );

  source = replaceOnce(
    source,
    `function ChattersPage() {\n  const toast = useToast();\n\n  const {\n    access,`,
    `function ChattersPage() {\n  const toast = useToast();\n  const navigate =\n    useNavigate();\n  const [searchParams] =\n    useSearchParams();\n  const requestedChatterId =\n    searchParams.get(\n      "chatterId"\n    );\n\n  const {\n    access,`,
    "Chatters deep-link state"
  );

  source = replaceOnce(
    source,
    `  function closeChatterDetails() {\n    if (\n      actionId !== null ||\n      showForm\n    ) {`,
    `  useEffect(() => {\n    if (\n      !requestedChatterId ||\n      isLoading ||\n      selectedChatter?.id ===\n        requestedChatterId\n    ) {\n      return;\n    }\n\n    const requestedChatter =\n      chatters.find(\n        (chatter) =>\n          chatter.id ===\n          requestedChatterId\n      );\n\n    if (\n      requestedChatter\n    ) {\n      void openChatterDetails(\n        requestedChatter\n      );\n    }\n    // The detail loader is intentionally driven by the URL + loaded list.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [\n    requestedChatterId,\n    isLoading,\n    chatters,\n    selectedChatter?.id,\n  ]);\n\n  function closeChatterDetails() {\n    if (\n      actionId !== null ||\n      showForm\n    ) {`,
    "Chatter profile deep-link effect"
  );

  source = replaceOnce(
    source,
    `  const visibleIncidents =\n    useMemo(() => {\n      return chatterIncidents.filter(\n        (incident) => {\n          const matchesIncidentStatus =\n            incidentFilter === "ALL" ||\n            incident.status ===\n              incidentFilter;\n\n          const matchesStrikeStatus =\n            strikeFilter === "ALL" ||\n            incident.strikeActivityStatus ===\n              strikeFilter;\n\n          return (\n            matchesIncidentStatus &&\n            matchesStrikeStatus\n          );\n        }\n      );\n    }, [\n      chatterIncidents,\n      incidentFilter,\n      strikeFilter,\n    ]);`,
    `  const visibleIncidents =\n    useMemo(() => {\n      return chatterIncidents\n        .filter(\n          (incident) => {\n            const matchesIncidentStatus =\n              incidentFilter === "ALL" ||\n              incident.status ===\n                incidentFilter;\n\n            const matchesStrikeStatus =\n              strikeFilter === "ALL" ||\n              incident.strikeActivityStatus ===\n                strikeFilter;\n\n            return (\n              matchesIncidentStatus &&\n              matchesStrikeStatus\n            );\n          }\n        )\n        .slice(0, 5);\n    }, [\n      chatterIncidents,\n      incidentFilter,\n      strikeFilter,\n    ]);`,
    "Recent five chatter incidents"
  );

  source = replaceOnce(
    source,
    `                              onClick={() =>\n                                toggleIncident(\n                                  incident.id\n                                )\n                              }`,
    `                              onClick={() => {\n                                toggleIncident(\n                                  incident.id\n                                );\n                                navigate(\n                                  \`/incidents?incidentId=\${encodeURIComponent(\n                                    incident.id\n                                  )}\`\n                                );\n                              }}`,
    "Chatter incident deep link"
  );

  write(file, source);
}

function updateIncidentsPage() {
  const file = "frontend/src/pages/IncidentsPage.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    `import type {\n  FormEvent,\n} from "react";\n\nimport {\n  apiRequest,`,
    `import type {\n  FormEvent,\n} from "react";\n\nimport {\n  useNavigate,\n  useSearchParams,\n} from "react-router-dom";\n\nimport {\n  apiRequest,`,
    "Incidents router imports"
  );

  source = replaceOnce(
    source,
    `type Chatter = {\n  id: string;\n  name: string;\n  status:\n    | "ACTIVE"\n    | "INACTIVE";\n};`,
    `type Chatter = {\n  id: string;\n  userId?: string | null;\n  name: string;\n  status:\n    | "ACTIVE"\n    | "INACTIVE";\n};`,
    "Incident chatter identity"
  );

  source = replaceOnce(
    source,
    `function IncidentsPage() {\n  const toast = useToast();\n\n  const { access } = useAuth();`,
    `function IncidentsPage() {\n  const toast = useToast();\n  const navigate =\n    useNavigate();\n  const [\n    searchParams,\n    setSearchParams,\n  ] = useSearchParams();\n  const requestedIncidentId =\n    searchParams.get(\n      "incidentId"\n    );\n\n  const { access } = useAuth();`,
    "Incident deep-link state"
  );

  source = replaceOnce(
    source,
    `  async function openIncidentDetails(\n    incident: Incident\n  ) {\n    try {\n      setDetailLoading(true);\n\n      setPageError("");\n\n      const response =\n        await apiRequest<IncidentDetailResponse>(\n          \`/api/incidents/\${incident.id}\`\n        );`,
    `  async function openIncidentDetails(\n    incident: Incident | string\n  ) {\n    const incidentId =\n      typeof incident === "string"\n        ? incident\n        : incident.id;\n\n    try {\n      setDetailLoading(true);\n\n      setPageError("");\n\n      const response =\n        await apiRequest<IncidentDetailResponse>(\n          \`/api/incidents/\${incidentId}\`\n        );`,
    "Open incident by ID"
  );

  source = replaceOnce(
    source,
    `  function closeIncidentDetails() {\n    if (detailLoading) {\n      return;\n    }\n\n    setSelectedIncident(null);\n  }`,
    `  useEffect(() => {\n    if (\n      !requestedIncidentId ||\n      selectedIncident?.id ===\n        requestedIncidentId\n    ) {\n      return;\n    }\n\n    void openIncidentDetails(\n      requestedIncidentId\n    );\n    // The detail loader is intentionally driven by the incidentId URL.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [\n    requestedIncidentId,\n    selectedIncident?.id,\n  ]);\n\n  function closeIncidentDetails() {\n    if (detailLoading) {\n      return;\n    }\n\n    setSelectedIncident(null);\n\n    if (\n      requestedIncidentId\n    ) {\n      const nextParams =\n        new URLSearchParams(\n          searchParams\n        );\n      nextParams.delete(\n        "incidentId"\n      );\n      setSearchParams(\n        nextParams,\n        {\n          replace: true,\n        }\n      );\n    }\n  }`,
    "Incident URL-driven detail lifecycle"
  );

  source = replaceOnce(
    source,
    `                    <div className="incident-detail-actions">\n                      {canManageQaIncidents && selectedIncident.status ===`,
    `                    <div className="incident-detail-actions">\n                      <button\n                        type="button"\n                        className="secondary-button"\n                        onClick={() =>\n                          navigate(\n                            \`/chatters?chatterId=\${encodeURIComponent(\n                              selectedIncident.chatter.id\n                            )}\`\n                          )\n                        }\n                      >\n                        View Chatter Profile\n                      </button>\n\n                      {canManageQaIncidents && selectedIncident.status ===`,
    "Incident to chatter profile navigation"
  );

  write(file, source);
}

function updateRoleSettingsPage() {
  const file = "frontend/src/pages/RoleSettingsRankPage.tsx";
  let source = read(file);

  source = replaceOnce(
    source,
    `              <tr>\n                <th>Role</th>\n                <th>Description</th>\n                <th>Users</th>\n                <th>Rank</th>\n                <th>Type</th>\n                <th className="role-settings-operations-heading">Operations</th>\n              </tr>`,
    `              <tr>\n                <th>Role</th>\n                <th>Rank</th>\n                <th>Description</th>\n                <th>Users</th>\n                <th className="role-settings-operations-heading">Operations</th>\n              </tr>`,
    "Role Settings column order"
  );

  source = replaceCount(
    source,
    "colSpan={6}",
    "colSpan={5}",
    2,
    "Role Settings empty-state column span"
  );

  source = replaceOnce(
    source,
    `                  <tr key={role.id}>`,
    `                  <tr\n                    key={role.id}\n                    role="button"\n                    tabIndex={0}\n                    aria-label={\`View \${role.name} role details\`}\n                    onClick={() =>\n                      openPermissions(\n                        role\n                      )\n                    }\n                    onKeyDown={(event) => {\n                      if (\n                        event.key === "Enter" ||\n                        event.key === " "\n                      ) {\n                        event.preventDefault();\n                        openPermissions(\n                          role\n                        );\n                      }\n                    }}\n                  >`,
    "Clickable Role Settings row"
  );

  source = replaceOnce(
    source,
    `                    <td>\n                      <span className="role-settings-description">\n                        {scopeDescription(role.dataScope)}\n                      </span>\n                    </td>\n                    <td>{role.affectedUserCount}</td>\n                    <td>\n                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>\n                        {role.rank === null\n                          ? "Unranked"\n                          : role.rank}\n                      </span>\n                    </td>\n                    <td>\n                      <span className={role.isSystem ? "role-settings-type default" : "role-settings-type custom"}>\n                        {role.isSystem ? "Default" : "Custom"}\n                      </span>\n                    </td>\n                    <td>`,
    `                    <td>\n                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>\n                        {role.rank === null\n                          ? "Unranked"\n                          : role.rank}\n                      </span>\n                    </td>\n                    <td>\n                      <span className="role-settings-description">\n                        {scopeDescription(role.dataScope)}\n                      </span>\n                    </td>\n                    <td>{role.affectedUserCount}</td>\n                    <td>`,
    "Role Settings rank/description/type cells"
  );

  source = replaceOnce(
    source,
    `                          onClick={() => openPermissions(role)}`,
    `                          onClick={(event) => {\n                            event.stopPropagation();\n                            openPermissions(role);\n                          }}`,
    "Role permissions row-event isolation"
  );

  source = replaceOnce(
    source,
    `                          onClick={() => openEdit(role)}`,
    `                          onClick={(event) => {\n                            event.stopPropagation();\n                            openEdit(role);\n                          }}`,
    "Role edit row-event isolation"
  );

  source = replaceOnce(
    source,
    `                            onClick={() => setDeleteRoleId(role.id)}`,
    `                            onClick={(event) => {\n                              event.stopPropagation();\n                              setDeleteRoleId(role.id);\n                            }}`,
    "Role delete row-event isolation"
  );

  source = replaceOnce(
    source,
    `                <span className="page-eyebrow">Permissions</span>\n                <h3>{permissionRole.name}</h3>\n                <p>\n                  {permissionDraft.length} selected · Rank {permissionRole.rank ?? "Unranked"} · {scopeLabel(permissionRole.dataScope)}\n                </p>`,
    `                <span className="page-eyebrow">Role details & permissions</span>\n                <h3>{permissionRole.name}</h3>\n                <p>\n                  Rank {permissionRole.rank ?? "Unranked"} · {scopeLabel(permissionRole.dataScope)} · {permissionRole.affectedUserCount} user{permissionRole.affectedUserCount === 1 ? "" : "s"}\n                </p>\n                <p>\n                  {scopeDescription(permissionRole.dataScope)} · {permissionDraft.length} permission{permissionDraft.length === 1 ? "" : "s"} selected\n                </p>`,
    "Role details modal summary"
  );

  write(file, source);
}

const updates = [
  ["People Management", updatePeoplePage],
  ["Chatters", updateChattersPage],
  ["Incidents", updateIncidentsPage],
  ["Role Settings", updateRoleSettingsPage],
];

const originals = new Map();
for (const [, apply] of updates) {
  void apply;
}

try {
  const files = [
    "frontend/src/pages/PeoplePage.tsx",
    "frontend/src/pages/ChattersPage.tsx",
    "frontend/src/pages/IncidentsPage.tsx",
    "frontend/src/pages/RoleSettingsRankPage.tsx",
  ];

  for (const file of files) {
    originals.set(file, read(file));
  }

  for (const [label, apply] of updates) {
    apply();
    console.log(`✓ ${label}`);
  }

  console.log("F.4 frontend codemod applied successfully.");
} catch (error) {
  for (const [file, content] of originals.entries()) {
    write(file, content);
  }

  console.error("F.4 frontend codemod aborted; source files were restored.");
  throw error;
}
