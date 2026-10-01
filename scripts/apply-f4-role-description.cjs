const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const files = [
  "backend/prisma/schema.prisma",
  "backend/src/routes/roles.ts",
  "backend/src/services/role-management.ts",
  "frontend/src/pages/RoleSettingsRankPage.tsx",
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content, "utf8");
}

function replaceOnce(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  const last = source.lastIndexOf(oldText);

  if (first < 0) {
    throw new Error(`F.4 role-description codemod could not find: ${label}`);
  }
  if (first !== last) {
    throw new Error(`F.4 role-description codemod found multiple matches for: ${label}`);
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
      "  name String @unique\n\n  rank      Int?",
      "  name        String  @unique\n  description String?\n\n  rank      Int?",
      "Prisma Role.description"
    );
    write(file, source);
  }

  {
    const file = files[1];
    let source = read(file);
    source = replaceOnce(
      source,
      `    name:\n      z\n        .string()\n        .trim()\n        .min(1)\n        .max(120),\n\n    rank:`,
      `    name:\n      z\n        .string()\n        .trim()\n        .min(1)\n        .max(120),\n\n    description:\n      z\n        .string()\n        .trim()\n        .max(500)\n        .nullable()\n        .optional(),\n\n    rank:`,
      "role route description validation"
    );
    write(file, source);
  }

  {
    const file = files[2];
    let source = read(file);

    source = replaceOnce(
      source,
      `export type RoleBuilderInput = {\n  name: string;\n\n  rank:`,
      `export type RoleBuilderInput = {\n  name: string;\n\n  description:\n    string | null | undefined;\n\n  rank:`,
      "RoleBuilderInput.description"
    );

    source = replaceOnce(
      source,
      `  name:\n    true,\n\n  rank:`,
      `  name:\n    true,\n\n  description:\n    true,\n\n  rank:`,
      "roleSelect.description"
    );

    source = replaceOnce(
      source,
      `  name: string;\n  rank: number | null;`,
      `  name: string;\n  description: string | null;\n  rank: number | null;`,
      "RoleWithBuilderData.description"
    );

    source = replaceOnce(
      source,
      `    name:\n      role.name,\n\n    rank:`,
      `    name:\n      role.name,\n\n    description:\n      role.description,\n\n    rank:`,
      "serializeRole.description"
    );

    source = replaceOnce(
      source,
      `        name,\n\n        rank:\n          input.rank,`,
      `        name,\n\n        description:\n          input.description?.trim() ||\n          null,\n\n        rank:\n          input.rank,`,
      "createRole description"
    );

    source = replaceOnce(
      source,
      `            name,\n\n            rank:\n              input.rank,`,
      `            name,\n\n            description:\n              input.description?.trim() ||\n              null,\n\n            rank:\n              input.rank,`,
      "updateRole description"
    );

    write(file, source);
  }

  {
    const file = files[3];
    let source = read(file);

    source = replaceOnce(
      source,
      `  name: string;\n  rank: number | null;`,
      `  name: string;\n  description: string | null;\n  rank: number | null;`,
      "ManagedRole.description"
    );

    source = replaceOnce(
      source,
      `type RoleDraft = {\n  name: string;\n  rank: string;`,
      `type RoleDraft = {\n  name: string;\n  description: string;\n  rank: string;`,
      "RoleDraft.description"
    );

    source = replaceOnce(
      source,
      `    useState<RoleDraft>({\n      name: "",\n      rank: "",`,
      `    useState<RoleDraft>({\n      name: "",\n      description: "",\n      rank: "",`,
      "initial role draft description"
    );

    source = replaceOnce(
      source,
      `    setDraft({\n      name: "",\n      rank:\n        nextSafeRank(roles),`,
      `    setDraft({\n      name: "",\n      description: "",\n      rank:\n        nextSafeRank(roles),`,
      "create role description draft"
    );

    source = replaceOnce(
      source,
      `    setDraft({\n      name: role.name,\n      rank:`,
      `    setDraft({\n      name: role.name,\n      description:\n        role.description ?? "",\n      rank:`,
      "edit role description draft"
    );

    source = replaceOnce(
      source,
      `              JSON.stringify({\n                name,\n                rank,`,
      `              JSON.stringify({\n                name,\n                description:\n                  draft.description.trim() ||\n                  null,\n                rank,`,
      "save role description payload"
    );

    source = replaceOnce(
      source,
      `            JSON.stringify({\n              name:\n                permissionRole.name,\n              rank:`,
      `            JSON.stringify({\n              name:\n                permissionRole.name,\n              description:\n                permissionRole.description,\n              rank:`,
      "permission save preserves description"
    );

    source = replaceOnce(
      source,
      `                        {scopeDescription(role.dataScope)}\n                      </span>`,
      `                        {role.description ||\n                          "No description provided."}\n                      </span>`,
      "Role table persisted description"
    );

    source = replaceOnce(
      source,
      `              <label className="form-field role-rank-field">\n                <span>Authority rank</span>`,
      `              <label className="form-field">\n                <span>Description</span>\n                <textarea\n                  value={draft.description}\n                  maxLength={500}\n                  rows={3}\n                  placeholder="Describe the purpose and responsibility of this role"\n                  onChange={(event) =>\n                    setDraft((current) => ({\n                      ...current,\n                      description:\n                        event.target.value,\n                    }))\n                  }\n                />\n              </label>\n\n              <label className="form-field role-rank-field">\n                <span>Authority rank</span>`,
      "Role description editor field"
    );

    source = replaceOnce(
      source,
      `{scopeDescription(permissionRole.dataScope)} · {permissionDraft.length} permission{permissionDraft.length === 1 ? "" : "s"} selected`,
      `{permissionRole.description || "No description provided."} · {permissionDraft.length} permission{permissionDraft.length === 1 ? "" : "s"} selected`,
      "Role details persisted description"
    );

    write(file, source);
  }

  console.log("F.4 role-description codemod applied successfully.");
} catch (error) {
  for (const [file, content] of originals.entries()) {
    write(file, content);
  }
  console.error("F.4 role-description codemod aborted; source files were restored.");
  throw error;
}
