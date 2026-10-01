import {
  readFile,
  writeFile,
} from "node:fs/promises";

const files = {
  chatters:
    "frontend/src/pages/ChattersPage.tsx",
  incidents:
    "frontend/src/pages/IncidentsPage.tsx",
  people:
    "frontend/src/pages/PeoplePage.tsx",
  roles:
    "frontend/src/pages/RoleSettingsRankPage.tsx",
};

async function read(path) {
  return (
    await readFile(
      path,
      "utf8"
    )
  ).replace(/\r\n/g, "\n");
}

async function save(path, content) {
  await writeFile(
    path,
    content,
    "utf8"
  );
}

function replaceOnce(
  content,
  needle,
  replacement,
  label
) {
  const first =
    content.indexOf(
      needle
    );

  if (first < 0) {
    throw new Error(
      `F.4 patch failed (${label}): expected source block was not found.`
    );
  }

  if (
    content.indexOf(
      needle,
      first + needle.length
    ) >= 0
  ) {
    throw new Error(
      `F.4 patch failed (${label}): source block was not unique.`
    );
  }

  return (
    content.slice(0, first) +
    replacement +
    content.slice(
      first + needle.length
    )
  );
}

function insertBeforeOnce(
  content,
  marker,
  addition,
  label
) {
  return replaceOnce(
    content,
    marker,
    `${addition}${marker}`,
    label
  );
}

function transformFunctionToCallback(
  content,
  startMarker,
  nextFunctionMarker,
  callbackStart,
  callbackEnd,
  label
) {
  const start =
    content.indexOf(
      startMarker
    );
  const end =
    content.indexOf(
      nextFunctionMarker,
      start
    );

  if (
    start < 0 ||
    end < 0
  ) {
    throw new Error(
      `F.4 patch failed (${label}): function boundary was not found.`
    );
  }

  let segment =
    content.slice(
      start,
      end
    );

  segment =
    segment.replace(
      startMarker,
      callbackStart
    );

  const closing =
    "  }\n\n";

  if (
    !segment.endsWith(
      closing
    )
  ) {
    throw new Error(
      `F.4 patch failed (${label}): unexpected function closing.`
    );
  }

  segment =
    segment.slice(
      0,
      -closing.length
    ) +
    callbackEnd;

  return (
    content.slice(0, start) +
    segment +
    content.slice(end)
  );
}

async function patchChatters() {
  let content =
    await read(
      files.chatters
    );

  if (
    content.includes(
      "react-router-dom"
    ) &&
    content.includes(
      "F4_CHATTER_DEEP_LINK"
    )
  ) {
    console.log(
      "ChattersPage.tsx already contains F.4 patches."
    );
    return;
  }

  content = replaceOnce(
    content,
    `import type {\n  FormEvent,\n  KeyboardEvent,\n} from "react";\n\n`,
    `import type {\n  FormEvent,\n  KeyboardEvent,\n} from "react";\n\nimport {\n  useNavigate,\n  useSearchParams,\n} from "react-router-dom";\n\n`,
    "Chatters router imports"
  );

  content = replaceOnce(
    content,
    `function ChattersPage() {\n  const toast = useToast();\n`,
    `function ChattersPage() {\n  const toast = useToast();\n  const navigate = useNavigate();\n  const [searchParams, setSearchParams] =\n    useSearchParams();\n`,
    "Chatters router hooks"
  );

  content = transformFunctionToCallback(
    content,
    `  async function openChatterDetails(\n`,
    `  function closeChatterDetails() {`,
    `  const openChatterDetails =\n    useCallback(async (\n`,
    `  }, [toast]);\n\n`,
    "Chatters detail callback"
  );

  content = insertBeforeOnce(
    content,
    `  function closeChatterDetails() {`,
    `  /* F4_CHATTER_DEEP_LINK */\n  useEffect(() => {\n    const chatterIdParam =\n      searchParams.get(\n        "chatterId"\n      );\n\n    if (\n      !chatterIdParam ||\n      isLoading ||\n      selectedChatter?.id ===\n        chatterIdParam\n    ) {\n      return;\n    }\n\n    const chatter =\n      chatters.find(\n        (candidate) =>\n          candidate.id ===\n          chatterIdParam\n      );\n\n    if (chatter) {\n      void openChatterDetails(\n        chatter\n      );\n    }\n  }, [\n    chatters,\n    isLoading,\n    openChatterDetails,\n    searchParams,\n    selectedChatter?.id,\n  ]);\n\n`,
    "Chatters deep link effect"
  );

  content = replaceOnce(
    content,
    `    resetChatterProfile();\n  }\n\n  function handleRowKeyDown(`,
    `    resetChatterProfile();\n\n    const nextParams =\n      new URLSearchParams(\n        searchParams\n      );\n    nextParams.delete(\n      "chatterId"\n    );\n    setSearchParams(\n      nextParams,\n      { replace: true }\n    );\n  }\n\n  function handleRowKeyDown(`,
    "Chatters close deep link"
  );

  const oldVisible = `  const visibleIncidents =\n    useMemo(() => {\n      return chatterIncidents.filter(\n        (incident) => {\n          const matchesIncidentStatus =\n            incidentFilter === "ALL" ||\n            incident.status ===\n              incidentFilter;\n\n          const matchesStrikeStatus =\n            strikeFilter === "ALL" ||\n            incident.strikeActivityStatus ===\n              strikeFilter;\n\n          return (\n            matchesIncidentStatus &&\n            matchesStrikeStatus\n          );\n        }\n      );\n    }, [\n      chatterIncidents,\n      incidentFilter,\n      strikeFilter,\n    ]);`;

  const newVisible = `  const visibleIncidents =\n    useMemo(() => {\n      return chatterIncidents\n        .filter(\n          (incident) => {\n            const matchesIncidentStatus =\n              incidentFilter === "ALL" ||\n              incident.status ===\n                incidentFilter;\n\n            const matchesStrikeStatus =\n              strikeFilter === "ALL" ||\n              incident.strikeActivityStatus ===\n                strikeFilter;\n\n            return (\n              matchesIncidentStatus &&\n              matchesStrikeStatus\n            );\n          }\n        )\n        .sort(\n          (first, second) =>\n            new Date(\n              second.occurredAt\n            ).getTime() -\n            new Date(\n              first.occurredAt\n            ).getTime()\n        )\n        .slice(0, 5);\n    }, [\n      chatterIncidents,\n      incidentFilter,\n      strikeFilter,\n    ]);`;

  content = replaceOnce(
    content,
    oldVisible,
    newVisible,
    "Chatters recent incident limit"
  );

  content = replaceOnce(
    content,
    `                              onClick={() =>\n                                toggleIncident(\n                                  incident.id\n                                )\n                              }`,
    `                              onClick={() => {\n                                toggleIncident(\n                                  incident.id\n                                );\n                                navigate(\n                                  \`/incidents?incidentId=\${encodeURIComponent(\n                                    incident.id\n                                  )}\`\n                                );\n                              }}`,
    "Chatter incident redirect"
  );

  await save(
    files.chatters,
    content
  );
  console.log(
    "Patched ChattersPage.tsx"
  );
}

async function patchIncidents() {
  let content =
    await read(
      files.incidents
    );

  if (
    content.includes(
      "F4_INCIDENT_DEEP_LINK"
    )
  ) {
    console.log(
      "IncidentsPage.tsx already contains F.4 patches."
    );
    return;
  }

  content = replaceOnce(
    content,
    `import type {\n  FormEvent,\n} from "react";\n\n`,
    `import type {\n  FormEvent,\n} from "react";\n\nimport {\n  useNavigate,\n  useSearchParams,\n} from "react-router-dom";\n\n`,
    "Incidents router imports"
  );

  content = replaceOnce(
    content,
    `function IncidentsPage() {\n  const toast = useToast();\n`,
    `function IncidentsPage() {\n  const toast = useToast();\n  const navigate = useNavigate();\n  const [searchParams, setSearchParams] =\n    useSearchParams();\n`,
    "Incidents router hooks"
  );

  content = transformFunctionToCallback(
    content,
    `  async function openIncidentDetails(\n`,
    `  function closeIncidentDetails() {`,
    `  const openIncidentDetails =\n    useCallback(async (\n`,
    `  }, [\n    searchParams,\n    setSearchParams,\n    toast,\n  ]);\n\n`,
    "Incident detail callback"
  );

  content = replaceOnce(
    content,
    `    incident: Incident\n  ) {\n    try {\n      setDetailLoading(true);`,
    `    incident: Pick<\n      Incident,\n      "id"\n    >\n  ) => {\n    try {\n      const nextParams =\n        new URLSearchParams(\n          searchParams\n        );\n      nextParams.set(\n        "incidentId",\n        incident.id\n      );\n      setSearchParams(\n        nextParams,\n        { replace: true }\n      );\n\n      setDetailLoading(true);`,
    "Incident callback signature"
  );

  content = insertBeforeOnce(
    content,
    `  function closeIncidentDetails() {`,
    `  /* F4_INCIDENT_DEEP_LINK */\n  useEffect(() => {\n    const incidentIdParam =\n      searchParams.get(\n        "incidentId"\n      );\n\n    if (\n      !incidentIdParam ||\n      detailLoading ||\n      selectedIncident?.id ===\n        incidentIdParam\n    ) {\n      return;\n    }\n\n    void openIncidentDetails({\n      id: incidentIdParam,\n    });\n  }, [\n    detailLoading,\n    openIncidentDetails,\n    searchParams,\n    selectedIncident?.id,\n  ]);\n\n`,
    "Incident deep link effect"
  );

  content = replaceOnce(
    content,
    `    setSelectedIncident(null);\n  }\n\n  /*\n   * =========================================================\n   * RESOLVE / VOID`,
    `    setSelectedIncident(null);\n\n    const nextParams =\n      new URLSearchParams(\n        searchParams\n      );\n    nextParams.delete(\n      "incidentId"\n    );\n    setSearchParams(\n      nextParams,\n      { replace: true }\n    );\n  }\n\n  /*\n   * =========================================================\n   * RESOLVE / VOID`,
    "Incident close deep link"
  );

  const oldCloseButton = `                <button\n                  type="button"\n                  className="modal-close"\n                  onClick={\n                    closeIncidentDetails\n                  }\n                  disabled={\n                    detailLoading\n                  }\n                  aria-label="Close"\n                >\n                  ×\n                </button>`;

  const newCloseButton = `                <div className="incident-detail-header-actions">\n                  {selectedIncident && (\n                    <button\n                      type="button"\n                      className="secondary-button"\n                      onClick={() =>\n                        navigate(\n                          \`/chatters?chatterId=\${encodeURIComponent(\n                            selectedIncident.chatterId\n                          )}\`\n                        )\n                      }\n                    >\n                      View Chatter Profile\n                    </button>\n                  )}\n\n                  <button\n                    type="button"\n                    className="modal-close"\n                    onClick={\n                      closeIncidentDetails\n                    }\n                    disabled={\n                      detailLoading\n                    }\n                    aria-label="Close"\n                  >\n                    ×\n                  </button>\n                </div>`;

  content = replaceOnce(
    content,
    oldCloseButton,
    newCloseButton,
    "Incident chatter profile action"
  );

  await save(
    files.incidents,
    content
  );
  console.log(
    "Patched IncidentsPage.tsx"
  );
}

async function patchPeople() {
  let content =
    await read(
      files.people
    );

  if (
    content.includes(
      "F4_QA_STANDING"
    )
  ) {
    console.log(
      "PeoplePage.tsx already contains F.4 patches."
    );
    return;
  }

  content = insertBeforeOnce(
    content,
    `type AssignableRole = {`,
    `type QaStandingResponse = {\n  userId: string;\n  chatterId: string | null;\n  chatterStatus?:\n    | "ACTIVE"\n    | "INACTIVE";\n  standing: {\n    activeStrikeCount: number;\n    standingLabel: string;\n    deductionPercent: number;\n    nextExpiryAt: string | null;\n    ladderVersion: number;\n  } | null;\n};\n\n`,
    "People QA standing type"
  );

  content = replaceOnce(
    content,
    `  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);\n  const [detailLoading, setDetailLoading] = useState(false);`,
    `  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);\n  /* F4_QA_STANDING */\n  const [selectedQaStanding, setSelectedQaStanding] =\n    useState<QaStandingResponse | null>(\n      null\n    );\n  const [detailLoading, setDetailLoading] = useState(false);`,
    "People QA standing state"
  );

  const oldOpenPerson = `  async function openPerson(person: Person) {\n    try {\n      setSelectedPerson(person);\n      setDetailLoading(true);\n      const response = await apiRequest<{ person: Person }>(\`/api/people/\${person.id}\`);\n      setSelectedPerson(response.person);\n    } catch (error) {\n      toast.error(\n        error instanceof Error ? error.message : "Unable to load the employee.",\n        "Unable to load profile"\n      );\n    } finally {\n      setDetailLoading(false);\n    }\n  }\n\n  async function refreshPerson(userId: string) {\n    const [response] = await Promise.all([\n      apiRequest<{ person: Person }>(\`/api/people/\${userId}\`),\n      loadPeople(),\n      loadOptions(),\n    ]);\n    setSelectedPerson(response.person);\n  }`;

  const newOpenPerson = `  async function openPerson(person: Person) {\n    try {\n      setSelectedPerson(person);\n      setSelectedQaStanding(null);\n      setDetailLoading(true);\n\n      const [response, qaStanding] =\n        await Promise.all([\n          apiRequest<{ person: Person }>(\n            \`/api/people/\${person.id}\`\n          ),\n          apiRequest<QaStandingResponse>(\n            \`/api/people/\${person.id}/qa-standing\`\n          ).catch((error) => {\n            console.error(\n              "Unable to load employee QA standing:",\n              error\n            );\n            return null;\n          }),\n        ]);\n\n      setSelectedPerson(\n        response.person\n      );\n      setSelectedQaStanding(\n        qaStanding\n      );\n    } catch (error) {\n      toast.error(\n        error instanceof Error ? error.message : "Unable to load the employee.",\n        "Unable to load profile"\n      );\n    } finally {\n      setDetailLoading(false);\n    }\n  }\n\n  async function refreshPerson(userId: string) {\n    const [response, qaStanding] = await Promise.all([\n      apiRequest<{ person: Person }>(\`/api/people/\${userId}\`),\n      apiRequest<QaStandingResponse>(\n        \`/api/people/\${userId}/qa-standing\`\n      ).catch((error) => {\n        console.error(\n          "Unable to refresh employee QA standing:",\n          error\n        );\n        return null;\n      }),\n      loadPeople(),\n      loadOptions(),\n    ]);\n    setSelectedPerson(response.person);\n    setSelectedQaStanding(qaStanding);\n  }`;

  content = replaceOnce(
    content,
    oldOpenPerson,
    newOpenPerson,
    "People standing loader"
  );

  const oldStatus = `              <div className="people-profile-header-status" aria-label={\`Account status: \${formatStatus(selectedPerson.status)}\`}>\n                <span className="people-profile-status-label">Account status:</span>\n                <span className={\`people-profile-status-pill \${selectedPerson.status.toLowerCase()}\`}>\n                  {formatStatus(selectedPerson.status)}\n                </span>\n              </div>`;

  const newStatus = `              <div className="people-profile-header-summary">\n                <div className="people-profile-header-status" aria-label={\`Account status: \${formatStatus(selectedPerson.status)}\`}>\n                  <span className="people-profile-status-label">Account status:</span>\n                  <span className={\`people-profile-status-pill \${selectedPerson.status.toLowerCase()}\`}>\n                    {formatStatus(selectedPerson.status)}\n                  </span>\n                </div>\n\n                <div className="people-profile-standing-card">\n                  <span>Current standing</span>\n                  <strong>\n                    {detailLoading\n                      ? "Loading…"\n                      : selectedQaStanding?.standing\n                        ? selectedQaStanding.standing.standingLabel\n                        : selectedQaStanding?.chatterId\n                          ? "Unavailable"\n                          : "Not a chatter"}\n                  </strong>\n\n                  {!detailLoading &&\n                    selectedQaStanding?.standing && (\n                      <small>\n                        {selectedQaStanding.standing.activeStrikeCount}{" "}\n                        active {selectedQaStanding.standing.activeStrikeCount === 1 ? "strike" : "strikes"}\n                        {" · "}\n                        {selectedQaStanding.standing.deductionPercent}% deduction\n                      </small>\n                    )}\n                </div>\n              </div>`;

  content = replaceOnce(
    content,
    oldStatus,
    newStatus,
    "People profile standing card"
  );

  await save(
    files.people,
    content
  );
  console.log(
    "Patched PeoplePage.tsx"
  );
}

async function patchRoles() {
  let content =
    await read(
      files.roles
    );

  if (
    content.includes(
      "F4_ROLE_DETAILS"
    )
  ) {
    console.log(
      "RoleSettingsRankPage.tsx already contains F.4 patches."
    );
    return;
  }

  content = replaceOnce(
    content,
    `  const [deleteRoleId, setDeleteRoleId] =\n    useState<string | null>(null);`,
    `  const [deleteRoleId, setDeleteRoleId] =\n    useState<string | null>(null);\n  /* F4_ROLE_DETAILS */\n  const [detailRoleId, setDetailRoleId] =\n    useState<string | null>(null);`,
    "Role detail state"
  );

  content = replaceOnce(
    content,
    `  const deleteRole =\n    roles.find(\n      (role) =>\n        role.id === deleteRoleId\n    ) ?? null;`,
    `  const deleteRole =\n    roles.find(\n      (role) =>\n        role.id === deleteRoleId\n    ) ?? null;\n  const detailRole =\n    roles.find(\n      (role) =>\n        role.id === detailRoleId\n    ) ?? null;`,
    "Role detail selector"
  );

  const tableStart =
    content.indexOf(
      `          <table className="role-settings-table role-settings-rank-table">`
    );
  const tableEndMarker =
    `          </table>`;
  const tableEnd =
    content.indexOf(
      tableEndMarker,
      tableStart
    );

  if (
    tableStart < 0 ||
    tableEnd < 0
  ) {
    throw new Error(
      "F.4 patch failed (Role Settings table): table boundary was not found."
    );
  }

  const newTable = `          <table className="role-settings-table role-settings-rank-table">\n            <thead>\n              <tr>\n                <th>Role</th>\n                <th>Rank</th>\n                <th>Description</th>\n                <th>Users</th>\n                <th className="role-settings-operations-heading">Operations</th>\n              </tr>\n            </thead>\n            <tbody>\n              {loading ? (\n                <tr>\n                  <td className="role-settings-empty" colSpan={5}>\n                    Loading roles…\n                  </td>\n                </tr>\n              ) : visibleRoles.length === 0 ? (\n                <tr>\n                  <td className="role-settings-empty" colSpan={5}>\n                    No matching roles.\n                  </td>\n                </tr>\n              ) : visibleRoles.map(\n                (role) => (\n                  <tr\n                    key={role.id}\n                    className="role-settings-clickable-row"\n                    tabIndex={0}\n                    onClick={() =>\n                      setDetailRoleId(\n                        role.id\n                      )\n                    }\n                    onKeyDown={(event) => {\n                      if (\n                        event.key === "Enter" ||\n                        event.key === " "\n                      ) {\n                        event.preventDefault();\n                        setDetailRoleId(\n                          role.id\n                        );\n                      }\n                    }}\n                  >\n                    <td>\n                      <div className="role-settings-role-cell">\n                        <strong>{role.name}</strong>\n                        <small>{scopeLabel(role.dataScope)}</small>\n                      </div>\n                    </td>\n                    <td>\n                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>\n                        {role.rank === null\n                          ? "Unranked"\n                          : role.rank}\n                      </span>\n                    </td>\n                    <td>\n                      <span className="role-settings-description">\n                        {scopeDescription(role.dataScope)}\n                      </span>\n                    </td>\n                    <td>{role.affectedUserCount}</td>\n                    <td\n                      onClick={(event) =>\n                        event.stopPropagation()\n                      }\n                    >\n                      <div className="role-settings-operations">\n                        <button\n                          type="button"\n                          className="role-settings-link-button"\n                          onClick={() => openPermissions(role)}\n                        >\n                          Set permissions\n                        </button>\n                        <button\n                          type="button"\n                          className="role-settings-link-button"\n                          onClick={() => openEdit(role)}\n                        >\n                          Edit\n                        </button>\n                        {!role.isSystem && role.affectedUserCount === 0 && (\n                          <button\n                            type="button"\n                            className="role-settings-link-button danger"\n                            title="Delete role"\n                            onClick={() => setDeleteRoleId(role.id)}\n                          >\n                            Delete\n                          </button>\n                        )}\n                      </div>\n                    </td>\n                  </tr>\n                )\n              )}\n            </tbody>\n          </table>`;

  content =
    content.slice(
      0,
      tableStart
    ) +
    newTable +
    content.slice(
      tableEnd +
      tableEndMarker.length
    );

  const detailModal = `      {detailRole && (\n        <div\n          className="role-settings-overlay"\n          onMouseDown={(event) => {\n            if (event.target === event.currentTarget) {\n              setDetailRoleId(null);\n            }\n          }}\n        >\n          <section\n            className="role-settings-modal role-settings-detail-modal"\n            role="dialog"\n            aria-modal="true"\n            aria-label={\`Role details for \${detailRole.name}\`}\n          >\n            <div className="role-settings-modal-header">\n              <div>\n                <span className="page-eyebrow">Role details</span>\n                <h3>{detailRole.name}</h3>\n                <p>\n                  Rank {detailRole.rank ?? "Unranked"} · {scopeLabel(detailRole.dataScope)}\n                </p>\n              </div>\n              <button\n                type="button"\n                className="role-settings-close"\n                onClick={() => setDetailRoleId(null)}\n                aria-label="Close role details"\n              >\n                ×\n              </button>\n            </div>\n\n            <div className="role-settings-modal-body role-settings-detail-body">\n              <div className="role-settings-detail-grid">\n                <div>\n                  <span>Authority rank</span>\n                  <strong>{detailRole.rank ?? "Unranked"}</strong>\n                </div>\n                <div>\n                  <span>Data scope</span>\n                  <strong>{scopeLabel(detailRole.dataScope)}</strong>\n                </div>\n                <div>\n                  <span>Assigned users</span>\n                  <strong>{detailRole.affectedUserCount}</strong>\n                </div>\n                <div>\n                  <span>Role type</span>\n                  <strong>{detailRole.isSystem ? "Default role" : "Custom role"}</strong>\n                </div>\n              </div>\n\n              <div className="role-settings-detail-description">\n                <span>Description</span>\n                <p>{scopeDescription(detailRole.dataScope)}</p>\n              </div>\n\n              <div className="role-settings-detail-permissions">\n                <span>Permissions</span>\n                {detailRole.permissions.length ? (\n                  <div>\n                    {detailRole.permissions.map((permission) => (\n                      <span\n                        key={permission.id}\n                        className="role-settings-detail-permission"\n                      >\n                        {permission.name}\n                      </span>\n                    ))}\n                  </div>\n                ) : (\n                  <p>No explicit permissions assigned.</p>\n                )}\n              </div>\n            </div>\n\n            <div className="role-settings-modal-footer">\n              <button\n                type="button"\n                className="secondary-button"\n                onClick={() => setDetailRoleId(null)}\n              >\n                Close\n              </button>\n              <button\n                type="button"\n                className="secondary-button"\n                onClick={() => {\n                  setDetailRoleId(null);\n                  openPermissions(detailRole);\n                }}\n              >\n                Set permissions\n              </button>\n              <button\n                type="button"\n                className="primary-button"\n                onClick={() => {\n                  setDetailRoleId(null);\n                  openEdit(detailRole);\n                }}\n              >\n                Edit role\n              </button>\n            </div>\n          </section>\n        </div>\n      )}\n\n`;

  content = insertBeforeOnce(
    content,
    `      {editorMode && (`,
    detailModal,
    "Role detail modal"
  );

  await save(
    files.roles,
    content
  );
  console.log(
    "Patched RoleSettingsRankPage.tsx"
  );
}

async function main() {
  await patchChatters();
  await patchIncidents();
  await patchPeople();
  await patchRoles();

  console.log(
    "F.4 UI patches applied successfully."
  );
}

main().catch((error) => {
  console.error(error); 
  process.exitCode = 1;
});
