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

const page = read("pages/ModelsPage.tsx");
const css = read("pages/ModelsPage.css");

// The account, permissions, toasts and the screen width come from stubs, so
// the page renders with fictional data and no session or API.
const stubs = {
  "/src/auth/AuthContext.tsx": "export const useAuth = () => ({ access: null });\nexport const AuthProvider = ({ children }) => children;",
  "/src/auth/portalAccess.ts": "export const getPortalCapabilities = () => globalThis.__caps;",
  "/src/components/ToastProvider.tsx": "export const useToast = () => ({ success() {}, error() {}, warning() {} });\nexport default ({ children }) => children;",
  "/src/lib/useMediaQuery.ts": 'export const PHONE_QUERY = "(max-width: 720px)";\nexport const useMediaQuery = () => globalThis.__isPhone;',
};
const vite = await createServer({
  root, configFile: false, envDir: false,
  plugins: [{
    name: "creator-stubs",
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

// Walks a hook-free component's element tree (host elements and fragments).
const findAll = (node, test, found = []) => {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, test, found);
    return found;
  }
  if (test(node)) found.push(node);
  return findAll(node.props?.children, test, found);
};

const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + 1);
  assert.ok(from >= 0 && to > from, `Found the code between ${start} and ${end}`);
  return source.slice(from, to);
};

const creator = (overrides) => ({
  id: "fictional-1",
  name: "Lena Park",
  isActive: true,
  createdAt: "2026-11-22T15:34:00.000Z",
  updatedAt: "2026-11-25T16:12:00.000Z",
  peopleCount: 4,
  incidentCount: 4,
  hasLinkedAccount: false,
  creatorAccount: null,
  ...overrides,
});

try {
  const { CreatorPhoneList, CreatorPhoneScreen } = await vite.ssrLoadModule("/src/components/CreatorPhoneViews.tsx");
  const ModelsPage = (await vite.ssrLoadModule("/src/pages/ModelsPage.tsx")).default;

  // 1. One row per creator.
  const creators = [
    creator({ id: "fictional-1", name: "Ava Stone", peopleCount: 3, incidentCount: 5, creatorAccount: { id: "a1", name: "Ava Stone", status: "ACTIVE", hasCreatorRole: true } }),
    creator({ id: "fictional-2", name: "Nora Vale", peopleCount: 1, incidentCount: 1, creatorAccount: { id: "a2", name: "Nora Vale", status: "PENDING_SETUP", hasCreatorRole: true } }),
    creator({ id: "fictional-3", name: "Iris Moreau", isActive: false, peopleCount: 0, incidentCount: 0 }),
    creator({ id: "fictional-4", name: "Mia Lane", hasLinkedAccount: true }),
    creator({ id: "fictional-5", name: "Zoe Hart", creatorAccount: { id: "a5", name: "Zoe Hart", status: "DEACTIVATED", hasCreatorRole: false } }),
  ];
  const list = renderToStaticMarkup(createElement(CreatorPhoneList, { creators, onOpen() {} }));
  assert.ok(list.startsWith('<ul class="creator-phone-list"><li><button type="button" class="creator-phone-row" data-creator-id="fictional-1">'), "A list of row buttons, each naming its creator");
  const rows = list.split("</li>").slice(0, 5);
  assert.equal(text(rows[0]), "Ava Stone 3 people · 5 incidents Account: Ava Stone Active", "Name, people and incidents, the account, then the status; words stay apart for screen readers");
  assert.equal(text(rows[1]), "Nora Vale 1 person · 1 incident Account: Nora Vale · pending setup Active", "One person and one incident are singular; a pending account says so");
  assert.ok(rows[2].includes('class="creator-phone-row is-inactive"') && rows[2].includes('<span class="creator-phone-tag is-inactive">Inactive</span>') && text(rows[2]).includes("No creator account connected"), "Inactive creators are dimmed with an Inactive tag");
  assert.ok(text(rows[3]).includes("Creator account connected"), "A linked account the viewer can't see reads as connected, as on desktop");
  assert.ok(text(rows[4]).includes("Account: Zoe Hart · login deactivated · Creator role removed"), "A deactivated login and a removed Creator role are both noted, as on desktop");
  assert.ok(rows[0].includes('<span class="creator-phone-tag is-active">Active</span><span class="creator-phone-chevron" aria-hidden="true"></span>'), "A chevron shows the row opens");
  const opened = [];
  for (const button of findAll(CreatorPhoneList({ creators, onOpen: (row) => opened.push(row.id) }), (el) => el.type === "button")) button.props.onClick();
  assert.deepEqual(opened, ["fictional-1", "fictional-2", "fictional-3", "fictional-4", "fictional-5"], "Tapping a row opens that creator");
  pass("Rows: name, counts, account and status, each opening the creator");

  // 2. A creator's screen.
  const screen = (props, overrides) => renderToStaticMarkup(createElement(CreatorPhoneScreen, { creator: creator(overrides), covered: false, onBack() {}, ...props }));
  const full = screen({ onRename() {}, onChangeStatus() {} }, {});
  assert.ok(full.startsWith('<div class="creator-phone-screen-backdrop" role="presentation"><div class="creator-phone-screen" role="dialog" aria-modal="true" aria-labelledby="creator-phone-screen-title"><div class="creator-phone-screen-bar"><button type="button" class="creator-phone-back" aria-label="Back to creators">'), "A full screen named by the creator, with Back first");
  assert.ok(full.includes('<span class="creator-phone-screen-kicker">Creator</span><span class="creator-phone-tag is-active">Active</span>') && full.includes('<h3 id="creator-phone-screen-title">Lena Park</h3><p class="creator-phone-account">No creator account connected</p>'), "The bar says Creator and the status; then the name and account");
  assert.equal(text(between(full, '<dl class="creator-phone-tiles">', "</dl>")), "People 4 Incidents 4 Created Nov 22, 2026 9:34 AM CST Updated Nov 25, 2026 10:12 AM CST", "Tiles: people, incidents, and the dates with their times in Central time");
  assert.ok(full.includes('<div class="creator-phone-actions"><button type="button" class="creator-phone-action" data-creator-action="rename">Rename</button><button type="button" class="creator-phone-action is-danger" data-creator-action="status">Deactivate</button></div>'), "One row: Rename, then Deactivate with the heavier outline, and no descriptions");
  const inactive = screen({ onRename() {}, onChangeStatus() {} }, { isActive: false });
  assert.ok(inactive.includes('<h3 id="creator-phone-screen-title" class="is-inactive">') && inactive.includes('<button type="button" class="creator-phone-action" data-creator-action="status">Reactivate</button>') && inactive.includes('creator-phone-tag is-inactive">Inactive<'), "Inactive creators get Reactivate (plain outline) and a dimmed name");
  assert.ok(screen({ onRename() {} }, {}).includes('<div class="creator-phone-actions"><button type="button" class="creator-phone-action" data-creator-action="rename">Rename</button></div>'), "Without status permission, only Rename (it fills the row)");
  assert.ok(screen({ onChangeStatus() {} }, {}).includes('<div class="creator-phone-actions"><button type="button" class="creator-phone-action is-danger" data-creator-action="status">Deactivate</button></div>'), "Without rename permission, only the status button");
  assert.ok(!screen({}, {}).includes("creator-phone-actions"), "With neither permission there is no button row");
  assert.ok(screen({ covered: true }, {}).includes('aria-labelledby="creator-phone-screen-title" inert=""'), "While a window is open over it, the screen can't be reached");
  assert.ok(screen({}, { createdAt: "not a date" }).includes('<dt>Created</dt><dd><span class="creator-phone-tile-value is-date">—</span></dd>'), "A bad date shows a dash");
  const calls = [];
  const tree = CreatorPhoneScreen({ creator: creator({}), covered: false, onBack: () => calls.push("back"), onRename: () => calls.push("rename"), onChangeStatus: () => calls.push("status") });
  for (const button of findAll(tree, (el) => el.type === "button")) button.props.onClick();
  assert.deepEqual(calls, ["back", "rename", "status"], "Back, Rename and the status button each call their handler");
  pass("Creator screen: status in the bar, tiles, and Rename with Deactivate or Reactivate in one row");

  // 3. The page on a phone and on a desktop (a server render shows loading).
  const render = (isPhone, caps = { canCreateModels: true, canEditModels: true, canManageModelStatus: true }) => {
    globalThis.__isPhone = isPhone;
    globalThis.__caps = caps;
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/models"] }, createElement(ModelsPage)));
  };
  const phone = render(true);
  assert.ok(phone.startsWith('<div class="page models-page models-page-phone"><h2 class="models-sr-only">Creator Management</h2><section class="creator-phone-records"><div class="creator-phone-toolbar"><div class="creator-phone-search-row"><input class="search-input" type="search" placeholder="Search creators" aria-label="Search creators" value=""/><button type="button" class="creator-phone-add" aria-label="Add creator">Add</button></div>'), "Phones: no big header; search with Add beside it");
  assert.ok(/<div class="filter-group creator-phone-tabs"><button type="button" class="filter-button active" aria-pressed="true">All <span class="creator-phone-tab-count">0<\/span><\/button><button type="button" class="filter-button" aria-pressed="false">Active <span class="creator-phone-tab-count">0<\/span><\/button><button type="button" class="filter-button" aria-pressed="false">Inactive <span class="creator-phone-tab-count">0<\/span><\/button><\/div>/.test(phone), "Three tabs with counts replace the number cards and filters");
  assert.ok(phone.includes("Loading creators…") && phone.includes('<p class="creator-phone-note">0 user assignments in total. Creators are never deleted; deactivating keeps assignments and history.</p>'), "Loading, then one short note in place of the policy box");
  assert.ok(!phone.includes("models-summary-grid") && !phone.includes("page-header"), "No number cards or big header on phones");
  const phoneBranch = between(page, "{/* Phones: the top bar already says Creators;", '<header className="page-header">');
  assert.ok(!phoneBranch.includes("models-table") && phoneBranch.includes("<CreatorPhoneList"), "Once loaded, phones list creators as rows, never the wide table (read from the code: a server render stays on loading)");
  assert.ok(!render(true, { canCreateModels: false, canEditModels: false, canManageModelStatus: false }).includes("creator-phone-add"), "Without permission to add, there is no Add button");
  const desktop = render(false);
  assert.ok(desktop.startsWith('<div class="page models-page"><header class="page-header">') && !/phone/.test(desktop), "Desktop keeps its header and number cards, with no phone classes");
  pass("Phones: search, Add and tabs with counts; desktop unchanged");

  // 4. The page's code.
  assert.ok(/const phoneWindow =\s*canCreateModels &&\s*createOpen\s*\?\s*"create"\s*:\s*canEditModels &&\s*editModel\s*\?\s*"rename"\s*:\s*canManageModelStatus &&\s*statusModel\s*\?\s*"status"\s*:\s*null;/.test(page) && /\{canCreateModels && createOpen && \(/.test(page) && /\{canEditModels && editModel && \(/.test(page) && /\{canManageModelStatus && statusModel && \(/.test(page), "The open window uses each window's own render condition, so the screen is never inert with nothing over it");
  assert.ok(/onRename=\{\s*canEditModels\s*\?\s*\(\) => \{\s*phoneReturnFocus\.current =\s*'\[data-creator-action="rename"\]';\s*openRename\(\s*phoneCreator\s*\);/.test(page) && /onChangeStatus=\{\s*canManageModelStatus\s*\?\s*\(\) => \{\s*phoneReturnFocus\.current =\s*'\[data-creator-action="status"\]';\s*setStatusModel\(\s*phoneCreator\s*\);/.test(page), "Rename and the status button need desktop's permissions, open desktop's windows, and remember where focus returns");
  assert.ok(/\{canCreateModels && \(\s*<button\s*type="button"\s*className="creator-phone-add"[\s\S]*?phoneReturnFocus\.current =\s*"\.creator-phone-add";\s*setCreateOpen\(\s*true\s*\);/.test(page), "Add opens desktop's Add creator window");
  assert.ok(/const phoneCreator =\s*isPhone &&\s*phoneCreatorId\s*\?\s*models\.find\(/.test(page) && /<section\s*className="creator-phone-records"\s*inert=\{\s*phoneCreator \|\|\s*phoneWindow\s*\?\s*true\s*:\s*undefined\s*\}/.test(page), "The screen shows the loaded creator (so it updates after a rename or status change); the list is inert behind the screen or any window, Add's included");
  assert.ok(/if \(\s*phoneCreatorId &&\s*!loading &&\s*!models\.some\([\s\S]*?\)\s*\) \{\s*setPhoneCreatorId\(\s*null\s*\);\s*\}/.test(page), "If a reload no longer lists the open creator, its screen closes for good instead of reopening later");
  assert.ok(/if \(\s*creatorLayoutIsPhone !==\s*isPhone\s*\) \{\s*setCreatorLayoutIsPhone\(\s*isPhone\s*\);\s*setPhoneCreatorId\(\s*null\s*\);\s*\}/.test(page), "Crossing 720px closes the creator screen so it doesn't reappear later");
  const focus = between(page, "// Phones: focus goes to Back when the creator screen opens", "// Escape closes the creator screen");
  assert.ok(/if \(\s*!isPhone\s*\) \{[\s\S]{0,80}?phoneReturnFocus\.current =\s*null;\s*return;\s*\}/.test(focus) && /"\.models-page-phone \.models-overlay"[\s\S]*?!overlay\.contains\(\s*document\.activeElement\s*\)[\s\S]*?"input, button"/.test(focus) && /phoneBackRef\.current\?\.focus\(\);/.test(focus) && /\[\s*isPhone,\s*phoneCreatorId,\s*phoneWindow,\s*\]/.test(focus), "Phones only: focus moves into a window and to Back when the screen opens; at desktop width the phone focus target is forgotten");
  assert.ok(/document\.querySelector<HTMLElement>\(\s*selector\s*\) \?\?\s*document\.querySelector<HTMLElement>\(\s*"\.creator-phone-add"\s*\) \?\?\s*document\.querySelector<HTMLElement>\(\s*"\.creator-phone-tabs \.filter-button\.active"\s*\)/.test(focus), "Focus returns to what opened it; if that's gone, to Add or the chosen tab, never the search (which raises the keyboard)");
  assert.ok(/if \(\s*!phoneCreator \|\|\s*phoneWindow\s*\) \{\s*return;\s*\}[\s\S]*?event\.key ===\s*"Escape"[\s\S]*?`\[data-creator-id="\$\{creatorId\}"\]`;\s*setPhoneCreatorId\(\s*null\s*\);/.test(page), "Escape closes the screen when no window is over it, returning focus to the creator's row");
  assert.ok(/function closePhoneCreator\(\) \{[\s\S]*?`\[data-creator-id="\$\{phoneCreatorId\}"\]`;[\s\S]*?setPhoneCreatorId\(\s*null\s*\);/.test(page), "Back returns focus to the creator's row");
  assert.ok(/const phoneCounts =[\s\S]*?const matched =\s*models\.filter\([\s\S]*?!query \|\|[\s\S]*?ALL: matched\.length,/.test(page), "Tab counts follow the search");
  assert.equal((page.match(/<div\s*className="models-overlay"\s*role=\{isPhone \? "dialog" : undefined\}\s*aria-modal=\{isPhone \? true : undefined\}/g) ?? []).length, 3, "On phones the Add, Rename and status windows are modal dialogs, set on the overlay rather than the form (desktop markup unchanged)");
  assert.ok(!/<form[^>]*role=/.test(page.replace(/\s+/g, " ")), "No dialog role on a form element");
  for (const id of ["models-create-title", "models-rename-title", "models-status-title"]) {
    assert.ok(page.includes(`aria-labelledby={isPhone ? "${id}" : undefined}`) && page.includes(`<h3 id={isPhone ? "${id}" : undefined}>`), `${id} names its window`);
  }
  pass("Page code: desktop's permissions and windows, focus and Escape on phones, the screen closing at desktop width");

  // 5. Styles.
  const ours = css.slice(css.indexOf("CREATOR MANAGEMENT ON PHONES (25 Nov 2026)"));
  const mediaStart = ours.indexOf("@media (max-width: 720px) {");
  let depth = 0, mediaEnd = -1;
  for (let i = mediaStart; i < ours.length; i += 1) {
    if (ours[i] === "{") depth += 1;
    if (ours[i] === "}" && --depth === 0) { mediaEnd = i; break; }
  }
  assert.ok(mediaStart > 0 && mediaEnd > mediaStart, "The phone styles sit in one 720px block");
  const phoneCss = ours.slice(mediaStart, mediaEnd + 1);
  const outside = (ours.slice(0, mediaStart) + ours.slice(mediaEnd + 1)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^*]*\*\//, "");
  assert.deepEqual([...outside.matchAll(/([^{}]+)\{/g)].map(([, s]) => s.trim()), [], "Nothing applies above 720px, so desktop is unchanged");
  assert.ok(read("lib/useMediaQuery.ts").includes('export const PHONE_QUERY = "(max-width: 720px)";'), "The layout switch and the phone styles use the same 720px breakpoint");
  const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const rule = (selector) => {
    const bodies = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, list]) => squash(list).split(",").map((s) => s.trim()).includes(selector)).map(([, , body]) => body);
    assert.ok(bodies.length, `${selector} has a rule`);
    return bodies.join("\n");
  };
  for (const [, selector, body] of phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${squash(selector)})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${squash(selector)}: ${size[1]}px)`);
  }
  // The design reference's palette (docs/xyz-design-reference.md).
  for (const hex of phoneCss.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#000000", "#0D0D0D", "#141414", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#5C5C5C", "#333333", "#666666"].includes(hex.toUpperCase()), `Only the design reference's greys (${hex})`);
  assert.ok(!/gradient|box-shadow|\b(?:rgba?|hsla?)\(|var\(--(?:accent|danger|success|warning)/.test(phoneCss), "No shadows, gradients, other colour notations or accent colours");
  assert.ok(/border-color: #666666;/.test(rule(".models-page-phone .models-warning-box")) && /background: transparent;/.test(rule(".models-page-phone .models-warning-box")) && /color: #FFFFFF;/.test(rule(".models-page-phone .models-warning-box strong")), "The kept-assignments note turns monochrome on phones");
  for (const selector of [".models-page-phone .creator-phone-search-row .search-input", ".models-page-phone .creator-phone-add", ".models-page-phone .creator-phone-tabs .filter-button", ".models-page-phone .creator-phone-row", ".models-page-phone .creator-phone-action", ".models-page-phone .models-modal-footer button", ".models-page-phone .models-overlay input"]) {
    assert.ok(/min-height: (44|64)px;/.test(rule(selector)), `44px tap height or more (${selector})`);
  }
  for (const selector of [".models-page-phone .creator-phone-back", ".models-page-phone .models-close"]) {
    assert.ok(/width: 44px;/.test(rule(selector)) && /height: 44px;/.test(rule(selector)), `${selector} is 44 × 44px`);
  }
  assert.ok(/font-size: 16px !important;/.test(rule(".models-page-phone .creator-phone-search-row .search-input")) && /font-size: 16px !important;/.test(rule(".models-page-phone .models-overlay input")), "Fields are 16px so iPhones don't zoom");
  assert.ok(/flex: 1 1 0;/.test(rule(".models-page-phone .creator-phone-tabs .filter-button")), "The three tabs share the width");
  assert.ok(/flex: 1 1 0;/.test(rule(".models-page-phone .creator-phone-action")) && /display: flex;/.test(rule(".creator-phone-actions")) && /border-width: 2px;/.test(rule(".models-page-phone .creator-phone-action.is-danger")), "Rename and the status button share one row; Deactivate has the thick outline");
  assert.ok(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(rule(".creator-phone-tiles")) && /border: 1px solid #333333;/.test(rule(".creator-phone-tile")), "Tiles are boxed, two across");
  const backdrop = rule(".creator-phone-screen-backdrop");
  const overlay = rule(".models-page-phone .models-overlay");
  assert.ok(/inset: 0 0 var\(--portal-footer-height, 0px\) 0;/.test(backdrop) && /z-index: 300;/.test(backdrop) && /inset: 0 0 var\(--portal-footer-height, 0px\) 0;/.test(overlay) && /z-index: 310;/.test(overlay), "The screen and windows stop above the footer; windows sit over the screen");
  const toastLayer = Number(read("index.css").match(/\.toast-region[^{]*\{[^}]*?z-index: (\d+);/)?.[1]);
  assert.ok(toastLayer > 310, `Toasts (z-index ${toastLayer}) stay above the screen and windows, even without the Popover API`);
  assert.ok(/max-height: calc\(100dvh - var\(--portal-footer-height, 0px\) - 16px\);/.test(rule(".models-page-phone .models-modal")) && /overflow-y: auto;/.test(rule(".models-page-phone .models-modal-body")), "Windows scroll inside, so their buttons stay reachable");
  for (const selector of [".creator-phone-row-name", ".creator-phone-row-meta", ".models-page-phone .creator-phone-screen-body h3", ".models-page-phone .creator-phone-account", ".creator-phone-tile-value"]) {
    assert.ok(/overflow-wrap: anywhere;/.test(rule(selector)), `Long text wraps instead of widening the page (${selector})`);
  }
  // Older Creator Management rules size these under 13px; the phone block must override each.
  for (const selector of [".models-page-phone .models-help", ".models-page-phone .models-confirm-copy", ".models-page-phone .empty-state span"]) {
    assert.ok(/font-size: 13px !important;/.test(rule(selector)), `Phones resize ${selector}`);
  }
  pass("Phone styles: 44px targets, 16px fields, 13px text, design greys, screens and windows clear of the footer");

  console.log(`${passed} Creator Management phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__caps;
  delete globalThis.__isPhone;
}
