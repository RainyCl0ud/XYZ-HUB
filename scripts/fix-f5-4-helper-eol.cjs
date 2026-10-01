const fs = require("fs");

const path = "scripts/apply-f5-4-pagination-ladder-correction.cjs";
let source = fs.readFileSync(path, "utf8");

const start = source.indexOf("function updateFile(path, transforms) {");
const next = source.indexOf('updateFile("frontend/src/pages/IncidentsPage.tsx"', start);

if (start < 0 || next < 0) {
  throw new Error("Unable to locate the F.5.4 helper updateFile block.");
}

const replacement = `function updateFile(path, transforms) {
  let content = read(path);
  const eol = content.includes("\\r\\n") ? "\\r\\n" : "\\n";

  for (const transform of transforms) {
    const before = transform.before.replace(/\\n/g, eol);
    const after = transform.after.replace(/\\n/g, eol);

    // Safe resume support: earlier transforms may already have been applied
    // if a later guarded transform failed during a previous run.
    if (content.includes(after)) {
      continue;
    }

    content = replaceOnce(
      content,
      before,
      after,
      \`\${path}: \${transform.label}\`
    );
  }

  write(path, content);
}

`;

source = source.slice(0, start) + replacement + source.slice(next);
fs.writeFileSync(path, source, "utf8");
console.log("✓ F.5.4 helper is now CRLF/LF-safe and can resume partial runs.");
