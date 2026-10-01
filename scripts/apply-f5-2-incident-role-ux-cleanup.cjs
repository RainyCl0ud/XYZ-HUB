const fs = require("fs");
const path = require("path");

const root = process.cwd();
const targets = {
  incidentsPage: "frontend/src/pages/IncidentsPage.tsx",
  incidentsRoute: "backend/src/routes/incidents.ts",
  rolePage: "frontend/src/pages/RoleSettingsRankPage.tsx",
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
  fs.writeFileSync(path.join(root, relativePath), source.replace(/\n/g, eol), "utf8");
}

function replaceOne(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`F.5.2 expected 1 match for ${label}, found ${count}`);
  }
  return source.replace(before, after);
}

try {
  let incidentsPage = read(targets.incidentsPage);
  let incidentsRoute = read(targets.incidentsRoute);
  let rolePage = read(targets.rolePage);

  incidentsPage = replaceOne(
    incidentsPage,
`                      {canManageQaIncidents && selectedIncident.status !==
                        "VOIDED" && (`,
`                      {canManageQaIncidents && selectedIncident.status ===
                        "OPEN" && (`,
    "resolved incident void action visibility"
  );

  incidentsRoute = replaceOne(
    incidentsRoute,
`      if (
        existing.status ===
        "VOIDED"
      ) {
        res.status(409).json({
          message:
            "Incident is already voided",
        });

        return;
      }

      const incident =`,
`      if (
        existing.status ===
        "VOIDED"
      ) {
        res.status(409).json({
          message:
            "Incident is already voided",
        });

        return;
      }

      if (
        existing.status ===
        "RESOLVED"
      ) {
        res.status(409).json({
          message:
            "A resolved incident cannot be voided",
        });

        return;
      }

      const incident =`,
    "resolved incident backend void guard"
  );

  rolePage = replaceOne(
    rolePage,
`              <tr>
                <th>Role</th>
                <th>Rank</th>
                <th>Description</th>
                <th>Users</th>
                <th className="role-settings-operations-heading">Operations</th>
              </tr>`,
`              <tr>
                <th>Rank</th>
                <th>Role</th>
                <th>Description</th>
                <th>Users</th>
                <th className="role-settings-operations-heading">Operations</th>
              </tr>`,
    "Role Settings column headings"
  );

  rolePage = replaceOne(
    rolePage,
`                    <td>
                      <div className="role-settings-role-cell">
                        <strong>{role.name}</strong>
                        <small>{scopeLabel(role.dataScope)}</small>
                      </div>
                    </td>
                    <td>
                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>
                        {role.rank === null
                          ? "Unranked"
                          : role.rank}
                      </span>
                    </td>`,
`                    <td>
                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>
                        {role.rank === null
                          ? "Unranked"
                          : role.rank}
                      </span>
                    </td>
                    <td>
                      <div className="role-settings-role-cell">
                        <strong>{role.name}</strong>
                        <small>{scopeLabel(role.dataScope)}</small>
                      </div>
                    </td>`,
    "Role Settings Rank and Role cell order"
  );

  rolePage = replaceOne(
    rolePage,
`                    <td>{role.affectedUserCount}</td>`,
`                    <td className="role-settings-users-cell">
                      <span className="role-settings-user-count">
                        {role.affectedUserCount}
                      </span>
                    </td>`,
    "Role Settings Users count presentation"
  );

  rolePage = replaceOne(
    rolePage,
`                          Set permissions`,
`                          Permissions`,
    "Role Settings permissions action label"
  );

  write(targets.incidentsPage, incidentsPage);
  write(targets.incidentsRoute, incidentsRoute);
  write(targets.rolePage, rolePage);

  console.log("✓ Resolved incidents can no longer expose the Void action.");
  console.log("✓ Backend now rejects voiding resolved incidents.");
  console.log("✓ Role Settings reordered to Rank, Role, Description, Users, Operations.");
  console.log("✓ Role Settings user count and operation presentation updated.");
  console.log("F.5.2 guarded codemod applied successfully.");
} catch (error) {
  for (const [relativePath, original] of originals) {
    fs.writeFileSync(path.join(root, relativePath), original, "utf8");
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
