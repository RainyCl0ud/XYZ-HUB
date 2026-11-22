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
const inRouter = (element) => renderToStaticMarkup(createElement(MemoryRouter, null, element));
async function render(access, clockEnabled = true) {
  const { page: Dashboard } = await load(clockEnabled);
  globalThis.__dashboardAuth = { user: { id: "fictional-user" }, access };
  return inRouter(createElement(Dashboard));
}
const top = (html) => html.slice(0, html.indexOf('class="agency-dashboard-grid"'));
const linkTo = (html, href, text) => new RegExp(`<a[^>]*href="${href.replace(/[?]/g, "\\?")}"[^>]*>(?:(?!</a>).)*${text}`, "s").test(html);

// Default grants (backend/src/permissions/clock-permissions.ts).
const staff = ["clock.access", "clock.self.view", "clock.self.track", "clock.corrections.request"];
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
  assert.equal((top(owner).match(/<span aria-hidden="true">—<\/span><span class="agency-sr-only">Not loaded<\/span>/g) ?? []).length, 2, "Unloaded counts show — on screen and read as Not loaded; incidents never show a false 0 while loading");
  assert.ok(owner.includes("What needs attention across your people, attendance and quality."), "The intro describes the new Dashboard");
  assert.ok(!top(owner).includes("!"), "No ! markers in the attention cards");
  pass("Owner: Needs attention and On the clock now replace the number cards, above incidents, creators and people");

  // 2. Manager (default grants): team attendance through their own Clock page.
  const manager = await render(account("MANAGER", ["quality.access", ...staff, "clock.alerts.team", "clock.corrections.assigned", "clock.overview.team"]));
  assert.ok(linkTo(manager, "/clock?tab=team", "View attendance") && linkTo(manager, "/clock?tab=team", "Long shifts"), "Managers open the Team tab");
  assert.ok(linkTo(manager, "/clock?tab=review", "Corrections to review"), "Managers who review corrections see the count");
  pass("Manager: attendance links open the Team tab of their Clock page; corrections link to the review tab");

  // 3. QC (default grants include attendance for assigned chatters); a
  // QA-only account sees just the incidents row.
  const qc = await render(account("QC", ["quality.access", ...staff, "clock.overview.chatters"]));
  assert.ok(qc.includes("<h3>On the clock now</h3>") && linkTo(qc, "/clock?tab=team", "Long shifts") && linkTo(qc, "/incidents", "Open QA incidents") && !qc.includes("Corrections to review"), "Default QC: attendance for their chatters and incidents, no corrections");
  const qaOnly = await render(account("QC", ["quality.access", "clock.access", "clock.self.view"]));
  assert.ok(qaOnly.includes("<h3>Needs attention</h3>") && linkTo(qaOnly, "/incidents", "Open QA incidents"), "QA-only keeps the incident count");
  assert.ok(!qaOnly.includes("Corrections to review") && !qaOnly.includes("Long shifts") && !qaOnly.includes("On the clock now"), "No attendance rows without an attendance grant");
  pass("QC: default grants show their chatters' attendance; without an attendance grant only Open QA incidents shows");

  // 4. Chatter (default grants): no attention cards; Your account as before.
  const chatter = await render(account("CHATTER", staff));
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

  const { vite } = await load(true);
  const lib = await vite.ssrLoadModule("/src/lib/dashboard-attention.ts");
  const cards = await vite.ssrLoadModule("/src/components/DashboardAttention.tsx");
  const { ApiError } = await vite.ssrLoadModule("/src/lib/api.ts");
  const now = Date.parse("2026-11-23T19:14:00.000Z");
  const shift = (id, hours, breakMinutes = null, kind = "MEAL") => ({
    id, personName: `Person ${id}`, teamName: "Team A", startedAt: new Date(now - hours * 3600_000).toISOString(),
    elapsedSeconds: hours * 3600, activeBreak: breakMinutes === null ? null : { kind, startedAt: new Date(now - breakMinutes * 60_000).toISOString() },
  });
  const counts = { clockedInStaff: 27, notClockedInStaff: 4, staffOnBreak: 2, longShifts: 2 };
  // The first page holds only newer shifts; the long shifts and one break
  // arrive in attentionShifts, as the backend sends them for a busy roster.
  const data = {
    serverNow: new Date(now).toISOString(), counts,
    activeShifts: [shift("new", 1), shift("break-short", 3, 9, "SHORT_ONE"), shift("old", 5), shift("mid", 2)],
    attentionShifts: [shift("longer", 16, 5), shift("long", 15), shift("break-meal", 4, 22), shift("break-short", 3, 9, "SHORT_ONE")],
  };

  // 7. Row order, durations and words, including shifts past the first page.
  const rows = lib.attentionOrder(data);
  assert.deepEqual(rows.map((r) => r.id), ["longer", "long", "break-meal", "break-short", "new", "old", "mid"], "Long shifts, then breaks, then the rest; no duplicates");
  assert.deepEqual(lib.describeShift(rows[1]), { state: "On shift · 15 h 0 min", tag: "Long shift" });
  assert.deepEqual(lib.describeShift(rows[0]), { state: "Meal break · 5 min", tag: "Long shift" });
  assert.deepEqual(lib.describeShift(rows[3]), { state: "Short break 1 · 9 min", tag: "Break" });
  assert.deepEqual(lib.describeShift(rows[4]), { state: "On shift · 1 h 0 min", tag: null });
  assert.equal(lib.formatDuration(30), "under 1 min");
  assert.equal(lib.formatDuration(13 * 3600 + 10 * 60 + 59), "13 h 10 min");
  assert.ok(!lib.attentionOrder({ serverNow: data.serverNow, counts, activeShifts: [shift("almost", 13.99)] })[0].isLong, "Under 14 hours is not a long shift");
  assert.deepEqual(lib.attentionOrder({ serverNow: data.serverNow, counts, activeShifts: [shift("a", 1)] }).map((r) => r.id), ["a"], "Works with an older backend that sends no attentionShifts");
  pass("On the clock now lists long shifts first (even past the first page), then breaks, then everyone else, in words");

  // 8. The loaded card.
  const clock = (state, href = "/clock") => inRouter(createElement(cards.OnTheClockCard, { state, href, onRetry() {} }));
  const ready = clock({ status: "ready", data, stale: false });
  assert.ok(/<dl class="agency-clock-counts"><div><dt>Clocked in<\/dt><dd>27<\/dd><\/div><div><dt>On break<\/dt><dd>2<\/dd><\/div><div><dt>Not clocked in<\/dt><dd>4<\/dd><\/div><\/dl>/.test(ready), "Counts as a description list");
  const listed = [...ready.matchAll(/<li class="agency-clock-row">(?:(?!<\/li>).)*<\/li>/gs)].map((m) => m[0]);
  assert.equal(listed.length, 5, "Up to 5 people (phones hide all but 3 in CSS)");
  assert.deepEqual(listed.map((li) => li.match(/<strong>([^<]+)<\/strong>/)[1]), ["Person longer", "Person long", "Person break-meal", "Person break-short", "Person new"]);
  assert.ok(listed[1].includes('<span class="agency-clock-tag long">Long shift</span>') && listed[2].includes('<span class="agency-clock-tag">Break</span>') && !listed[4].includes("agency-clock-tag"), "Tags in words; the long-shift tag has its own class");
  assert.ok(!listed.some((li) => li.includes("<a ")) && linkTo(ready, "/clock", "View attendance"), "People rows aren't separate links to the same page; View attendance is the one link");
  assert.ok(!ready.includes("agency-clock-notice") && !ready.includes("!"), "No notice or ! marker when current");
  const stale = clock({ status: "ready", data, stale: true });
  assert.ok(/<div class="agency-clock-notice" role="status"><strong>Couldn&#x27;t refresh\. Showing attendance from 1:14 PM CST\.<\/strong><button type="button" class="text-button">Retry<\/button><\/div>/.test(stale) && stale.includes("<dd>27</dd>"), "A failed refresh says the data is out of date and offers Retry");
  assert.ok(/<div class="agency-clock-notice" role="status"><strong>Attendance couldn&#x27;t load\.<\/strong><button[^>]*>Retry<\/button>/.test(clock({ status: "error" })), "A failed first load says so and offers Retry");
  assert.ok(clock({ status: "ready", data: { serverNow: data.serverNow, counts, activeShifts: [] }, stale: false }).includes("No one is clocked in right now"), "Empty roster");
  assert.ok(!clock({ status: "loading" }, null).includes("View attendance"), "No View attendance link without Clock page access");
  pass("Loaded card: counts list, 5 people in attention order with tags, no per-person links, out-of-date and error notices");

  // 9. Needs attention rows and how counts read.
  const attention = (rowsIn) => inRouter(createElement(cards.NeedsAttentionCard, { rows: rowsIn }));
  const rowHtml = attention([
    { key: "a", label: "Corrections to review", helper: "h", count: 2, href: "/clock?tab=review" },
    { key: "b", label: "Long shifts", helper: "h", count: 0, href: null },
    { key: "c", label: "Open QA incidents", helper: "h", count: null, href: "/incidents" },
  ]);
  assert.equal((rowHtml.match(/<li>/g) ?? []).length, 3, "A real list of rows");
  // Attribute order inside <a> is up to React Router, so match each part.
  const anchor = (href) => rowHtml.match(new RegExp(`<a [^>]*href="${href.replace(/[?]/g, "\\?")}"[^>]*><strong class="agency-attention-count">((?:(?!</strong>).)*)</strong>`)) ?? [""];
  assert.ok(/class="agency-attention-row has-items"/.test(anchor("/clock?tab=review")[0]) && anchor("/clock?tab=review")[1] === "2", "A count above 0 is emphasised");
  assert.ok(/<div class="agency-attention-row"><strong class="agency-attention-count">0<\/strong>/.test(rowHtml), "0 isn't emphasised, and a row without access isn't a link");
  assert.ok(/class="agency-attention-row"/.test(anchor("/incidents")[0]) && anchor("/incidents")[1] === '<span aria-hidden="true">—</span><span class="agency-sr-only">Not loaded</span>', "An unloaded count reads as Not loaded");
  const base = { canReviewCorrections: true, reviewCount: 3, showAttendance: true, attendance: data, attendanceHref: "/clock", canViewQa: true, openIncidents: 7 };
  assert.deepEqual(lib.buildAttentionRows(base).map((r) => [r.key, r.count, r.href]), [["corrections", 3, "/clock?tab=review"], ["long-shifts", 2, "/clock"], ["incidents", 7, "/incidents"]]);
  assert.deepEqual(lib.buildAttentionRows({ ...base, attendance: null, openIncidents: null }).map((r) => r.count), [3, null, null], "— while attendance or the QA summary is missing");
  assert.deepEqual(lib.buildAttentionRows({ ...base, attendance: { ...data, counts: { clockedInStaff: 1, notClockedInStaff: 0, staffOnBreak: 0 } } }).map((r) => r.key), ["corrections", "incidents"], "An older backend without the count hides the Long shifts row");
  assert.deepEqual(lib.buildAttentionRows({ ...base, canReviewCorrections: false, showAttendance: false, canViewQa: false }), []);
  pass("Needs attention: a list of rows, emphasis only above 0, Not loaded instead of a false 0, rows only with permission");

  // 10. Failed requests.
  const readyState = { status: "ready", data, stale: false };
  assert.deepEqual(lib.failedAttendanceState(readyState, new ApiError(403, null, "No access")), { status: "unavailable" }, "403 hides the card");
  assert.deepEqual(lib.failedAttendanceState({ status: "loading" }, new ApiError(404, null, "Clock off")), { status: "unavailable" }, "404 hides the card");
  assert.deepEqual(lib.failedAttendanceState(readyState, new ApiError(500, null, "Server")), { ...readyState, stale: true }, "Other failures keep the snapshot, marked out of date");
  assert.deepEqual(lib.failedAttendanceState({ status: "loading" }, new TypeError("network")), { status: "error" }, "A failed first load is an error");
  pass("403 or 404 hides the card; other failures mark loaded data out of date or show an error");

  // 11. Data sources, refresh and account scope.
  const reviewList = (source, name) => source.slice(source.indexOf(name)).match(/\[([^\]]*)\]/)[1].match(/"[^"]+"/g);
  assert.deepEqual(reviewList(page, "CORRECTION_REVIEW_PERMISSIONS = "), reviewList(provider, "reviewPermissions = "), "The corrections row uses the sidebar badge's permission list");
  assert.ok(page.includes("useClockReviewCount()"), "The count comes from the same provider as the sidebar badge");
  assert.ok(page.includes('"/api/clock/overview"') && page.includes("failedAttendanceState("), "Attendance uses the scoped overview and the failure rules above");
  assert.ok(/ATTENDANCE_REFRESH_MS =\s*60_000;/.test(page) && page.includes('document.visibilityState ===\n            "visible"') && page.includes("attendanceRequest.current?.abort();"), "Refreshes every minute while visible and cancels on leave");
  assert.ok(/storedAttendance\.scope ===\s*attendanceScope/.test(page) && page.includes("...access.permissions") && page.includes("...access.assignedModelIds"), "A snapshot is shown only to the account and access it was loaded for");
  assert.ok(/const LONG_SHIFT_MS = 14 \* 3600_000;/.test(overview) && overview.includes("openStaffShift, { startedAt: { lte: longShiftStart } }") && /attentionShifts: \[\.\.\.new Map\(/.test(overview), "The backend counts and lists long shifts across the viewer's whole roster");
  pass("Corrections reuse the sidebar badge count; attendance refreshes each minute, per account, from the scoped overview");

  // 12. Styles: readable sizes, layout, emphasis without colour.
  const block = css.slice(css.indexOf("DASHBOARD — ATTENTION FIRST"));
  for (const [, selector, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body) && /font-weight: 700;/.test(body) && /letter-spacing:/.test(body), `11px only for uppercase bold spaced labels (${selector.trim()})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${selector.trim()}: ${size[1]}px)`);
  }
  const colours = [...block.matchAll(/(?:color|background|border(?:-[a-z]+)?):\s*([^;]+);/g)].map((m) => m[1]);
  for (const value of colours) {
    for (const hex of value.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#666666"].includes(hex.toUpperCase()), `Approved token only (${hex})`);
    assert.ok(!/\b(?:rgba?|hsla?)\(|\b(?:red|green|blue|gold|orange|yellow)\b/i.test(value), `Monochrome only (${value})`);
  }
  assert.ok(/repeat\(auto-fit, minmax\(min\(100%, 400px\), 1fr\)\)/.test(block), "Two cards side by side when each can be 400px wide; stacked below that; one card alone takes the full width");
  assert.ok(/\.agency-clock-counts dt \{[^}]*font-size: 13px;/.test(block) && !/\.agency-clock-counts dt \{[^}]*uppercase/.test(block), "Count labels are plain 13px words, so they don't wrap in a third of the card");
  assert.ok(/\.agency-clock-row:nth-child\(n \+ 4\) \{\s*display: none;/.test(block), "Phones list 3 people on the clock");
  assert.ok(/\.agency-clock-tag\.long \{[^}]*border: 2px solid #FFFFFF;/.test(block) && /\.agency-clock-notice \{[^}]*border: 2px solid #FFFFFF;/.test(block), "Long shifts and notices get the heavier white border");
  pass("Attention styles: 11px only for uppercase labels, 13px otherwise, monochrome tokens, side by side or stacked");

  console.log(`${passed} Dashboard attention groups passed.`);
} finally {
  for (const { vite } of servers.values()) await vite.close();
  delete globalThis.__dashboardAuth;
}
