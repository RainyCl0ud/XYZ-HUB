const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const files = [
  "backend/src/services/role-management.ts",
  "frontend/src/pages/RoleSettingsRankPage.tsx",
];

function readNormalized(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const original = fs.readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    original,
    newline: original.includes("\r\n") ? "\r\n" : "\n",
    source: original.replace(/\r\n/g, "\n"),
  };
}

function writePreservingNewlines(file) {
  const output = file.newline === "\r\n"
    ? file.source.replace(/\n/g, "\r\n")
    : file.source;
  fs.writeFileSync(file.absolutePath, output, "utf8");
}

function replaceOnce(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  const last = source.lastIndexOf(oldText);

  if (first < 0) {
    throw new Error(`F.4 build-fix codemod could not find: ${label}`);
  }

  if (first !== last) {
    throw new Error(`F.4 build-fix codemod found multiple matches for: ${label}`);
  }

  return source.slice(0, first) + newText + source.slice(first + oldText.length);
}

const working = new Map(files.map((file) => [file, readNormalized(file)]));

try {
  {
    const file = working.get(files[0]);
    file.source = replaceOnce(
      file.source,
      `  description:\n    string | null | undefined;`,
      `  description?:\n    string | null;`,
      "optional RoleBuilderInput description"
    );
  }

  {
    const file = working.get(files[1]);
    file.source = replaceOnce(
      file.source,
      `function scopeDescription(\n  value: DataScope\n) {\n  return SCOPE_OPTIONS.find(\n    (option) =>\n      option.value === value\n  )?.description ?? value;\n}\n\n`,
      "",
      "unused scopeDescription helper"
    );
  }

  for (const file of working.values()) {
    writePreservingNewlines(file);
  }

  console.log("✓ RoleBuilderInput description now matches the optional API schema.");
  console.log("✓ Removed unused Role Settings scopeDescription helper.");
  console.log("F.4 build-error fix applied successfully.");
} catch (error) {
  for (const file of working.values()) {
    fs.writeFileSync(file.absolutePath, file.original, "utf8");
  }

  console.error("F.4 build-error fix aborted; source files were restored.");
  throw error;
}
