import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const layout = read("components/AppLayout.tsx");
const header = layout.slice(layout.indexOf('<header className="portal-command-bar portal-command-bar-v2">'), layout.indexOf("</header>"));

// 1. Markup: inline creator label, no Role block, no "US Central" label,
//    and the person (name + role) inside the account button.
assert.ok(header.includes('<span className="portal-command-label">\n              Creator\n            </span>') && header.includes('aria-label="Creator"'), "The picker label is just Creator");
assert.ok(!header.includes("portal-command-role") && !header.includes(">\n              Role\n            </span>"), "The separate Role block is gone");
assert.ok(!header.includes("US Central\n"), "The clock has no US Central label; the zone is on the time");
const button = header.slice(header.indexOf('className="portal-account-avatar-button"'), header.indexOf("</button>", header.indexOf('className="portal-account-avatar-button"')));
assert.ok(button.includes('<span className="portal-account-identity">') && /\{firstNameOf\(\s*user\?\.name\s*\)\}/.test(button) && button.includes("{roleNames}") && button.includes('className="portal-account-chevron"'),
  "The account button shows the signed-in person: avatar, first name, role and a menu arrow");
assert.ok(/<strong\s+title=\{\s*user\?\.name\s*\}\s*>\s*\{firstNameOf\(/.test(button), "Hovering the first name shows the full name");
const firstStart = layout.indexOf("function firstNameOf(");
const firstSource = layout.slice(firstStart, layout.indexOf("\n}\n", firstStart) + 2).replace(/name\?: string \| null/, "name");
const firstNameOf = new Function(`${firstSource}; return firstNameOf;`)();
assert.equal(firstNameOf("Rainheart - Developer - Test Account"), "Rainheart");
assert.equal(firstNameOf("  Olivia Reed "), "Olivia");
assert.equal(firstNameOf("Mary-Jane Watson"), "Mary-Jane");
assert.equal(firstNameOf("Cher"), "Cher");
assert.equal(firstNameOf("- Rainheart"), "Rainheart", "Leading punctuation is skipped");
assert.equal(firstNameOf("Ana Lopez"), "Ana", "Non-breaking spaces separate words");
assert.equal(firstNameOf("   "), "");
assert.equal(firstNameOf(undefined), "");
assert.equal(firstNameOf(null), "");
assert.ok(button.includes('aria-label={`${user?.name ?? "Account"}, ${roleNames}: open account menu`}') && button.includes('aria-haspopup="menu"'), "The account button's spoken name includes the visible name and role (WCAG 2.5.3)");
pass("Header markup: inline Creator label, no Role block or US Central label, and the person in the account button");

// 2. Clock: "6:25 AM CST" over "Sun, Nov 22", with the full date in the tooltip.
const dayStart = layout.indexOf("function formatCentralDay(");
const daySource = layout.slice(dayStart, layout.indexOf("\n}\n", dayStart) + 2).replace(/value:\s*Date,/, "value,");
const formatCentralDay = new Function("CENTRAL_TIME_ZONE", `${daySource}; return formatCentralDay;`)("America/Chicago");
const sample = new Date("2026-11-22T13:25:00Z");
assert.equal(formatCentralDay(sample), "Sun, Nov 22");
assert.equal(formatCentralDay(sample, true), "Sunday, November 22, 2026");
assert.equal(formatCentralDay(new Date("2026-11-23T04:30:00Z")), "Sun, Nov 22", "Late evening in Chicago is still the Central date");
assert.ok(header.includes("{centralClock}") && header.includes("{centralZone}") && header.includes("{centralDay}") && header.includes("centralDayLong"), "Time with zone, short date, full date as tooltip");
assert.ok(!layout.includes("formatCentralDateZone"), "The old date-plus-zone line is gone");
pass('Header clock reads "6:25 AM CST" over "Sun, Nov 22", in US Central, with the full date on hover');

// 3. Desktop styles: one row, one 32px height, time first, the person on the right.
const css = read("components/PortalAccess.css");
const v3 = css.slice(css.indexOf("Header v3 (desktop, 721px and up)"));
assert.ok(v3.length > 0 && css.indexOf("Header v3") > css.indexOf("Shell type minimum"), "Header v3 comes last, after the older header rules");
const desktop = v3.slice(v3.indexOf("@media (min-width: 721px) {"), v3.indexOf("@media (min-width: 721px) and (max-width: 1100px)"));
for (const [selector, rule] of [
  [".portal-command-context-v2 select", /height: 32px;/],
  [".portal-command-meta .hub-notifications-trigger", /height: 32px;/],
  [".portal-account-avatar-button", /height: 32px;/],
  [".portal-command-time", /order: -1;/],
  [".portal-account-identity", /display: grid;/],
]) {
  const block = desktop.slice(desktop.indexOf(selector), desktop.indexOf("}", desktop.indexOf(selector)));
  assert.ok(desktop.includes(selector) && rule.test(block), `${selector} → ${rule}`);
}
assert.ok(/\.portal-command-bar-v2 \{\s*grid-template-columns:\s*auto\s*minmax\(0, 1fr\);/.test(desktop), "The picker column fits its content");
assert.ok(/\.portal-command-context-v2 \{\s*display: flex;\s*align-items: center;/.test(desktop), "The Creator label sits beside the menu");
const narrow = v3.slice(v3.indexOf("@media (min-width: 721px) and (max-width: 1023px)"));
assert.ok(/\.portal-account-identity,\s*\.portal-account-chevron \{\s*display: none;/.test(narrow) && /width: 32px;/.test(narrow), "721-1023px: avatar-only account button so nothing overlaps");
assert.ok(/min-width: 140px;\s*max-width: 180px;/.test(narrow), "721-1023px: the picker is capped so long creator names can't push the time over it");
assert.ok(!/border-color: #333333;/.test(desktop), "Header controls use the #666666 control border, like the bell");
assert.ok(/\.portal-command-context-v2 select,\n\.portal-command-context-v2 \.portal-command-context-static \{\s*min-height: 40px;[^}]*background-color: var\(--surface\);/.test(css), "The picker keeps its drawn arrow (no background shorthand wiping it)");
pass("Desktop header: one row at 32px, picker with an inline label, then time, bell and the person; avatar only below 1024px");

// 4. Phones: one row (time, bell, avatar); the name stays hidden.
const phone = v3.slice(v3.indexOf("Phone header row"));
assert.ok(/@media \(max-width: 720px\) \{[\s\S]*?\.portal-command-meta \{\s*display: flex;/.test(phone) && /\.portal-command-time \{\s*order: -1;/.test(phone), "Phone: time, bell and avatar side by side");
assert.ok(/\.portal-account-identity,\s*\.portal-account-chevron \{\s*display: none;\s*\}\s*\n\s*@media \(min-width: 721px\)/.test(v3), "Name and arrow are hidden by default (phones), shown from 721px");
pass("Phone header: time, bell and avatar on one row (the bell no longer pushes the avatar onto a second row)");
console.log(`${passed} header redesign groups passed.`);
