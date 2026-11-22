import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");
// Turn a small TypeScript function into plain JavaScript and run it.
const load = (source, name) => new Function(`${source.replace(/export /g, "").replace(/\((\w+): string\)/g, "($1)")}; return ${name};`)();
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

// 1. Dashboard shows a readable data scope.
const formatDataScope = load(read("lib/data-scope.ts"), "formatDataScope");
assert.equal(formatDataScope("ALL"), "All data");
assert.equal(formatDataScope("SELF_AND_TEAM"), "Self + subordinates");
assert.equal(formatDataScope("SELF"), "Self only");
const dashboard = read("pages/DashboardPage.tsx");
assert.ok(dashboard.includes("? formatDataScope(access.effectiveDataScope)") && !/\{access\?\.effectiveDataScope \?\?/.test(dashboard), "Dashboard never prints the raw setting");
for (const page of ["pages/PeoplePage.tsx", "pages/PeopleDetailPage.tsx", "pages/DashboardPage.tsx"]) {
  const source = read(page);
  assert.ok(source.includes('import { formatDataScope } from "../lib/data-scope";') && !source.includes("function formatDataScope("), page + " uses the shared label");
}
pass("Dashboard and People pages share one readable data scope label (All data, Self + subordinates, Self only)");

// 2. Errors and destructive actions are monochrome.
const foundation = read("WebKitFoundation.css");
assert.ok(/--danger: #ffffff;\s*--danger-strong: #ffffff;\s*--danger-bg: rgba\(255, 255, 255, 0\.08\);/.test(foundation), "Danger tokens are white, like success, warning and info");
assert.ok(!foundation.includes("Destructive-action colors intentionally continue to inherit"), "No stale comment about keeping the old red");
const red = /rgba\((229, ?141, ?135|202, ?85, ?78|185, ?28, ?28|153, ?27, ?27)|#efaaa5|#f7d6d3|#8a4946|#6e3734|#9f5450|#82413d|#e58d87|#ef9a93|#991b1b|#f08080|#ffaaaa/i;
const live = ["index.css", "auth/RequireAuth.css", "pages/AuthPages.css", "pages/AuditPage.css", "pages/ModelsPage.css", "pages/PeoplePage.css", "pages/RoleSettingsPage.css", "components/PortalAccess.css", "pages/StrikesPage.css", "pages/ChatPage.css"];
for (const file of live) {
  const css = read(file).replace(/--danger(-strong|-bg)?: [^;]+;/g, "");
  assert.ok(!red.test(css), file + " has no red left");
}
const index = read("index.css");
assert.ok(/\.danger-button \{\s*border: 2px solid #ffffff;\s*background: #000000;\s*color: #ffffff;\s*font-weight: 700;/.test(index), "Destructive buttons: heavy white border, no red fill");
assert.ok(/\.alert-error \{\s*border: 2px solid #ffffff;/.test(index) && /\.auth-message-error \{[^}]*border: 2px solid #FFFFFF;/.test(read("pages/AuthPages.css")), "Error banners: 2px white border");
assert.ok(/\.strikes-inline-error \{[^}]*border: 2px solid #FFFFFF;[^}]*color: #FFFFFF;\s*font-weight: 700;/.test(read("pages/StrikesPage.css")), "Strikes errors are readable white, not dark red");
pass("Errors, the Sign out dialog, delete buttons, Strikes and Chat are white-on-black with white borders, never red");

// 3. Nothing in the header, sidebar, account menu or footers is under 11px.
const portal = read("components/PortalAccess.css");
const tail = portal.slice(portal.indexOf("Shell type minimum"));
assert.ok(portal.indexOf("Shell type minimum") > portal.lastIndexOf("font-size: 5.9px"), "The minimum comes after the old tiny sizes");
for (const selector of [".hub-nav-heading",".portal-account-dropdown-item", ".portal-account-avatar", ".portal-clock-date"]) assert.ok(tail.includes(selector), selector + " is raised to 11px");
for (const unused of [".sidebar-nav-label", ".owner-rail-row", ".portal-workspace-label"]) assert.ok(!tail.includes(unused), unused + " matches nothing, so it isn't listed");
assert.ok(/\.hub-nav-heading \{[^}]*font-size: 11px;/.test(read("components/SidebarNavigation.css")), "Sidebar section headings are 11px where they're defined");
assert.ok(/@media \(max-width: 720px\) \{\s*\.portal-clock-time \{\s*font-size: 11px !important;\s*\}[\s\S]*?\.portal-clock-date \{\s*display: none !important;/.test(tail), "On tablets and phones the time is 11px and the unreadable date is hidden");
const layout = read("components/AppLayout.tsx");
assert.ok(layout.includes('<span className="portal-clock-zone">') && layout.includes("function formatCentralZone(") && /const centralZone =\s*useMemo\(\s*\(\) =>\s*formatCentralZone\(/.test(layout), "The header time carries its zone");
// Header v3 shows the zone on the time at every width (it comes last in the file).
assert.ok(tail.lastIndexOf(".portal-clock-zone {\n  display: inline;") > tail.lastIndexOf(".portal-clock-zone {\n  display: none;"), "The zone shows beside the time");
assert.ok(/\.hub-confidentiality-footer \{[^}]*font-size: 11px;/.test(foundation) && /\.portal-persistent-footer \{[^}]*font-size: 11px;/.test(foundation) && /\.hub-confidentiality-footer-auth \{[^}]*font-size: 11px;/.test(foundation), "Confidentiality footers are 11px");
assert.ok(!/\.portal-persistent-footer \{[^}]*font-size: 8px;/.test(foundation), "No 8px footer on phones");
pass("Header labels, sidebar headings, the account menu and the confidentiality footer are at least 11px; phones show the time with CST/CDT");

// 4. Clock copy.
const clock = read("pages/ClockPage.tsx");
assert.ok(!clock.includes("Use Time corrections below") && clock.includes('{data.canRequestCorrections && <> If a recorded time needs changing, ask for a correction in <Link to="/clock?tab=requests">My requests</Link>.</>}'), "The 14-hour notice points to My requests, only for people who can ask for a correction");
assert.ok(!clock.includes("Counting rule") && clock.includes('<th scope="col">Includes</th>'));
const weekSource = clock.slice(clock.indexOf("function weekLabel("), clock.indexOf("\n}\n", clock.indexOf("function weekLabel(")) + 2);
const weekLabel = load(weekSource, "weekLabel");
assert.equal(weekLabel("2026-11-16"), "Nov 16");
assert.equal(weekLabel("2026-03-02"), "Mar 2");
assert.equal(weekLabel("not-a-date"), "not-a-date");
assert.ok(clock.includes("Week of {weekLabel(data.totals.weekKey)}, Monday to Sunday (US Central)."));
assert.ok(read("pages/ClockPage.css").includes(".clock-callout a { color: #FFFFFF; font-weight: 700; text-decoration: underline;"), "The link in the notice looks like a link");
pass('Clock: the 14-hour notice links to My requests, the week reads "Week of Nov 16", and the column says "Includes"');
console.log(`${passed} clean-up batch 1 groups passed.`);
