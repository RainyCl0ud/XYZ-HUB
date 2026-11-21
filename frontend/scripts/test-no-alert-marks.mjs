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

// A "!" right after a quote or a closing tag, followed by text, a value, a
// quote (so "!" and "! " strings count) or a tag; a "!" alone between tags;
// and CSS content that adds one.
const patterns = [
  { name: '"!" at the start of text', re: /(["'`>])!\s*(?=["'`<$\w{])/g },
  { name: '"!" alone between tags', re: />\s*!\s*</g },
  { name: 'CSS content adding "!"', re: /content:\s*(["'])!/g },
];
const flagged = (line) => patterns.some(({ re }) => { re.lastIndex = 0; return re.test(line); });

// The guard must catch every form the clean-up removed and leave ordinary code alone.
const bad = [
  '{x ? "! " : ""}{count}',
  '<p role="alert">! {error}</p>',
  "<strong>! Your shift</strong>",
  'return "!";',
  "emailBadge={n ? `! ${n}` : \"\"}",
  "'! ' + message",
  "<span>!</span>",
  "<b> ! </b>",
  ".x::before { content: '! '; }",
];
const fine = ["if (!ready) return;", "a !== b", "{!loading && <p>Hi</p>}", "items.filter((x) => !x.done)", "state_!.problem", '"Saved"', "value={!busy}"];
for (const line of bad) assert.ok(flagged(line), "Guard misses: " + line);
for (const line of fine) assert.ok(!flagged(line), "Guard false positive: " + line);

const found = [];
for (const file of files) {
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
    for (const { name, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(line)) found.push(`${relative(root, file)}:${index + 1} ${name}: ${line.trim().slice(0, 120)}`);
    }
  });
}
assert.equal(found.length, 0, `"!" markers are back:\n${found.join("\n")}`);
console.log(`PASS 1: No "!" markers in ${files.length} frontend source files (messages, buttons, badges, toasts or CSS); the guard catches ${bad.length} known forms.`);

const toast = readFileSync(join(root, "components/ToastProvider.tsx"), "utf8").replace(/\r\n/g, "\n");
assert.ok(toast.includes('case "error":\n      return "✕";') && toast.includes('case "warning":\n      return "△";'), "Toast icons use ✕ and △, not !");
const audit = readFileSync(join(root, "pages/AuditPage.tsx"), "utf8");
assert.ok(audit.includes('email.problem ? "dot" : ""') && audit.includes('emailBadge === "dot" ? "audit-tab-badge is-dot" : "audit-tab-badge"'), "The Email delivery tab shows a count or a dot");
assert.ok(audit.includes('emailBadge === "dot" ? ", needs a look"'), "Screen readers still hear that it needs a look");
console.log("PASS 2: Toasts and the Audit Log Email delivery badge use plain marks: ✕, △, a count or a dot.");
