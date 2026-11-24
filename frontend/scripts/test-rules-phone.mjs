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

const page = read("pages/RulesPage.tsx");
const layout = read("components/AppLayout.tsx");
const css = read("pages/RulesPage.css");

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
    name: "rules-stubs",
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
  const { RulePhoneList, RulePhoneMenu, RulePhoneScreen } = await vite.ssrLoadModule("/src/components/RulePhoneViews.tsx");
  const RulesPage = (await vite.ssrLoadModule("/src/pages/RulesPage.tsx")).default;

  const version = (overrides) => ({
    versionNumber: 2, title: "Missed a scheduled check-in message", definition: "Fictional rule text.",
    severityNameSnapshot: "Minor", weightNameSnapshot: "Medium", weightValueSnapshot: 2, ...overrides,
  });
  const rules = [
    { id: "fictional-1", currentVersion: version({}) },
    { id: "fictional-2", currentVersion: version({ versionNumber: 1, title: "Used a banned phrase", weightNameSnapshot: null, weightValueSnapshot: null }) },
    { id: "fictional-3", currentVersion: null },
  ];

  // 1. One quiet row per rule.
  const list = renderToStaticMarkup(createElement(RulePhoneList, { rules, onOpen() {} }));
  assert.ok(list.startsWith('<ul class="rule-phone-list"><li><button type="button" class="rule-phone-row" data-rule-id="fictional-1">'), "Rules are a list of buttons that remember their rule");
  const [first, second, third] = list.split("</li>");
  assert.equal(text(first), "Missed a scheduled check-in message v2 · Minor · Medium", "Name, then version · severity · weight; screen readers hear the words apart");
  assert.equal(text(second), "Used a banned phrase v1 · Minor", "A missing weight is skipped");
  assert.equal(text(third), "Untitled Rule v0", "A rule without a version still shows");
  assert.ok(!list.includes("Fictional rule text.") && !list.includes("History") && !list.includes("Archive"), "No wording or action buttons in the list");
  const opened = [];
  const tree = RulePhoneList({ rules, onOpen: (rule) => opened.push(rule.id) });
  for (const item of tree.props.children) item.props.children.props.onClick();
  assert.deepEqual(opened, ["fictional-1", "fictional-2", "fictional-3"], "Tapping a row opens that rule");
  pass("Phone rows: the rule's name and one grey line, each opening the rule");

  // 2. The ⋯ menu.
  const items = [{ key: "add", label: "Add rule", onSelect() {} }, { key: "settings", label: "Rule settings", onSelect() {} }, { key: "archived", label: "Archived rules (1)", onSelect() {} }];
  const closed = renderToStaticMarkup(createElement(RulePhoneMenu, { open: false, onOpenChange() {}, items }));
  assert.equal(closed, '<div class="rule-phone-menu"><button type="button" class="rule-phone-menu-button" aria-label="More rule actions" aria-expanded="false"><span class="rule-phone-menu-dots" aria-hidden="true">⋯</span></button></div>', "Closed: one small named button, no reference to a missing panel");
  const open = renderToStaticMarkup(createElement(RulePhoneMenu, { open: true, onOpenChange() {}, items }));
  assert.ok(open.includes('aria-expanded="true" aria-controls="rule-phone-menu-panel"') && open.includes('<div id="rule-phone-menu-panel" class="rule-phone-menu-panel"><button type="button" class="rule-phone-menu-item">Add rule</button><button type="button" class="rule-phone-menu-item">Rule settings</button><button type="button" class="rule-phone-menu-item">Archived rules (1)</button></div>'), "Open: the actions in order, right under the button");
  const views = read("components/RulePhoneViews.tsx");
  const menuEffect = views.slice(views.indexOf("  useEffect(() => {\n    if (!open) return;"), views.indexOf("  }, [open, onOpenChange]);"));
  assert.ok(menuEffect.length > 0 && menuEffect.includes('document.addEventListener("pointerdown", closeOutside);') && menuEffect.includes("if (!wrapRef.current?.contains(event.target as Node)) onOpenChange(false);"), "While open (and only then), a tap outside closes it");
  assert.ok(menuEffect.includes('if (event.key !== "Escape" || !wrapRef.current?.contains(document.activeElement)) return;') && menuEffect.includes("buttonRef.current?.focus();"), "Escape closes it only while focus is in the menu, returning focus to ⋯ (so it never clears the search)");
  assert.ok(views.includes("if (open && next && !event.currentTarget.contains(next)) onOpenChange(false);") && views.includes("onOpenChange(false);\n                item.onSelect();"), "Tabbing out of it, or choosing an action, closes it; a tap with no new focus target is left to the outside check");
  pass("The ⋯ menu: one 44px button that opens Add rule, Rule settings and Archived rules");

  // 3. The rule screen.
  const screen = (props) => renderToStaticMarkup(createElement(RulePhoneScreen, { rule: rules[0], onBack() {}, onHistory() {}, historyBusy: false, archiveBusy: false, ...props }));
  const manager = screen({ onEdit() {}, onArchive() {} });
  assert.ok(manager.includes('<div class="rule-phone-screen" role="dialog" aria-modal="true" aria-labelledby="rule-phone-screen-title">') && manager.includes('<h3 id="rule-phone-screen-title">Missed a scheduled check-in message</h3>'), "A dialog named by the rule");
  const order = ['aria-label="Back to rules"', '<span class="rule-phone-screen-kicker">Rule</span>', 'class="rule-phone-bar-action">Edit</button>', '<p class="rule-phone-definition">Fictional rule text.</p>', "<dt>Severity</dt><dd>Minor</dd>", "<dt>Weight</dt><dd>Medium (2)</dd>", "<dt>Version</dt><dd>v2</dd>", "<span>Version history</span>", 'class="rule-phone-archive">Archive this rule</button>'].map((needle) => {
    const at = manager.indexOf(needle);
    assert.ok(at >= 0, `${needle} renders`);
    return at;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Back, Rule and Edit in the bar; wording; facts; version history; Archive last");
  const viewer = screen({});
  assert.ok(!viewer.includes("rule-phone-bar-action") && !viewer.includes("Archive this rule") && viewer.includes("Version history"), "People who can only view get no Edit or Archive, but keep history");
  const sparse = renderToStaticMarkup(createElement(RulePhoneScreen, { rule: rules[2], onBack() {}, onHistory() {}, historyBusy: true, archiveBusy: false }));
  assert.ok(sparse.includes("<dt>Severity</dt><dd>None</dd>") && sparse.includes("<dt>Weight</dt><dd>None</dd>") && sparse.includes("No definition available.") && sparse.includes('disabled="">') && sparse.includes("Loading history…"), "Missing values read None; history shows it is loading");
  pass("Rule screen: Edit in the top bar, the facts, version history, and Archive as a link at the bottom");

  // 4. The page on a phone and on a desktop (a server render shows loading).
  const render = (isPhone, permissions) => {
    globalThis.__isPhone = isPhone;
    globalThis.__account = { access: { roles: [{ systemKey: "MANAGER" }], permissions, canSeeAllModels: true } };
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/rules"] }, createElement(RulesPage)));
  };
  const manage = ["quality.access", "quality.rules.view", "quality.rules.manage"];
  const phone = render(true, manage);
  assert.ok(phone.startsWith('<div class="page rules-page rules-page-phone"><h2 class="rules-sr-only">Quality &amp; Incidents Rules</h2>'), "Phones: the heading is for screen readers only");
  assert.ok(/<section class="rules-phone-records"><div class="rules-phone-toolbar"><input class="search-input" type="search"[^>]*aria-label="Search active rules"[^>]*\/><div class="rule-phone-menu">/.test(phone), "Search, then the ⋯ menu, on one line");
  for (const removed of ["page-eyebrow", "Policy Management", "page-description", "Rule Records", "Add Rule", "Rule settings\"", "Archived (", "content-card", "rules-table"]) {
    assert.ok(!phone.includes(removed), `Phones don't show ${removed}`);
  }
  const desktop = render(false, manage);
  for (const kept of ['<div class="page rules-page"><header class="page-header">', '<p class="page-eyebrow">Policy Management</p>', ">Add Rule</button>", 'aria-label="Rule settings"', "Rule Records", '<section class="content-card">', ">Archived (0)</button>"]) {
    assert.ok(desktop.includes(kept), `Desktop keeps ${kept}`);
  }
  assert.ok(!desktop.includes("rules-phone") && !desktop.includes("rule-phone") && !desktop.includes("inert"), "Desktop doesn't use the phone layout");
  const viewOnly = render(false, ["quality.access", "quality.rules.view"]);
  assert.ok(/<button class="primary-button" type="button" hidden="">Add Rule<\/button>/.test(viewOnly) && /hidden=""[^>]*aria-label="Rule settings"/.test(viewOnly), "View-only on desktop: Add Rule and the gear stay hidden, as before");
  pass("Phones: search and ⋯, then the rules; desktop keeps its header, buttons, card and table");

  // 5. The page's code.
  assert.equal((page.match(/^ {2}return \(/gm) ?? []).length, 1, "One return for both layouts");
  assert.ok(/const phoneMenuItems = \[\s*\.\.\.\(canManageRules\s*\?\s*\[[\s\S]*?label: "Add rule",\s*onSelect: openAddRule,[\s\S]*?label: "Rule settings",[\s\S]*?"\/rules\/settings"[\s\S]*?\]\s*:\s*\[\]\),\s*\{\s*key: "archived",\s*label: `Archived rules \(\$\{archivedRules\.length\}\)`,\s*onSelect: openArchivedRules,/.test(page), "The menu offers Add rule and Rule settings only to people who manage rules; everyone gets Archived rules");
  assert.ok(/onEdit=\{\s*canManageRules\s*\?\s*\(\) =>\s*void openEditRule\(\s*phoneRule\s*\)\s*:\s*undefined\s*\}/.test(page) && /onArchive=\{\s*canManageRules\s*\?\s*\(\) =>\s*requestRuleStatusChange\(\s*phoneRule\s*\)\s*:\s*undefined\s*\}/.test(page), "Edit and Archive use the existing form and confirmation, only for people who manage rules");
  assert.ok(page.includes(") : isPhone ? (\n          <RulePhoneList\n            rules={paginatedRules}"), "Phones list the same page of rules as the table");
  assert.ok(/const phoneRule =\s*isPhone && phoneRuleId\s*\?\s*activeRules\.find\(/.test(page) && /!activeRules\.some\(\s*\(rule\) =>\s*rule\.id === phoneRuleId\s*\)\s*\)\s*\{\s*setPhoneRuleId\(null\);/.test(page), "The screen shows the rule's latest version, and closes once the rule is archived");
  assert.ok(page.indexOf("{phoneRule && (") < page.indexOf("{showArchivedRules && ("), "Archived rules, history, the form and the confirmation open over the rule screen");
  const focusEffect = page.slice(page.indexOf("  // Focus goes to Back when the rule screen opens"), page.indexOf("  // Escape closes the rule screen"));
  assert.ok(/^[\s\S]*?useEffect\(\(\) => \{\s*if \(anotherWindowOpen\) \{\s*return;\s*\}\s*if \(phoneRuleOpenId\) \{\s*phoneBackRef\.current\?\.focus\(\);\s*return;\s*\}/.test(focusEffect), "Focus never leaves a window open over the screen; otherwise Back gets it while the screen is open");
  assert.ok(focusEffect.includes("candidate.dataset.ruleId === id") && focusEffect.includes('".rule-phone-menu-button"') && !focusEffect.includes(".search-input") && /\}, \[\s*phoneRuleOpenId,\s*anotherWindowOpen,\s*\]\);/.test(focusEffect), "Once the screen closes, focus returns to the rule's row, or to ⋯ if it was archived (not the search, which would raise the keyboard)");
  assert.ok(/if \(\s*!phoneRuleOpenId \|\|\s*anotherWindowOpen\s*\) \{\s*return;\s*\}\s*const closeOnEscape[\s\S]*?if \(event\.key === "Escape"\) \{\s*setPhoneRuleId\(null\);/.test(page), "Escape closes the rule screen, but not while a window is open over it");
  assert.ok(/useEffect\(\(\) => \{\s*if \(!isPhone\) \{\s*setPhoneRuleId\(null\);\s*setPhoneMenuOpen\(false\);\s*\}\s*\}, \[isPhone\]\);/.test(page), "Widening past 720px closes the rule screen and menu, so they don't come back unasked");
  assert.ok(page.includes('className={isPhone ? "rules-phone-records" : "content-card"}\n        inert={phoneRule ? true : undefined}'), "While a rule's screen is open, the list behind it is inert");
  assert.ok(page.includes("rule.id;\n              setPhoneMenuOpen(false);\n              setPhoneRuleId("), "Opening a rule closes the menu");
  assert.ok(page.includes(': "Create a rule and its first version."}') && !page.includes("strike reason"), "The Add rule form describes a rule, not a strike reason");
  assert.ok(/const QA_PATHS =\s*new Set\(\[\s*"\/incidents",\s*"\/chatters",\s*\]\);/.test(layout), "Rules and Rule Settings no longer show the creator picker: they are the same for every creator");
  assert.ok(page.includes('import "./RulesPage.css";'), "The phone styles load with the page");
  pass("One layout; rule actions keep their permissions; the creator picker leaves Rules");

  // 6. Styles.
  const mediaStart = css.indexOf("@media (max-width: 720px) {");
  let depth = 0, mediaEnd = -1;
  for (let i = mediaStart; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}" && --depth === 0) { mediaEnd = i; break; }
  }
  const phoneCss = css.slice(mediaStart, mediaEnd + 1);
  const outside = (css.slice(0, mediaStart) + css.slice(mediaEnd + 1)).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual([...outside.matchAll(/([^{}]+)\{/g)].map(([, s]) => s.trim()), [".rules-sr-only"], "Everything but the screen-reader class applies only at 720px and below");
  const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const rule = (selector) => {
    const bodies = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, list]) => squash(list).split(",").map((s) => s.trim()).includes(selector)).map(([, , body]) => body);
    assert.ok(bodies.length, `${selector} has a rule`);
    return bodies.join("\n");
  };
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${squash(selector)})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${squash(selector)}: ${size[1]}px)`);
  }
  for (const hex of css.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#000000", "#141414", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#666666", "#333333"].includes(hex.toUpperCase()), `Monochrome token only (${hex})`);
  assert.ok(!/box-shadow|gradient/.test(css), "No shadows or gradients");
  for (const selector of [".rules-page-phone .rule-phone-menu-item", ".rules-page-phone .rule-phone-row", ".rules-page-phone .rule-phone-bar-action", ".rules-page-phone .rule-phone-history", ".rules-page-phone .rule-phone-archive", ".rules-page-phone .compact-table-pagination .secondary-button", ".rules-page-phone .history-item .table-actions .text-button", ".rules-page-phone .modal-actions > button"]) {
    assert.ok(/min-height: (44|56)px;/.test(rule(selector)), `44px tap height (${selector})`);
  }
  for (const selector of [".rules-page-phone .rule-phone-menu-button", ".rules-page-phone .rule-phone-back", ".rules-page-phone .modal-close"]) {
    assert.ok(/width: 44px;/.test(rule(selector)) && /height: 44px;/.test(rule(selector)), `44 × 44px (${selector})`);
  }
  assert.ok(/font-size: 16px !important;/.test(rule(".rules-page-phone .rules-phone-toolbar .search-input")) && /font-size: 16px !important;/.test(rule(".rules-page-phone .modal .form-field input")), "Fields are 16px so iPhones don't zoom");
  assert.ok(/position: absolute;/.test(rule(".rule-phone-menu-panel")) && /right: 0;/.test(rule(".rule-phone-menu-panel")), "The menu opens right under ⋯");
  assert.ok(/height: 100%;/.test(rule(".rule-phone-screen")) && /padding: 0;/.test(rule(".rules-page-phone .rule-phone-screen-backdrop")) && /position: sticky;/.test(rule(".rule-phone-screen-bar")), "The rule screen fills the phone, with its bar kept at the top");
  assert.ok(/text-decoration: underline;/.test(rule(".rules-page-phone .rule-phone-archive")) && /color: #999999;/.test(rule(".rules-page-phone .rule-phone-archive")), "Archive is a quiet grey link");
  assert.ok(/height: 100%;/.test(rule(".rules-page-phone .modal-backdrop > .modal-history")), "Archived rules and version history fill the phone too");
  assert.ok(/font-size: 11px;/.test(rule(".rules-page-phone .history-item .version-badge")) && /text-transform: uppercase;/.test(rule(".rules-page-phone .history-item .version-badge")), "Version and Archived tags are 11px uppercase");
  pass("Phone styles: 44px targets, 16px fields, 13px text, monochrome, full-screen rule, history and archived screens");

  console.log(`${passed} Rules phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__account;
  delete globalThis.__isPhone;
}
