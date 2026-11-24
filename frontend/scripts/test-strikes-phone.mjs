import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, "src", path), "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("pages/StrikesPage.tsx");
const css = read("pages/StrikesPage.css");

// The signed-in account, toasts and the screen width come from stubs, so
// the page renders with a fictional account and no session or API.
const stubs = {
  "/src/auth/AuthContext.tsx": "export const useAuth = () => globalThis.__account;\nexport const AuthProvider = ({ children }) => children;",
  "/src/components/ToastProvider.tsx": "export const useToast = () => ({ success() {}, error() {} });\nexport default ({ children }) => children;",
  "/src/lib/useMediaQuery.ts": 'export const PHONE_QUERY = "(max-width: 720px)";\nexport const useMediaQuery = () => globalThis.__isPhone;',
};
const vite = await createServer({
  root, configFile: false, envDir: false,
  plugins: [{
    name: "strikes-stubs",
    enforce: "pre",
    load(id) {
      const path = id.replace(/\\/g, "/");
      const key = Object.keys(stubs).find((suffix) => path.endsWith(suffix));
      return key ? stubs[key] : undefined;
    },
  }],
  optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
});

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

try {
  const { StrikePhoneList, StrikePhoneScreen } = await vite.ssrLoadModule("/src/components/StrikePhoneViews.tsx");
  const StrikesPage = (await vite.ssrLoadModule("/src/pages/StrikesPage.tsx")).default;

  const strike = (overrides) => ({
    id: "fictional-1", status: "ACTIVE", userNameSnapshot: "Quinn Harper", userEmailSnapshot: "quinn.harper@example.test",
    reasonNameSnapshot: "Missed shift handover", reasonDescriptionSnapshot: null, details: "Fictional details.", evidenceUrl: null,
    issuedAt: "2026-11-23T15:00:00.000Z", expiresAt: "2026-12-14T15:00:00.000Z", issuedByNameSnapshot: "Fictional Manager",
    ladderVersion: 1, activeStrikeCountAfterIssue: 2, standingLabelSnapshot: "Final warning", deductionPercentSnapshot: 10,
    voidedAt: null, voidedByNameSnapshot: null, voidReason: null, ...overrides,
  });

  // 1. One quiet row per strike.
  const rows = [strike({}), strike({ id: "fictional-2", status: "VOIDED", userNameSnapshot: "Yara Finch" }), strike({ id: "fictional-3", status: "EXPIRED" })];
  const list = renderToStaticMarkup(createElement(StrikePhoneList, { strikes: rows, onOpen() {} }));
  assert.ok(list.startsWith('<ul class="strike-phone-list"><li><button type="button" class="strike-phone-row" data-strike-id="fictional-1">'), "Strikes are a list of buttons that remember their strike");
  const [first, second, third] = list.split("</li>");
  assert.equal(text(first), "Quinn Harper Missed shift handover · Nov 23 Active", "Name, then reason · date, then the status; screen readers hear the words apart");
  assert.ok(second.includes('class="strike-phone-row strike-phone-row-voided"') && second.includes('class="strike-status strike-status-voided strike-phone-tag">Voided<') && third.includes(">Expired<"), "Voided rows are dimmed; each status has its tag");
  assert.ok(!list.includes("Final warning") && !list.includes("deduction") && !list.includes("View"), "Standing, deduction and View buttons stay out of the list");
  const opened = [];
  const tree = StrikePhoneList({ strikes: rows, onOpen: (row) => opened.push(row.id) });
  for (const item of tree.props.children) item.props.children.props.onClick();
  assert.deepEqual(opened, ["fictional-1", "fictional-2", "fictional-3"], "Tapping a row opens that strike");
  pass("Phone rows: name, reason · date and status, each opening the strike");

  // 2. The strike screen.
  const screen = (props, over = {}) => renderToStaticMarkup(createElement(StrikePhoneScreen, { strike: strike(over), onBack() {}, ...props }));
  const full = screen({ onEmployeeStrikes() {}, onVoid() {} }, { evidenceUrl: "https://example.test/fictional", reasonDescriptionSnapshot: "Fictional reason." });
  assert.ok(full.includes('<div class="strike-phone-screen" role="dialog" aria-modal="true" aria-labelledby="strike-phone-screen-title">') && full.includes('<h3 id="strike-phone-screen-title">Quinn Harper</h3>'), "A dialog named by the person");
  const order = ['aria-label="Back to strikes"', '<span class="strike-phone-screen-kicker">Strike</span>', ">Active</span>", '<p class="strike-phone-email">quinn.harper@example.test</p>', "<dt>Reason</dt><dd>Missed shift handover</dd>", "<dt>Standing</dt><dd>Final warning</dd>", "<dt>Deduction</dt><dd>10% deduction</dd>", "<dt>Strike</dt><dd>#2 at issue</dd>", "<dt>Issued</dt>", "<dt>Issued by</dt><dd>Fictional Manager</dd>", "<dt>Expires</dt>", "<dt>Ladder</dt><dd>v1</dd>", "<h4>Details</h4><p>Fictional details.</p>", "<h4>Reason at issue</h4>", 'href="https://example.test/fictional"', "All strikes for Quinn Harper", 'class="strike-phone-void-link">Void this strike</button>'].map((needle) => {
    const at = full.indexOf(needle);
    assert.ok(at >= 0, `${needle} renders`);
    return at;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Back and status in the bar; person; facts; details; evidence; all strikes; Void last");
  const viewer = screen({});
  assert.ok(!viewer.includes("Void this strike") && !viewer.includes("All strikes for") && viewer.includes("<dt>Deduction</dt><dd>10% deduction</dd>"), "Without permission (or a current account) there is no Void and no all-strikes row");
  const voided = screen({ onEmployeeStrikes() {} }, { status: "VOIDED", deductionPercentSnapshot: 0, voidedAt: "2026-11-24T15:00:00.000Z", voidedByNameSnapshot: "Fictional Owner", voidReason: "Fictional void reason." });
  assert.ok(voided.includes("<dt>Deduction</dt><dd>No deduction</dd>") && voided.includes('<section class="strike-phone-section strike-phone-void"><h4>Voided</h4>') && voided.includes("by Fictional Owner") && voided.includes("<p>Fictional void reason.</p>") && voided.includes(">Voided</span>"), "A voided strike shows when, by whom and why");
  pass("Strike screen: status in the bar, the facts, details, all strikes, and Void as a link at the bottom");

  // 3. The page on a phone and on a desktop (a server render shows loading).
  const render = (isPhone, permissions) => {
    globalThis.__isPhone = isPhone;
    globalThis.__account = { access: { roles: [{ systemKey: "MANAGER" }], permissions, canSeeAllModels: true } };
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/strikes"] }, createElement(StrikesPage)));
  };
  const manage = ["strikes.access", "strikes.view", "strikes.issue", "strikes.void", "strikes.reasons.view", "strikes.ladder.view"];
  const phone = render(true, manage);
  assert.ok(phone.startsWith('<div class="page strikes-page strikes-page-phone"><h2 class="strikes-sr-only">Strike Management</h2>'), "Phones: the heading is for screen readers only");
  assert.ok(/<div class="strikes-phone-search-row"><input type="search" class="search-input strikes-search" placeholder="Search strikes" aria-label="Search Strikes"[^>]*\/><div class="phone-action-menu"><button type="button" class="phone-action-menu-button" aria-label="More strike actions" aria-expanded="false">/.test(phone), "Search with a short placeholder, then the ⋯ menu");
  assert.ok(/<div class="filter-group strikes-phone-tabs">(<button type="button" class="filter-button( active)?" aria-pressed="(true|false)"><span class="strikes-phone-tab-count">0<\/span> <span class="strikes-phone-tab-label">(All|Active|Expired|Voided)<\/span><\/button>){4}<\/div>/.test(phone), "Four status tabs carry the counts, and say which is chosen");
  for (const removed of ["page-eyebrow", "Disciplinary management", "page-description", "stat-card", "strikes-summary-grid", "Filter by employee", "Filter by reason", "Filter by Strike status", ">Issue Strike<", ">Reasons<", "Strike Ladder settings", "strikes-table"]) {
    assert.ok(!phone.includes(removed), `Phones don't show ${removed}`);
  }
  const desktop = render(false, manage);
  for (const kept of ['<div class="page strikes-page"><header class="page-header strikes-page-header">', "Disciplinary management", ">Issue Strike</button>", ">Reasons</button>", 'aria-label="Strike Ladder settings"', '<section class="strikes-summary-grid">', "Total records", '<section class="content-card strikes-content-card"><div class="strikes-toolbar"><input type="search" class="search-input strikes-search" placeholder="Search employee, reason, issuer, or details"', 'aria-label="Filter by employee"', 'aria-label="Filter by Strike status"']) {
    assert.ok(desktop.includes(kept), `Desktop keeps ${kept}`);
  }
  assert.ok(!desktop.includes("strikes-phone") && !desktop.includes("strike-phone") && !desktop.includes("phone-action-menu") && !desktop.includes("inert"), "Desktop doesn't use the phone layout");
  const viewOnlyPhone = render(true, ["strikes.access", "strikes.view"]);
  assert.ok(!viewOnlyPhone.includes("phone-action-menu") && /<div class="strikes-phone-search-row"><input [^>]*\/><\/div>/.test(viewOnlyPhone), "Someone who can only view gets no ⋯ menu; search fills the line");
  pass("Phones: search and ⋯, tabs with counts, then the strikes; desktop keeps its header, cards, filters and table");

  // 4. The page's code.
  assert.equal((page.match(/^ {2}return \(/gm) ?? []).length, 1, "One return for both layouts");
  assert.ok(/const phoneMenuItems = \[\s*\.\.\.\(capabilities\.canIssueStrikes[\s\S]*?label: "Issue strike",[\s\S]*?void openIssueModal\(\);[\s\S]*?\.\.\.\(capabilities\.canViewStrikeReasons[\s\S]*?label: "Strike reasons",[\s\S]*?"\/strikes\/reasons"[\s\S]*?\.\.\.\(capabilities\.canViewStrikeLadder[\s\S]*?label: "Strike ladder",[\s\S]*?"\/strikes\/settings"/.test(page), "Each menu action appears only with the permission its desktop button needs");
  assert.ok(/const statusCounts = \{\s*ALL: searchMatchedStrikes\.length,\s*ACTIVE: countStatus\("ACTIVE"\),\s*EXPIRED: countStatus\("EXPIRED"\),\s*VOIDED: countStatus\("VOIDED"\),\s*\};/.test(page) && /searchMatchedStrikes\.filter\(\s*\(strike\) =>\s*strike\.status === status\s*\)\.length/.test(page), "The tab counts follow the search, so a tab never promises strikes the list can't show");
  assert.ok(/return strikes\.filter\(\s*\(\s*strike\s*\) =>\s*strikeMatchesSearch\(\s*strike,\s*query\s*\)\s*\);/.test(page) && (page.match(/strikeMatchesSearch\(/g) ?? []).length === 3, "The list and the counts use one search function (defined once, used twice)");
  assert.ok(/\{activeCount\}/.test(page) && /\{strikes\.length\}/.test(page), "Desktop cards keep their unfiltered totals");
  assert.ok(page.includes(") : isPhone ? (\n          <StrikePhoneList\n            strikes={paginatedStrikes}"), "Phones list the same page of strikes as the table");
  assert.ok(/onVoid=\{\s*capabilities\.canVoidStrikes &&\s*selectedStrike\.status !==\s*"VOIDED" &&\s*\(\s*selectedStrike\.currentUser !==\s*null \|\|\s*capabilities\.isOwner\s*\)\s*\?\s*\(\) =>\s*openVoidModal\(\s*selectedStrike,\s*true\s*\)/.test(page), "Void appears under the same conditions as on desktop, and opens the same void form over the strike's screen");
  assert.ok(/if \(\s*!keepStrikeOpen\s*\) \{\s*setSelectedStrike\(\s*null\s*\);\s*\}/.test(page) && /keepStrikeOpen =\s*false/.test(page), "Desktop still closes its details window before the void form; phones keep the screen");
  assert.ok(/openStrikeFromHandoff =\s*useEffectEvent\([\s\S]{0,200}?phoneReturnFocusId\.current =\s*strike\.id;/.test(page), "A strike opened from a link (?strikeId=) also returns focus to its row");
  assert.ok(/label: "Issue strike",\s*onSelect: \(\) => \{[\s\S]{0,160}?phoneReturnFocusId\.current =\s*"issue";\s*void openIssueModal\(\);/.test(page), "After Issue strike closes, focus returns to ⋯");
  assert.ok(read("lib/useMediaQuery.ts").includes('export const PHONE_QUERY = "(max-width: 720px)";') && css.includes("@media (max-width: 720px) {"), "The layout switch and the phone styles use the same 720px breakpoint");
  assert.ok(/onEmployeeStrikes=\{\s*selectedStrike\.currentUser &&\s*capabilities\.canViewPeopleProfiles\s*\?/.test(page), "All strikes for the person needs their current account and People access, as on desktop");
  assert.ok(page.includes("{selectedStrike && isPhone && (") && page.includes("{selectedStrike && !isPhone && ("), "The same selected strike shows as a screen on phones and the window on desktop");
  assert.ok(/!isPhone &&\s*employeeFilter !==/.test(page) && /!isPhone &&\s*reasonFilter !==/.test(page), "Hidden Employee and Reason filters don't apply on phones");
  const focusEffect = page.slice(page.indexOf("  // Focus goes to Back when the strike screen opens"), page.indexOf("  // Escape closes the strike screen"));
  assert.ok(/useEffect\(\(\) => \{\s*if \(anotherWindowOpen\) \{\s*return;\s*\}\s*if \(phoneStrikeOpenId\) \{\s*phoneBackRef\.current\?\.focus\(\);\s*return;\s*\}/.test(focusEffect) && focusEffect.includes("candidate.dataset.strikeId === id") && /\}, \[\s*phoneStrikeOpenId,\s*anotherWindowOpen,\s*\]\);/.test(focusEffect), "Focus: Back while the screen is open (never taken from the void or issue form), then the strike's row");
  assert.ok(/const anotherWindowOpen =\s*Boolean\(voidTarget\) \|\|\s*issueOpen;/.test(page), "The void and issue forms count as windows over the screen");
  assert.ok(/if \(\s*!phoneStrikeOpenId \|\|\s*anotherWindowOpen\s*\) \{\s*return;\s*\}[\s\S]*?if \(event\.key === "Escape"\) \{\s*setSelectedStrike\(null\);/.test(page), "Escape closes the strike screen, but not while a form is open over it");
  assert.ok(page.includes('className={isPhone ? "strikes-phone-records" : "content-card strikes-content-card"}\n        inert={phoneStrikeOpenId ? true : undefined}'), "While a strike's screen is open, the list behind it is inert");
  assert.ok(/if \(menuLayoutIsPhone !== isPhone\) \{\s*setMenuLayoutIsPhone\(isPhone\);\s*setPhoneMenuOpen\(false\);/.test(page), "Crossing 720px closes the ⋯ menu");
  assert.ok(page.includes("strike.id;\n              setPhoneMenuOpen(false);\n              setSelectedStrike("), "Opening a strike closes the menu");
  assert.ok(/\(!isPhone \|\|\s*strikePageCount > 1\)/.test(page), "Phones hide the pager when there is one page");
  assert.ok(!/function getStatusLabel|function getStatusClass|type StrikeStatus =/.test(page) && read("lib/strike-status.ts").includes("export function strikeStatusLabel"), "Status names and classes come from one place");
  pass("One layout: permissions match desktop, the tab counts match the cards, focus and Escape behave");

  // 5. Styles.
  const ours = css.slice(css.indexOf("STRIKE MANAGEMENT ON PHONES (24 Nov 2026)"));
  const mediaStart = ours.indexOf("@media (max-width: 720px) {");
  let depth = 0, mediaEnd = -1;
  for (let i = mediaStart; i < ours.length; i += 1) {
    if (ours[i] === "{") depth += 1;
    if (ours[i] === "}" && --depth === 0) { mediaEnd = i; break; }
  }
  const phoneCss = ours.slice(mediaStart, mediaEnd + 1);
  const outside = (ours.slice(0, mediaStart) + ours.slice(mediaEnd + 1)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^*]*\*\//, "");
  assert.deepEqual([...outside.matchAll(/([^{}]+)\{/g)].map(([, s]) => s.trim()), [".strikes-sr-only"], "Everything but the screen-reader class applies only at 720px and below");
  const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const rule = (selector) => {
    const bodies = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, list]) => squash(list).split(",").map((s) => s.trim()).includes(selector)).map(([, , body]) => body);
    assert.ok(bodies.length, `${selector} has a rule`);
    return bodies.join("\n");
  };
  for (const [, selector, body] of ours.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${squash(selector)})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${squash(selector)}: ${size[1]}px)`);
  }
  for (const hex of ours.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#000000", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#666666", "#333333"].includes(hex.toUpperCase()), `Monochrome token only (${hex})`);
  assert.ok(!/box-shadow|gradient/.test(ours), "No shadows or gradients");
  for (const selector of [".strikes-page-phone .strike-phone-row", ".strikes-page-phone .strikes-phone-tabs .filter-button", ".strikes-page-phone .strike-phone-employee", ".strikes-page-phone .strike-phone-void-link", ".strikes-page-phone .strike-phone-evidence", ".strikes-page-phone .strikes-pagination .secondary-button", ".strikes-page-phone .strikes-modal-footer > button"]) {
    assert.ok(/min-height: (44|52|56)px;/.test(rule(selector)), `44px tap height or more (${selector})`);
  }
  for (const selector of [".strikes-page-phone .strike-phone-back", ".strikes-page-phone .strikes-close"]) {
    assert.ok(/width: 44px;/.test(rule(selector)) && /height: 44px;/.test(rule(selector)), `44 × 44px (${selector})`);
  }
  assert.ok(/font-size: 16px !important;/.test(rule(".strikes-page-phone .strikes-phone-search-row .search-input")) && /font-size: 16px !important;/.test(rule(".strikes-page-phone .strikes-modal .form-field input")), "Fields are 16px so iPhones don't zoom");
  assert.ok(/inset: 0 0 var\(--portal-footer-height, 0px\) 0;/.test(rule(".strikes-page-phone .strikes-overlay")), "The strike screen and forms stop above the fixed footer");
  // Older Strikes rules size these in rem (under 13px); the phone block must override each.
  for (const [selector, check] of [
    [".strikes-page-phone .strikes-modal .strikes-preview-grid span", /font-size: 11px !important;[\s\S]*text-transform: uppercase;/],
    [".strikes-page-phone .strikes-modal .strikes-detail-grid span", /font-size: 11px !important;[\s\S]*text-transform: uppercase;/],
    [".strikes-page-phone .strikes-modal .strikes-detail-section > span", /font-size: 11px !important;[\s\S]*text-transform: uppercase;/],
    [".strikes-page-phone .strikes-modal .strikes-preview-meta", /font-size: 13px;/],
    [".strikes-page-phone .strikes-modal .strikes-preview-loading", /font-size: 13px;/],
  ]) {
    assert.ok(check.test(rule(selector)), `Phones resize ${selector}`);
  }
  const base = css.slice(0, css.indexOf("STRIKE MANAGEMENT ON PHONES (24 Nov 2026)"));
  for (const cls of [".strikes-preview-grid span", ".strikes-detail-grid span", ".strikes-detail-section > span", ".strikes-preview-meta", ".strikes-preview-loading"]) {
    assert.ok(base.includes(cls), `${cls} still exists in the older rules`);
  }
  assert.ok(/max-height: calc\(100dvh - var\(--portal-footer-height, 0px\) - 16px\);/.test(rule(".strikes-page-phone .strikes-modal")), "Forms fit the space above the footer, so their buttons stay reachable");
  assert.ok(/overflow-wrap: anywhere;/.test(rule(".strikes-page-phone .strikes-modal .strikes-detail-section p")) && /overflow-wrap: anywhere;/.test(rule(".strike-phone-employee > span:first-child")), "Long links and names wrap");
  assert.ok(/position: sticky;/.test(rule(".strike-phone-screen-bar")) && /text-decoration: underline;/.test(rule(".strikes-page-phone .strike-phone-void-link")) && /color: #999999;/.test(rule(".strikes-page-phone .strike-phone-void-link")), "The bar stays at the top; Void is a quiet grey link");
  assert.ok(/text-transform: uppercase;/.test(rule(".strikes-page-phone .strikes-phone-tab-label")) && /font-size: 16px;/.test(rule(".strikes-page-phone .strikes-phone-tab-count")), "Tabs: the count large, the status as a small uppercase label");
  pass("Phone styles: 44px targets, 16px fields, 13px text, monochrome, screens clear of the footer");

  console.log(`${passed} Strike Management phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__account;
  delete globalThis.__isPhone;
}
