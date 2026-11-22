import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("pages/DashboardPage.tsx");
const css = read("pages/DashboardPage.css");
const marker = "DASHBOARD — READABLE TEXT AND PHONE LAYOUT";
const block = css.slice(css.indexOf(marker));
assert.ok(css.includes(marker) && css.lastIndexOf("@media") > css.indexOf(marker), "The readability and phone block comes last, after the older Dashboard rules");
const phoneStart = block.indexOf("@media (max-width: 720px) {");
const allWidths = block.slice(0, phoneStart);
const phone = block.slice(phoneStart);
const rule = (source, selector) => {
  const at = source.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} has a rule`);
  return source.slice(at, source.indexOf("}", at));
};
const ruleIn = (source, selector) => {
  const at = source.indexOf(selector);
  assert.ok(at >= 0, `${selector} is styled`);
  return source.slice(at, source.indexOf("}", at));
};

// 1. Readable text at every width: nothing under 11px, 11px only for uppercase labels.
for (const [, size] of block.matchAll(/font-size: (\d+(?:\.\d+)?)px/g)) {
  assert.ok(Number(size) >= 11, `No Dashboard text under 11px (found ${size}px)`);
}
for (const selector of [
  ".agency-person-copy strong",
  ".agency-person-copy span",
  ".agency-model-row > div:first-child strong",
  ".agency-model-row > div:first-child span",
  ".agency-person-meta time",
  ".agency-model-stat span",
  ".agency-person-status",
  ".agency-access-summary span",
  ".agency-access-summary strong",
  ".agency-incident-person strong",
  ".agency-incident-person span",
  ".agency-incident-violation span",
  ".agency-incident-violation strong",
  ".agency-incident-state strong",
  ".agency-incident-state span",
]) {
  assert.ok(allWidths.includes(selector), `${selector} is raised at every width`);
}
assert.ok(/\.agency-access-summary span,[^{]*\{[^}]*font-size: 11px;[^}]*text-transform: uppercase;/.test(allWidths), "Labels are 11px uppercase labels");
assert.ok(!/\.card-header h3 \{/.test(phone), "No phone heading size that the global !important rule would override");
pass("The new rules raise Dashboard text to at least 11px at every width (13px names and helpers, 11px uppercase labels)");

// 2. The number cards were replaced by the attention cards (23 Nov,
// test:dashboard-attention); their old rules went with them.
assert.ok(!page.includes("agency-metric") && !css.includes("agency-metric"), "No number-card markup or leftover rules");
assert.ok(/content: "";/.test(rule(phone, ".agency-dashboard-panel .card-header .text-button::after")), "Card header links keep a drawn arrow, with no text for screen readers to read");
pass("The number cards and their rules are gone; card header links keep their drawn arrow on phones");

// 3. Card headers: title and link on one line, no description on phones.
assert.ok(/flex-direction: row;\s*align-items: center;/.test(rule(phone, ".agency-dashboard-panel .card-header")), "Title and link share a line");
assert.ok(/display: none;/.test(rule(phone, ".agency-dashboard-panel .card-header p")), "The description is hidden on phones");
assert.ok(/min-height: 40px;/.test(rule(phone, ".agency-dashboard-panel .card-header .text-button")) && /font-size: 13px !important;/.test(rule(phone, ".agency-dashboard-panel .card-header .text-button")), "The link is a 40px, 13px target");
assert.ok(/display: none;/.test(rule(phone, ".agency-dashboard-header .page-description")), "The intro sentence is hidden on phones; the header names the page");
const intro = page.slice(page.indexOf('<header className="page-header agency-dashboard-header">'), page.indexOf("</header>"));
assert.ok(!intro.includes("page-eyebrow") && !page.includes("Agency overview") && /<h2>\s*Dashboard\s*<\/h2>/.test(intro), 'The "Agency overview" label above the title is gone at every width');
for (const text of ["Latest accounts added to People Management.", "Active creators and their current assignment load.", "What needs attention across your people, attendance and quality."]) {
  assert.ok(page.includes(text), `"${text}" is kept for desktop`);
}
pass("Phones: card titles sit beside their View link, and the descriptions are kept for desktop only");

// 4. Rows: one tidy row each.
assert.ok(/grid-template-columns: 32px minmax\(0, 1fr\) auto;/.test(rule(phone, ".agency-people-row")), "People rows keep status and date on the right");
assert.ok(/display: none;/.test(rule(phone, ".agency-people-row:nth-child(n + 4)")), "Phones show the 3 newest people");
assert.ok(/grid-column: auto;/.test(rule(phone, ".agency-person-meta")), "Status and date no longer wrap under the name");
assert.ok(/flex-direction: row;\s*align-items: baseline;/.test(rule(phone, ".agency-model-stat")), '"2 incidents" reads on one line');
assert.ok(page.includes('{model.incidentCount === 1\n                              ? "incident"\n                              : "incidents"}'), '"1 incident", not "1 incidents"');
assert.ok(/grid-template-columns: minmax\(0, 1fr\) auto;/.test(rule(phone, ".agency-incident-row")) && /grid-row: 1 \/ 3;/.test(rule(phone, ".agency-incident-state")), "Incidents: person and rule left, severity right");
const incidentLabels = ruleIn(phone, ".agency-incident-violation span,\n  .agency-incident-state strong");
assert.ok(/clip-path: inset\(50%\);/.test(incidentLabels) && /position: absolute;/.test(incidentLabels) && !/display: none;/.test(incidentLabels), 'The repeated "Violation" and "Open incident" labels are hidden on screen but still read by screen readers');
assert.ok(rule(phone, ".agency-incident-person span::before").includes('content: "·" / "";'), "The separator dot is silent for screen readers");
pass("Phones: people, creators and incidents each take one compact row");

// 5. Empty states and Coming later.
assert.ok(/min-height: 0;/.test(rule(phone, ".agency-dashboard-panel .dashboard-empty")) && /display: none;/.test(rule(phone, ".agency-dashboard-panel .dashboard-empty span")), "Empty states are one line on phones");
assert.ok(page.includes('className="content-card agency-dashboard-panel agency-access-panel agency-upcoming-panel"'), "Coming later has its own hook");
assert.equal((page.match(/<strong>Coming later<\/strong>/g) ?? []).length, 3, "Schedule, Revenue and Commission sheets still say coming later (brief section 9)");
assert.ok(/flex-direction: row;/.test(rule(phone, ".agency-upcoming-panel .agency-access-summary > div")), "One line per Coming later item");
pass('Phones: empty states are one line, and "Coming later" is one line per item for Schedule, Revenue and Commission sheets');
console.log(`${passed} Dashboard phone groups passed.`);
