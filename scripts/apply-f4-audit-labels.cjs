const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "backend/src/services/audit-presentation.ts"
);

const originalRaw = fs.readFileSync(file, "utf8");
const eol = originalRaw.includes("\r\n")
  ? "\r\n"
  : "\n";
const original = originalRaw.replace(/\r\n/g, "\n");

function write(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  fs.writeFileSync(
    file,
    eol === "\r\n"
      ? normalized.replace(/\n/g, "\r\n")
      : normalized,
    "utf8"
  );
}

function replaceOnce(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  const last = source.lastIndexOf(oldText);

  if (first < 0) {
    throw new Error(`F.4 audit-label codemod could not find: ${label}`);
  }
  if (first !== last) {
    throw new Error(`F.4 audit-label codemod found multiple matches for: ${label}`);
  }

  return source.slice(0, first) + newText + source.slice(first + oldText.length);
}

try {
  let source = original;

  source = replaceOnce(
    source,
    `    "team_group.deleted":\n      "Team group deleted",`,
    `    "team_group.deleted":\n      "Team group deleted",\n    "qa.severity.created":\n      "Severity created",\n    "qa.severity.updated":\n      "Severity updated",\n    "qa.severity.archived":\n      "Severity archived",\n    "qa.severity.reactivated":\n      "Severity reactivated",\n    "qa.severity.reordered":\n      "Severity order updated",\n    "qa.weight.created":\n      "Strike weight created",\n    "qa.weight.updated":\n      "Strike weight updated",\n    "qa.weight.archived":\n      "Strike weight archived",\n    "qa.weight.reactivated":\n      "Strike weight reactivated",\n    "qa.weight.reordered":\n      "Strike weight order updated",\n    "qa.rule.created":\n      "QA rule created",\n    "qa.rule.version_created":\n      "QA rule version created",\n    "qa.rule.archived":\n      "QA rule archived",\n    "qa.rule.reactivated":\n      "QA rule reactivated",\n    "qa.strike_ladder.version_created":\n      "Strike ladder version created",\n    "qa.incident.logged":\n      "Incident logged",\n    "qa.incident.updated":\n      "Incident updated",\n    "qa.incident.resolved":\n      "Incident resolved",\n    "qa.incident.voided":\n      "Incident voided",\n    "qa.chatter.created":\n      "Chatter created",\n    "qa.chatter.updated":\n      "Chatter updated",\n    "qa.chatter.deactivated":\n      "Chatter deactivated",\n    "qa.chatter.reactivated":\n      "Chatter reactivated",`,
    "QA audit action labels"
  );

  write(source);
  console.log("F.4 QA audit labels applied successfully.");
} catch (error) {
  write(original);
  console.error("F.4 audit-label codemod aborted; source was restored.");
  throw error;
}
