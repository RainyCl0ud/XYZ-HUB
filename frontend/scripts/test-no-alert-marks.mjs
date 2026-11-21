import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Owner decision (22 November 2026): messages, buttons, badges and toasts
// never lead with a "!" marker. Errors are marked by their bold, white-bordered
// box instead. This guard keeps the marker from coming back on any page.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (/\.(tsx|ts|css)$/.test(name)) files.push(path); } };
walk(root);

const patterns = [
  { name: 'text that starts with "! "', re: /(["'`>])! (?=[A-Za-z{$])/g },
  { name: 'a lone "!" string', re: /(["'`])!\1/g },
  { name: 'CSS content adding "!"', re: /content:\s*(["'])!/g },
];
const found = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { name, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(line)) found.push(`${relative(root, file)}:${index + 1} ${name}: ${line.trim().slice(0, 120)}`);
    }
  });
}
assert.equal(found.length, 0, `"!" markers are back:\n${found.join("\n")}`);
console.log(`PASS 1: No "!" markers in ${files.length} frontend source files (messages, buttons, badges, toasts or CSS).`);

const toast = readFileSync(join(root, "components/ToastProvider.tsx"), "utf8").replace(/\r\n/g, "\n");
assert.ok(toast.includes('case "error":\n      return "✕";') && toast.includes('case "warning":\n      return "△";'), "Toast icons use ✕ and △, not !");
const audit = readFileSync(join(root, "pages/AuditPage.tsx"), "utf8");
assert.ok(audit.includes('email.problem ? "dot" : ""') && audit.includes('emailBadge === "dot" ? "audit-tab-badge is-dot" : "audit-tab-badge"'), "The Email delivery tab shows a count or a dot");
assert.ok(audit.includes('emailBadge === "dot" ? ", needs a look"'), "Screen readers still hear that it needs a look");
console.log("PASS 2: Toasts and the Audit Log Email delivery badge use plain marks: ✕, △, a count or a dot.");
