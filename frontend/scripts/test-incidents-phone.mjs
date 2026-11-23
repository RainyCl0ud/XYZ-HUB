import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, "src", path), "utf8").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("pages/IncidentsPage.tsx");
const views = read("components/IncidentPhoneViews.tsx");
const css = read("pages/IncidentsPage.css");

// The signed-in account, toasts and the screen width come from stubs, so
// the page renders with a fictional QA account and no session or API.
const stubs = {
  "/src/auth/AuthContext.tsx": "export const useAuth = () => globalThis.__account;\nexport const AuthProvider = ({ children }) => children;",
  "/src/components/ToastProvider.tsx": "export const useToast = () => ({ success() {}, error() {} });\nexport default ({ children }) => children;",
  "/src/lib/useMediaQuery.ts": 'export const PHONE_QUERY = "(max-width: 720px)";\nexport const useMediaQuery = () => globalThis.__isPhone;',
};
const stubPlugin = {
  name: "incidents-stubs",
  enforce: "pre",
  load(id) {
    const path = id.replace(/\\/g, "/");
    const key = Object.keys(stubs).find((suffix) => path.endsWith(suffix));
    return key ? stubs[key] : undefined;
  },
};

const vite = await createServer({
  root, configFile: false, envDir: false, plugins: [stubPlugin],
  optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
});

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

try {
  const { IncidentPhoneList, IncidentPhoneDetail } = await vite.ssrLoadModule("/src/components/IncidentPhoneViews.tsx");
  const IncidentsPage = (await vite.ssrLoadModule("/src/pages/IncidentsPage.tsx")).default;

  const incident = (overrides) => ({
    id: "fictional-1",
    status: "OPEN",
    chatter: { name: "Quinn Harper" },
    agencyModel: { name: "Ava Stone" },
    ruleTitleSnapshot: "Replied after the 5-minute window",
    ruleDefinitionSnapshot: "Fictional rule text.",
    severityNameSnapshot: "Major",
    weightNameSnapshot: "Medium",
    occurredAt: "2026-11-22T15:34:00.000Z",
    details: "Fictional details.",
    ruleVersion: { versionNumber: 2 },
    ...overrides,
  });

  // 1. One row per incident.
  const rows = [
    incident({}),
    incident({ id: "fictional-2", status: "RESOLVED", chatter: { name: "Rowan Ellis" }, severityNameSnapshot: null, agencyModel: null }),
    incident({ id: "fictional-3", status: "VOIDED", chatter: { name: "Yara Finch" } }),
  ];
  const list = renderToStaticMarkup(createElement(IncidentPhoneList, { incidents: rows, onOpen() {} }));
  assert.ok(list.startsWith('<ul class="incident-phone-list">'), "Rows are a list");
  assert.equal((list.match(/<li><button type="button" class="incident-phone-row/g) ?? []).length, 3, "Each incident is one button in a list item");
  assert.ok(!list.includes("<table") && !list.includes("aria-label"), "No table; each row is named by its own words");
  const first = list.slice(0, list.indexOf("</li>"));
  const order = ['class="incident-phone-row-name">Quinn Harper<', 'class="incident-status open">Open<', 'class="incident-phone-row-rule">Replied after the 5-minute window<', 'class="incident-phone-row-meta">Ava Stone · Major · Nov 22, 2026, 9:34 AM CST<'].map((needle) => {
    const at = first.indexOf(needle);
    assert.ok(at >= 0, `${needle} renders`);
    return at;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Name and status, then the rule, then model · severity · time");
  assert.equal(text(first), "Quinn Harper Open Replied after the 5-minute window Ava Stone · Major · Nov 22, 2026, 9:34 AM CST", "A screen reader hears the words apart");
  assert.ok(list.includes('class="incident-phone-row-meta">Legacy / unassigned · Nov 22, 2026, 9:34 AM CST<'), "No severity is skipped; no creator reads Legacy / unassigned, as in the table");
  assert.ok(list.includes('class="incident-status resolved">Resolved<') && list.includes('class="incident-phone-row incident-phone-row-voided"') && list.includes('class="incident-status voided">Voided<'), "Resolved and Voided rows are marked");
  assert.ok(!list.includes("!"), "No ! markers");
  pass("Phone rows: chatter and status, the rule, then creator · severity · time, one button per incident");

  // 2. Details on their own screen.
  const detail = renderToStaticMarkup(createElement(IncidentPhoneDetail, {
    incident: incident({ weightNameSnapshot: null }), loading: false, onBack() {}, onOpenQaProfile() {}, evidence: null,
  }, createElement("div", { className: "incident-detail-actions" }, "fictional-actions")));
  assert.ok(detail.startsWith('<div class="incident-phone-detail-bar"><button type="button" class="incident-phone-back" aria-label="Back to incidents">'), "A 44px back button comes first");
  assert.ok(detail.includes('<span class="incident-phone-detail-kicker">Incident</span><span class="incident-status open">Open</span>'), "The bar shows the status");
  const steps = ["<h3>Replied after the 5-minute window</h3>", "<span>Quinn Harper</span>", ">QA profile</button>", "<dt>Model</dt><dd>Ava Stone</dd>", "<dt>Severity</dt><dd>Major</dd>", "<dt>Weight</dt><dd>None</dd>", "<dt>Occurred</dt><dd>Nov 22, 2026, 9:34 AM CST</dd>", "<h4>Details</h4><p>Fictional details.</p>", "<h4>Rule (v2)</h4><p>Fictional rule text.</p>", "<h4>Evidence</h4><p>No link added</p>", "fictional-actions"].map((needle) => {
    const at = detail.indexOf(needle);
    assert.ok(at >= 0, `${needle} renders`);
    return at;
  });
  assert.deepEqual([...steps].sort((a, b) => a - b), steps, "Title, chatter and QA profile, facts, details, rule, evidence, then the actions");
  assert.equal((detail.match(/Quinn Harper/g) ?? []).length, 1, "The chatter's name appears once");
  const linked = renderToStaticMarkup(createElement(IncidentPhoneDetail, { incident: incident({}), loading: false, onBack() {}, onOpenQaProfile() {}, evidence: createElement("a", { href: "https://example.test/fictional" }, "link") }));
  assert.ok(linked.includes('<h4>Evidence</h4><a href="https://example.test/fictional">link</a>') && !linked.includes("No link added"), "An evidence link replaces the fallback");
  const loading = renderToStaticMarkup(createElement(IncidentPhoneDetail, { incident: null, loading: true, onBack() {}, onOpenQaProfile() {}, evidence: null }));
  assert.ok(loading.includes('class="incident-phone-back" disabled="" aria-label="Back to incidents"') && loading.includes("Loading incident...") && !loading.includes("incident-status"), "While loading: Back waits, no status yet");
  pass("Phone details: back, status, title, chatter with QA profile, one list of facts, details, rule, evidence, then actions");

  // 3. The page on a phone and on a desktop (a server render shows loading).
  globalThis.__account = {
    access: { roles: [{ systemKey: "QC" }], permissions: ["quality.access", "quality.incidents.view", "quality.incidents.create", "quality.incidents.resolve", "quality.incidents.void"], canSeeAllModels: true },
  };
  const render = (isPhone) => {
    globalThis.__isPhone = isPhone;
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/incidents"] }, createElement(IncidentsPage)));
  };
  const phone = render(true);
  assert.ok(phone.startsWith('<div class="page incidents-page incidents-page-phone"><header class="incidents-phone-header"><h2 class="incidents-sr-only">Incidents</h2><button class="primary-button" type="button"'), "Phones: an unseen heading for screen readers, then Log Incident");
  for (const removed of ["page-eyebrow", "QA Records", "page-description", "Incident Records", "Review current and historical", "content-card", "Filter by chatter", "Filter by rule"]) {
    assert.ok(!phone.includes(removed), `Phones don't show ${removed}`);
  }
  const searchRow = phone.slice(phone.indexOf('<div class="incidents-phone-search-row">'), phone.indexOf("</div>", phone.indexOf('<div class="incidents-phone-search-row">')));
  assert.ok(/^<div class="incidents-phone-search-row"><input class="search-input" type="search"[^>]*aria-label="Search incidents"[^>]*\/><button type="button" class="secondary-button incidents-phone-filters-button" aria-expanded="false">Filters<\/button>$/.test(searchRow), `Search with a closed Filters button beside it, and no reference to a panel that isn't there: ${searchRow}`);
  assert.ok(/<div class="filter-group">(<button type="button" class="filter-button( active)?">(All|Open|Resolved|Voided)<\/button>){4}<\/div>/.test(phone), "The four status tabs stay");
  assert.ok(phone.indexOf("incidents-phone-toolbar") < phone.indexOf("Loading incidents..."), "Then the list");
  assert.ok(!phone.includes("!"), "No ! markers");
  const desktop = render(false);
  for (const kept of ['<div class="page incidents-page"><header class="page-header">', '<p class="page-eyebrow">QA Records</p>', "Incident Records", '<section class="content-card">', '<div class="incident-toolbar-controls"><input class="search-input"', 'aria-label="Filter by chatter"', 'aria-label="Filter by rule"', '<div class="filter-group">']) {
    assert.ok(desktop.includes(kept), `Desktop keeps ${kept}`);
  }
  assert.ok(!desktop.includes("incidents-phone") && !desktop.includes("incident-phone"), "Desktop doesn't use the phone layout");
  pass("Phones: Log Incident, search with Filters, status tabs, then the list; desktop keeps its header, card and toolbar");

  // 4. The page's code: one layout, shared pieces, filters.
  assert.equal((page.match(/^ {2}return \(/gm) ?? []).length, 1, "One return for both layouts");
  assert.ok(page.includes(") : isPhone ? (\n          <IncidentPhoneList\n            incidents={paginatedIncidents}"), "Phones list the same page of incidents the table shows");
  assert.ok(page.includes("{isPhone ? (\n                <IncidentPhoneDetail\n                  incident={selectedIncident}\n                  loading={detailLoading}\n                  onBack={closeIncidentDetails}"), "Phone details close the same way as the window");
  for (const piece of ["{detailLifecycle}", "{detailActions}", "{searchInput}", "{statusFilterGroup}"]) {
    assert.equal((page.match(new RegExp(piece.replace(/[{}]/g, "\\$&"), "g")) ?? []).length, 2, `${piece} is defined once and placed by each layout`);
  }
  assert.ok(page.includes("{evidenceLink ?? (") && page.includes("evidence={evidenceLink}"), "Both layouts use the same evidence link");
  assert.equal((page.match(/{chatterSelect}/g) ?? []).length, 2, "The chatter filter is the same control in both layouts");
  assert.ok(page.includes("const filterCount =\n    (chatterFilter ? 1 : 0) +\n    (ruleFilter ? 1 : 0);") && page.includes('setChatterFilter("");\n                      setRuleFilter("");'), "Filters counts Chatter and Rule, and Clear filters resets both");
  assert.ok(page.includes('aria-controls={filtersOpen ? "incidents-phone-filters" : undefined}') && page.includes('<span className="incidents-sr-only">, {filterCount} set</span>'), "The Filters button names its panel only while open and says how many are set");
  assert.ok(!/function getStatusClass|function formatStatus/.test(page) && read("lib/incident-status.ts").includes("export function incidentStatusClass") && page.includes("incidentStatusLabel("), "Status names and classes come from one place");
  assert.ok(page.includes('className="modal-backdrop incident-detail-backdrop"') && page.includes('import "./IncidentsPage.css";'), "The details window can fill a phone screen");
  pass("One layout: rows, details, filters and actions are shared, so desktop and phone stay in step");

  // 5. Styles.
  const phoneCss = css.slice(css.indexOf("@media (max-width: 720px) {"));
  assert.ok(css.indexOf("@media (max-width: 720px) {") > css.indexOf(".incidents-sr-only {") && !css.slice(0, css.indexOf("@media")).includes(".incident-phone") && !css.slice(0, css.indexOf("@media")).includes(".incidents-page-phone"), "Everything but the screen-reader class applies only at 720px and below");
  // Every phone rule that names the selector (alone or in a list), joined.
  const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const rule = (selector) => {
    const wanted = squash(selector);
    const bodies = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, list]) => squash(list) === wanted || squash(list).split(",").map((s) => s.trim()).includes(wanted))
      .map(([, , body]) => body);
    assert.ok(bodies.length, `${selector} has a rule`);
    return bodies.join("\n");
  };
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${selector.trim()})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${selector.trim()}: ${size[1]}px)`);
  }
  for (const hex of css.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#000000", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#666666", "#333333"].includes(hex.toUpperCase()), `Monochrome token only (${hex})`);
  assert.ok(!/box-shadow|gradient/.test(css), "No shadows or gradients");
  for (const selector of [".incidents-phone-header .primary-button", ".incidents-page-phone .incidents-phone-search-row .search-input", ".incidents-phone-filters-button", ".incidents-page-phone .incidents-phone-filters .toolbar-select", ".incidents-phone-clear", ".incidents-page-phone .incidents-phone-toolbar .filter-button", ".incidents-page-phone .incident-pagination .secondary-button", ".incidents-page-phone .incident-phone-link", ".incidents-page-phone .incident-phone-section .incident-evidence-link", ".incidents-page-phone .incident-phone-detail .incident-detail-actions > button"]) {
    assert.ok(/min-height: (44|56)px;/.test(rule(selector)), `44px tap height (${selector})`);
  }
  assert.ok(/width: 44px;/.test(rule(".incident-phone-back")) && /height: 44px;/.test(rule(".incident-phone-back")) && /width: 44px;/.test(rule(".incidents-page-phone .modal-close")) && /height: 44px;/.test(rule(".incidents-page-phone .modal-close")), "Back and close are 44 × 44px");
  assert.ok(/min-height: 56px;/.test(rule(".incident-phone-row")) && /outline: 2px solid #FFFFFF;/.test(rule(".incident-phone-row:focus-visible")), "Rows are at least 56px with a 2px white focus outline");
  assert.ok(/font-size: 16px !important;/.test(rule(".incidents-page-phone .incidents-phone-search-row .search-input")) && /font-size: 16px !important;/.test(rule(".incidents-page-phone .incidents-phone-filters .toolbar-select")) && /font-size: 16px !important;/.test(rule(".incidents-page-phone .modal .form-field input,\n  .incidents-page-phone .modal .form-field select,\n  .incidents-page-phone .modal .form-field textarea")), "Fields are 16px so iPhones don't zoom on focus");
  assert.ok(/grid-template-columns: minmax\(0, 1fr\);/.test(rule(".incidents-phone-toolbar")) && /grid-template-columns: minmax\(0, 1fr\);/.test(rule(".incident-phone-detail")), "The toolbar and details shrink to a 320px screen");
  const sheet = rule(".incidents-page-phone .incident-detail-backdrop > .incident-detail-modal-card");
  assert.ok(/padding: 0;/.test(rule(".incidents-page-phone .incident-detail-backdrop")) && /height: 100%;/.test(sheet) && /max-width: none;/.test(sheet) && /max-height: none;/.test(sheet), "Details fill the screen above the footer");
  assert.ok(/position: sticky;/.test(rule(".incident-phone-detail-bar")), "The back bar stays at the top while scrolling");
  assert.ok(/flex-basis: 100%;/.test(rule(".incidents-page-phone .incident-phone-detail .incident-detail-actions > .primary-button")) && /flex: 1 1 120px;/.test(rule(".incidents-page-phone .incident-phone-detail .incident-detail-actions > button")), "The main action is full width; Resolve and Void share a row");
  assert.ok(/border-color: #FFFFFF;/.test(rule(".incidents-page-phone .incident-status.open")) && /border-color: #333333;/.test(rule(".incidents-page-phone .incident-status.voided")), "Open stands out, Voided is dim");
  pass("Phone styles: 44px targets, 16px fields, 13px text, monochrome, full-screen details that fit 320px");

  console.log(`${passed} Incidents phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__account;
  delete globalThis.__isPhone;
}
