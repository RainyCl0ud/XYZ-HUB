import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("src/pages/ChattersPage.tsx");
const layout = read("src/components/AppLayout.tsx");
const css = read("src/pages/ChattersPage.css");
const qaRoutes = read("../backend/src/routes/qa-chatters.ts");
const legacyRoutes = read("../backend/src/routes/chatters.ts");

// Toasts and the screen width come from stubs, so the page renders with no
// session or API.
const stubs = {
  "/src/components/ToastProvider.tsx": "export const useToast = () => ({ success() {}, error() {} });\nexport default ({ children }) => children;",
  "/src/lib/useMediaQuery.ts": 'export const PHONE_QUERY = "(max-width: 720px)";\nexport const useMediaQuery = () => globalThis.__isPhone;',
};
const vite = await createServer({
  root, configFile: false, envDir: false,
  plugins: [{
    name: "chatters-stubs",
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

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

try {
  const { ChatterPhoneList } = await vite.ssrLoadModule("/src/components/ChatterPhoneList.tsx");
  const ChattersPage = (await vite.ssrLoadModule("/src/pages/ChattersPage.tsx")).default;

  // 1. One row per chatter, each a link to the QA profile.
  const rows = [
    { id: "fictional-1", name: "Quinn Harper", status: "ACTIVE", createdAt: "2026-10-12T15:00:00.000Z" },
    { id: "fictional-2", name: "Yara Finch", status: "INACTIVE", createdAt: "2026-09-30T15:00:00.000Z" },
  ];
  const list = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ChatterPhoneList, {
    chatters: rows,
    profilePath: (chatter) => `/chatters/${chatter.id}?from=%2Fchatters`,
    formatAdded: () => "Oct 12, 2026",
  })));
  assert.ok(list.startsWith('<ul class="chatter-phone-list"><li><a class="chatter-phone-row" href="/chatters/fictional-1?from=%2Fchatters"'), `Rows are links to the QA profile, keeping the list's place: ${list.slice(0, 160)}`);
  const [active, inactive] = list.split("</li>");
  assert.equal(text(active), "Quinn Harper Added Oct 12, 2026", "Name, then when they were added; screen readers hear the words apart");
  assert.ok(!active.includes("Inactive") && !active.includes("Active"), "Active chatters show no tag");
  assert.ok(inactive.includes('class="chatter-phone-row chatter-phone-row-inactive"') && inactive.includes('<span class="chatter-phone-row-tag">Inactive</span>'), "Inactive chatters are tagged and dimmed");
  assert.equal((list.match(/<span class="chatter-phone-row-chevron" aria-hidden="true"><\/span>/g) ?? []).length, 2, "Each row has a silent arrow");
  assert.ok(!list.includes("View QA incident history") && !list.includes("!"), "No repeated helper text or ! markers");
  pass("Phone rows: name and when added, Inactive only when it applies, an arrow, each a link to the QA profile");

  // 2. The page on a phone and on a desktop (a server render shows loading).
  const render = (isPhone) => {
    globalThis.__isPhone = isPhone;
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/chatters"] }, createElement(ChattersPage)));
  };
  const phone = render(true);
  assert.ok(phone.startsWith('<div class="page chatters-page chatters-page-phone"><h2 class="chatters-sr-only">Chatters</h2>'), "Phones: the heading is kept for screen readers only");
  assert.ok(/<div class="chatters-phone-search-row"><input class="search-input" type="search"[^>]*aria-label="Search chatters"[^>]*\/><div class="chatters-phone-creator"><\/div><\/div>/.test(phone), "Search and the creator picker's place share one line");
  assert.ok(/<div class="filter-group">(<button type="button" class="filter-button( active)?" aria-pressed="(true|false)">(All|Active|Inactive)<\/button>){3}<\/div>/.test(phone), "The status tabs stay");
  assert.ok(phone.includes('<button type="button" class="filter-button active" aria-pressed="true">All</button>') && (phone.match(/aria-pressed="false"/g) ?? []).length === 2, "Screen readers hear which status tab is chosen");
  for (const removed of ["page-eyebrow", "Team Management", "page-description", "Chatter Records", "content-card", "Add Chatter"]) {
    assert.ok(!phone.includes(removed), `Phones don't show ${removed}`);
  }
  const desktop = render(false);
  for (const kept of ['<div class="page chatters-page"><header class="page-header">', '<p class="page-eyebrow">Team Management</p>', "Chatter Records", '<section class="content-card">', '<div class="toolbar-controls"><input class="search-input"']) {
    assert.ok(desktop.includes(kept), `Desktop keeps ${kept}`);
  }
  assert.ok(!desktop.includes("chatters-phone") && !desktop.includes("Add Chatter"), "Desktop has no phone layout and no Add Chatter");
  pass("Phones: search and creator on one line, the status tabs, then the list; desktop keeps its header and card, without Add Chatter");

  // 3. The creator picker is the top bar's own, drawn in the page on phones.
  assert.equal((layout.match(/aria-label="Creator"/g) ?? []).length, 1, "There is one creator picker");
  assert.ok(layout.includes("  const modelPicker = (\n") && layout.includes("{showModelContext && !modelPickerSlot ? (\n          modelPicker\n"), "The top bar draws it unless a page has taken it");
  assert.ok(layout.includes("{showModelContext && modelPickerSlot && createPortal(modelPicker, modelPickerSlot)}"), "Otherwise it is drawn into the page's place");
  assert.ok(layout.includes("`app-shell portal-shell${showModelContext && !modelPickerSlot\n          ? \" portal-shell-context\""), "The top bar drops its second row while the picker is in the page");
  assert.ok(layout.includes("<ModelPickerSlotContext.Provider value={setModelPickerSlot}>") && layout.indexOf("<ModelPickerSlotContext.Provider") < layout.indexOf("<Outlet"), "Pages can offer a place for it");
  const switchStart = layout.indexOf("  function changeModelContext(");
  const switchFn = layout.slice(switchStart, layout.indexOf("\n  }\n", switchStart));
  assert.ok(/if \(modelPickerSlot\) \{\s*refocusPickerAfterSwitch\.current =\s*true;/.test(switchFn), "Switching creator from the page's picker asks for focus back");
  const refocus = layout.slice(layout.indexOf("  useLayoutEffect(() => {"), layout.indexOf("  const supportsCreatorContext ="));
  assert.ok(refocus.includes('"portal-model-context"') && refocus.includes("?.focus();") && /refocusPickerAfterSwitch\.current =\s*false;/.test(refocus) && /\}, \[\s*modelPickerSlot,\s*\]\);/.test(refocus), "Once the reloaded page offers its place again, the picker gets focus back");
  assert.ok(layout.includes('title={`${fixedModel.name}${fixedModel.isActive ? "" : " (Inactive)"}`}'), "A fixed creator's name has a tooltip with the full name");
  const phoneBranch = page.slice(page.indexOf('<div className="chatters-phone-toolbar">'), page.indexOf('<div className="card-header chatter-table-header">'));
  assert.ok(phoneBranch.includes('className="chatters-phone-creator"\n                ref={setModelPickerSlot}'), "Only the phone layout offers the place");
  assert.equal((page.match(/ref={setModelPickerSlot}/g) ?? []).length, 1, "Desktop never takes the picker from the top bar");
  pass("One creator picker: the top bar's own, drawn beside the search on Chatters phones, with the top bar a row shorter");

  // 4. Add Chatter is gone; chatters come from People.
  assert.ok(!/Add Chatter|addChatter|openAddForm|pendingAdd|showForm|canManageQaProfiles/.test(page), "The page has no Add Chatter button, form or confirmation");
  assert.ok(page.includes('"Chatters appear here once someone in People has the Chatter or Trial Chatter role."') && page.includes('"Try another status filter."'), "An empty list says where chatters come from");
  assert.ok(page.includes(': oneCreatorSelected\n                    ? "No chatters are assigned to this creator yet."') && page.includes('return Boolean(saved && saved !== "ALL");') && page.includes("MODEL_CONTEXT_STORAGE_KEY"), "With one creator chosen, an empty list says none are assigned to that creator");
  assert.ok(page.includes("chatters={paginatedChatters}") && page.includes("formatAdded={formatTexasDate}"), "Phones list the same page of chatters, with the same dates, as the table");
  assert.ok(page.includes("profilePath={chatterProfilePath}") && page.includes("navigate(\n      chatterProfilePath("), "Phone links and table rows open the same profile address");
  assert.ok(!/router\.post\(/.test(legacyRoutes), "The old name-only create handler is removed");
  const block = qaRoutes.slice(qaRoutes.indexOf("router.post(\n  \"/\","), qaRoutes.indexOf("router.use(\n  legacyChatterRoutes"));
  assert.ok(block.includes(".status(405)") && block.includes('"Allow",\n        "GET"') && block.includes("Chatters are added in People. Give the person the Chatter or Trial Chatter role."), "The API explains that chatters are added in People");
  pass("Add Chatter is removed from the page and the API; chatters come from People");

  // 5. Styles.
  const ours = css.slice(css.indexOf("CHATTERS ON PHONES (24 Nov 2026)"));
  const mediaStart = ours.indexOf("@media (max-width: 720px) {");
  let depth = 0, mediaEnd = -1;
  for (let i = mediaStart; i < ours.length; i += 1) {
    if (ours[i] === "{") depth += 1;
    if (ours[i] === "}" && --depth === 0) { mediaEnd = i; break; }
  }
  const phoneCss = ours.slice(mediaStart, mediaEnd + 1);
  const outside = (ours.slice(0, mediaStart) + ours.slice(mediaEnd + 1)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^*]*\*\//, "");
  assert.deepEqual([...outside.matchAll(/([^{}]+)\{/g)].map(([, s]) => s.trim()), [".chatters-sr-only"], "Everything but the screen-reader class applies only at 720px and below");
  const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const rule = (selector) => {
    const wanted = squash(selector);
    const bodies = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, list]) => squash(list).split(",").map((s) => s.trim()).includes(wanted))
      .map(([, , body]) => body);
    assert.ok(bodies.length, `${selector} has a rule`);
    return bodies.join("\n");
  };
  for (const [, selector, body] of ours.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${squash(selector)})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${squash(selector)}: ${size[1]}px)`);
  }
  for (const hex of ours.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#666666", "#333333", "#1A1A1A", "#141414"].includes(hex.toUpperCase()), `Monochrome token only (${hex})`);
  assert.ok(/flex: 1 1 70%;/.test(rule(".chatters-page-phone .chatters-phone-search-row .search-input")) && /flex: 0 0 calc\(30% - 8px\);/.test(rule(".chatters-phone-creator")), "Search takes 70% of the line and the picker the rest");
  assert.ok(/display: none;/.test(rule(".chatters-phone-creator:empty")), "With no picker to show, search fills the line");
  assert.ok(/display: block;/.test(rule(".chatters-page-phone .chatters-phone-creator .portal-command-context-v2")) && /display: none;/.test(rule(".chatters-page-phone .chatters-phone-creator .portal-command-context-v2:has(select) .portal-command-label")), "The picker shows in the page, without its top-bar label beside a menu");
  assert.ok(/clip: rect\(0 0 0 0\);/.test(rule(".chatters-page-phone .chatters-phone-creator .portal-command-label")), "Beside a fixed creator, screen readers still hear Creator");
  const fixed = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, list]) => squash(list) === ".chatters-page-phone .chatters-phone-creator .portal-command-context-v2 .portal-command-context-static").map(([, , body]) => body).join("\n");
  assert.ok(/font-size: 13px !important;/.test(fixed) && /white-space: normal;/.test(fixed) && /height: auto;/.test(fixed) && /overflow-wrap: anywhere;/.test(fixed), "A fixed creator's name wraps and the box grows, instead of being cut off");
  const picker = rule(".chatters-page-phone .chatters-phone-creator .portal-command-context-v2 select");
  assert.ok(/font-size: 16px !important;/.test(picker) && /min-height: 44px;/.test(picker) && /font-size: 16px !important;/.test(rule(".chatters-page-phone .chatters-phone-search-row .search-input")), "Search and picker are 44px tall with 16px text, so iPhones don't zoom");
  for (const selector of [".chatters-page-phone .chatters-phone-toolbar .filter-button", ".chatters-page-phone .compact-table-pagination .secondary-button"]) {
    assert.ok(/min-height: 44px;/.test(rule(selector)), `44px tap height (${selector})`);
  }
  assert.ok(/min-height: 56px;/.test(rule(".chatter-phone-row")) && /outline: 2px solid #FFFFFF;/.test(rule(".chatter-phone-row:focus-visible")), "Rows are 56px with a 2px white focus outline");
  assert.ok(/grid-template-columns: minmax\(0, 1fr\);/.test(rule(".chatters-phone-toolbar")), "The toolbar shrinks to a 320px screen");
  pass("Phone styles: search 70% and picker 30%, 44px targets, 16px fields, 13px text, monochrome");

  console.log(`${passed} Chatters phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__isPhone;
}
