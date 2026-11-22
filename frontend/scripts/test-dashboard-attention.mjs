import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("src/pages/DashboardPage.tsx");
const css = read("src/pages/DashboardPage.css");
const provider = read("src/components/ClockReviewCountProvider.tsx");
const overview = read("../backend/src/services/clock-owner-overview.ts");

// The signed-in account comes from this stub, so each render can use a
// different fictional role without a session or an API.
const authStub = {
  name: "dashboard-auth-stub",
  enforce: "pre",
  load(id) {
    if (id.replace(/\\/g, "/").endsWith("/src/auth/AuthContext.tsx")) {
      return "export const useAuth = () => globalThis.__dashboardAuth;\nexport const AuthProvider = ({ children }) => children;";
    }
  },
};

// VITE_BLOCK2_CLOCK_ENABLED is a build-time flag, so each value gets its own server.
const servers = new Map();
async function load(clockEnabled) {
  if (!servers.has(clockEnabled)) {
    const vite = await createServer({
      root, configFile: false, envDir: false, plugins: [authStub],
      define: { "import.meta.env.VITE_BLOCK2_CLOCK_ENABLED": JSON.stringify(clockEnabled ? "true" : "false") },
      optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
      server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
    });
    servers.set(clockEnabled, { vite, page: (await vite.ssrLoadModule("/src/pages/DashboardPage.tsx")).default });
  }
  return servers.get(clockEnabled);
}

const account = (systemKey, permissions) => ({
  roles: [{ id: `role-${systemKey.toLowerCase()}`, name: systemKey, systemKey }],
  permissions: ["dashboard.view", ...permissions],
  canSeeAllModels: systemKey === "OWNER",
  assignedModelIds: [],
  effectiveDataScope: systemKey === "OWNER" ? "ALL" : "SELF_AND_TEAM",
});
async function render(access, clockEnabled = true) {
  const { page: Dashboard } = await load(clockEnabled);
  globalThis.__dashboardAuth = { access };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Dashboard)));
}
const top = (html) => html.slice(0, html.indexOf('class="agency-dashboard-grid"'));
const linkTo = (html, href, text) => new RegExp(`<a[^>]*href="${href.replace(/[?]/g, "\\?")}"[^>]*>(?:(?!</a>).)*${text}`, "s").test(html);

const clockOwner = ["clock.access", "clock.self.view", "clock.overview.agency", "clock.corrections.all"];
const everything = ["people.access", "models.access", "quality.access", "dashboard.upcoming.view"];

try {
  // 1. Owner: both attention cards first, then incidents, creators, people.
  const owner = await render(account("OWNER", [...everything, ...clockOwner]));
  assert.ok(!owner.includes("agency-metric") && !owner.includes("Active people") && !owner.includes("Available for assignments"), "The four number cards are gone");
  const order = ["<h3>Needs attention</h3>", "<h3>On the clock now</h3>", "<h3>Open QA incidents</h3>", "<h3>Current creators</h3>", "<h3>Recently added people</h3>", "<h3>Coming later</h3>"].map((h) => owner.indexOf(h));
  assert.ok(order.every((at) => at >= 0), "Every Owner card renders");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Order: Needs attention, On the clock now, Open QA incidents, Current creators, Recently added people, Coming later");
  assert.ok(linkTo(owner, "/clock?tab=review", "Corrections to review") && owner.includes("Waiting for your approval"), "Corrections to review opens the review tab");
  assert.ok(linkTo(owner, "/clock", "Long shifts") && owner.includes("Clocked in 14 hours or more"), "Long shifts opens the agency attendance");
  assert.ok(linkTo(owner, "/incidents", "Open QA incidents"), "Open QA incidents opens the incident list");
  assert.ok(linkTo(owner, "/clock", "View attendance") && owner.includes("Loading attendance…"), "On the clock now links to attendance and loads");
  assert.ok(owner.includes("What needs attention across your people, attendance and quality."), "The intro describes the new Dashboard");
  assert.ok(!top(owner).includes("!"), "No ! markers in the attention cards");
  pass("Owner: the number cards are replaced by Needs attention and On the clock now, above incidents, creators and people");

  // 2. Manager: team attendance through their own Clock page.
  const manager = await render(account("MANAGER", ["quality.access", "clock.access", "clock.self.view", "clock.overview.team", "clock.corrections.assigned"]));
  assert.ok(linkTo(manager, "/clock?tab=team", "View attendance") && linkTo(manager, "/clock?tab=team", "Long shifts"), "Managers open the Team tab");
  assert.ok(linkTo(manager, "/clock?tab=review", "Corrections to review"), "Managers who review corrections see the count");
  pass("Manager: attendance links open the Team tab of their Clock page; corrections link to the review tab");

  // 3. QC without attendance or review grants: incidents only.
  const qc = await render(account("QC", ["quality.access", "clock.access", "clock.self.view"]));
  assert.ok(qc.includes("<h3>Needs attention</h3>") && linkTo(qc, "/incidents", "Open QA incidents"), "QC keeps the incident count");
  assert.ok(!qc.includes("Corrections to review") && !qc.includes("Long shifts") && !qc.includes("On the clock now"), "No attendance rows without the permission");
  pass("QC: Needs attention shows only Open QA incidents; no attendance card without an attendance grant");

  // 4. Chatter: no attention cards; Your account as before.
  const chatter = await render(account("CHATTER", ["clock.access", "clock.self.view"]));
  assert.ok(!chatter.includes("agency-attention-grid") && chatter.includes("<h3>Your account</h3>"), "Chatters keep the Your account card");
  pass("Chatter: no attention cards, and the Your account card is unchanged");

  // 5. Attendance without the Clock page: counts show, rows don't link.
  const coordinator = await render(account("COORDINATOR", ["clock.access", "clock.overview.team"]));
  assert.ok(coordinator.includes("<h3>On the clock now</h3>") && !coordinator.includes("View attendance") && !/<a[^>]*>(?:(?!<\/a>).)*Long shifts/s.test(coordinator), "No link to a page the account can't open");
  pass("Attendance without Clock page access shows the cards without links to /clock");

  // 6. Clock flag off: nothing from the Clock, even for an Owner.
  const flagOff = await render(account("OWNER", [...everything, ...clockOwner]), false);
  assert.ok(!flagOff.includes("Corrections to review") && !flagOff.includes("Long shifts") && !flagOff.includes("On the clock now") && flagOff.includes("<h3>Needs attention</h3>"), "Clock rows need the build flag");
  pass("With the Clock turned off, the Dashboard shows no attendance rows or card");

  // 7. Row order, durations and words.
  const lib = await (await load(true)).vite.ssrLoadModule("/src/lib/dashboard-attention.ts");
  const now = Date.parse("2026-11-23T18:00:00.000Z");
  const shift = (id, hours, breakMinutes = null, kind = "MEAL") => ({
    id, personName: `Person ${id}`, teamName: "Team A", startedAt: new Date(now - hours * 3600_000).toISOString(),
    elapsedSeconds: hours * 3600, activeBreak: breakMinutes === null ? null : { kind, startedAt: new Date(now - breakMinutes * 60_000).toISOString() },
  });
  const rows = lib.attentionOrder({ serverNow: new Date(now).toISOString(), counts: {}, activeShifts: [shift("new", 1), shift("break-short", 3, 9, "SHORT_ONE"), shift("long", 15), shift("old", 5), shift("break-meal", 4, 22), shift("longer", 16, 5)] });
  assert.deepEqual(rows.map((r) => r.id), ["longer", "long", "break-meal", "break-short", "new", "old"]);
  assert.deepEqual(lib.describeShift(rows[1]), { state: "On shift · 15 h 0 min", tag: "Long shift" });
  assert.deepEqual(lib.describeShift(rows[0]), { state: "Meal break · 5 min", tag: "Long shift" });
  assert.deepEqual(lib.describeShift(rows[3]), { state: "Short break 1 · 9 min", tag: "Break" });
  assert.deepEqual(lib.describeShift(rows[4]), { state: "On shift · 1 h 0 min", tag: null });
  assert.equal(lib.formatDuration(30), "under 1 min");
  assert.equal(lib.formatDuration(13 * 3600 + 10 * 60 + 59), "13 h 10 min");
  assert.equal(lib.LONG_SHIFT_SECONDS, 14 * 3600);
  assert.ok(!lib.attentionOrder({ serverNow: new Date(now).toISOString(), counts: {}, activeShifts: [shift("almost", 13.99)] })[0].isLong, "Under 14 hours is not a long shift");
  pass("On the clock now lists long shifts first, then breaks, then everyone else, with the status in words");

  // 8. Data sources and refresh.
  const reviewList = (source, name) => source.slice(source.indexOf(name)).match(/\[([^\]]*)\]/)[1].match(/"[^"]+"/g);
  assert.deepEqual(reviewList(page, "CORRECTION_REVIEW_PERMISSIONS = "), reviewList(provider, "reviewPermissions = "), "The corrections row uses the sidebar badge's permission list");
  assert.ok(page.includes("useClockReviewCount()"), "The count comes from the same provider as the sidebar badge");
  assert.ok(page.includes('"/api/clock/overview"') && /\[\s*403,\s*404,\s*\]\.includes\(\s*error\.status\s*\)/.test(page), "Attendance uses the scoped overview; 403 or 404 hides the card");
  assert.ok(/ATTENDANCE_REFRESH_MS =\s*60_000;/.test(page) && page.includes('document.visibilityState ===\n            "visible"') && page.includes("attendanceRequest.current?.abort();"), "Refreshes every minute while visible and cancels on leave");
  assert.ok(/const LONG_SHIFT_MS = 14 \* 3600_000;/.test(overview) && /longShifts,\n      \},/.test(overview) && overview.includes("openStaffShift, { startedAt: { lte: new Date(now.getTime() - LONG_SHIFT_MS) } }"), "The backend counts long shifts across the viewer's whole roster");
  pass("Corrections reuse the sidebar badge count; attendance uses the scoped overview, refreshes each minute and counts long shifts server-side");

  // 9. Styles: readable sizes, phone layout, emphasis without colour.
  const block = css.slice(css.indexOf("DASHBOARD — ATTENTION FIRST"));
  for (const [, size] of block.matchAll(/font-size: (\d+(?:\.\d+)?)px/g)) assert.ok(Number(size) >= 11, `No text under 11px (found ${size}px)`);
  assert.ok(/repeat\(auto-fit, minmax\(min\(100%, 400px\), 1fr\)\)/.test(block), "Two cards side by side when each can be 400px wide; stacked below that; one card alone takes the full width");
  assert.ok(/\.agency-clock-counts dt \{[^}]*font-size: 13px;/.test(block) && !/\.agency-clock-counts dt \{[^}]*uppercase/.test(block), "Count labels are plain 13px words, so they don't wrap in a third of the card");
  assert.ok(/\.agency-clock-row:nth-child\(n \+ 4\) \{\s*display: none;/.test(block), "Phones list 3 people on the clock");
  assert.ok(/\.agency-clock-tag\.long \{[^}]*border: 2px solid #FFFFFF;/.test(block), "Long shifts get the heavier white border, with the words Long shift");
  assert.ok(!/#[0-9A-F]{6}/gi.test(block.replace(/#(?:FFFFFF|CCCCCC|999999|8E8E8E|666666)/gi, "")), "Only approved monochrome tokens");
  pass("Attention styles: 11px minimum, side by side on desktop and stacked on phones, monochrome emphasis");

  console.log(`${passed} Dashboard attention groups passed.`);
} finally {
  for (const { vite } of servers.values()) await vite.close();
  delete globalThis.__dashboardAuth;
}
