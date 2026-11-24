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

const page = read("pages/PeopleDetailPage.tsx");
const panel = read("components/PeopleQaPanel.tsx");
const css = read("pages/PeoplePage.css");

// The signed-in account, toasts and the screen width come from stubs, so
// the page renders with a fictional account and no session or API.
const stubs = {
  "/src/auth/AuthContext.tsx": "export const useAuth = () => globalThis.__account;\nexport const AuthProvider = ({ children }) => children;",
  "/src/components/ToastProvider.tsx": "export const useToast = () => ({ success() {}, error() {}, warning() {} });\nexport default ({ children }) => children;",
  "/src/lib/useMediaQuery.ts": 'export const PHONE_QUERY = "(max-width: 720px)";\nexport const useMediaQuery = () => globalThis.__isPhone;',
};
const vite = await createServer({
  root, configFile: false, envDir: false,
  plugins: [{
    name: "profile-stubs",
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

// Walks a hook-free component's element tree (host elements only).
const findAll = (node, test, found = []) => {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, test, found);
    return found;
  }
  if (test(node)) found.push(node);
  return findAll(node.props?.children, test, found);
};

try {
  const { ProfilePhoneFacts, ProfilePhoneRecords, ProfilePhonePager } = await vite.ssrLoadModule("/src/components/ProfilePhoneViews.tsx");
  const PeopleDetailPage = (await vite.ssrLoadModule("/src/pages/PeopleDetailPage.tsx")).default;

  // 1. The shared phone pieces.
  const facts = renderToStaticMarkup(createElement(ProfilePhoneFacts, { facts: [{ label: "Standing", value: "Clear" }, { label: "Active strikes", value: 0 }] }));
  assert.equal(facts, '<dl class="people-profile-phone-facts"><div><dt>Standing</dt><dd>Clear</dd></div><div><dt>Active strikes</dt><dd>0</dd></div></dl>', "Facts are one label-and-value list");

  const records = [
    { id: "fictional-1", title: "Late reply to fans", meta: "Nov 20 · Warning", status: "Active", tone: "strong" },
    { id: "fictional-2", title: "Missed shift handover", meta: "Nov 19 · Final warning", status: "Expired", tone: "muted" },
    { id: "fictional-3", title: "Fictional reason", meta: "Nov 2 · Clear", status: "Voided", tone: "dim" },
  ];
  const list = renderToStaticMarkup(createElement(ProfilePhoneRecords, { heading: "History · 3", records, emptyText: "No strikes yet.", onOpen() {} }));
  assert.ok(list.startsWith('<section class="people-profile-phone-records"><h4 class="people-profile-phone-label">History · 3</h4><ul class="people-profile-phone-list"><li><button type="button" class="people-profile-phone-row">'), "A labelled history, then one button per record");
  const [first, second, third] = list.split("</li>");
  assert.equal(text(first), "History · 3 Late reply to fans Nov 20 · Warning Active", "Title, then date · detail, then the status; screen readers hear the words apart");
  assert.ok(first.includes('<span class="people-profile-phone-tag is-strong">Active</span>') && second.includes('class="people-profile-phone-tag is-muted">Expired<') && third.includes('class="people-profile-phone-row is-dimmed"') && third.includes('class="people-profile-phone-tag is-dim">Voided<'), "Active white, Expired grey, Voided dim and its row dimmed");
  const opened = [];
  for (const button of findAll(ProfilePhoneRecords({ heading: "History · 3", records, emptyText: "", onOpen: (id) => opened.push(id) }), (el) => el.type === "button")) button.props.onClick();
  assert.deepEqual(opened, ["fictional-1", "fictional-2", "fictional-3"], "Tapping a row opens that record");
  assert.equal(renderToStaticMarkup(createElement(ProfilePhoneRecords, { heading: "History · 0", records: [], emptyText: "No strikes yet.", onOpen() {} })), '<section class="people-profile-phone-records"><h4 class="people-profile-phone-label">History · 0</h4><p class="people-profile-phone-empty">No strikes yet.</p></section>', "An empty history says so in one line");

  const pager = (props) => renderToStaticMarkup(createElement(ProfilePhonePager, { label: "Pages", disabled: false, onPrevious() {}, onNext() {}, ...props }));
  assert.equal(pager({ page: 1, pageCount: 1 }), "", "One page: no pager");
  const two = pager({ page: 1, pageCount: 2 });
  assert.ok(two.includes('role="group" aria-label="Pages"') && /disabled="">Previous<\/button><span>Page 1 of 2<\/span><button type="button" class="secondary-button">Next</.test(two), "More pages: Previous, the page, Next; Previous waits on the first page");
  pass("Shared pieces: a facts list, history rows that open the record, a pager only when needed");

  // 2. The profile page on a phone and on a desktop (a server render shows loading).
  const render = (isPhone, from) => {
    globalThis.__isPhone = isPhone;
    globalThis.__account = { user: { id: "fictional-viewer" } };
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/people/fictional-1?tab=strikes&from=${encodeURIComponent(from)}`] }, createElement(PeopleDetailPage)));
  };
  const phone = render(true, "/strikes?strikeId=fictional-1");
  assert.ok(phone.startsWith('<div class="page people-profile-page people-profile-page-phone"><button type="button" class="people-profile-phone-back" aria-label="Back to Strike Management"><span class="people-profile-phone-back-arrow" aria-hidden="true"></span><span>Strike Management</span></button>'), "Phones: a small back link naming the page it returns to");
  assert.ok(render(true, "/incidents").includes("<span>Incidents</span>") && render(true, "/people").includes("<span>Employee Management</span>"), "The back link names Incidents or Employee Management too");
  const desktop = render(false, "/strikes");
  assert.ok(desktop.startsWith('<div class="page people-profile-page"><button type="button" class="secondary-button people-profile-page-back">← Back to Strike Management</button>') && !desktop.includes("phone"), "Desktop keeps its boxed back button and no phone classes");
  pass("Phones: a small back link; desktop keeps its button");

  // 3. The page's code.
  assert.ok(/const backButton =\s*isPhone \? \(/.test(page) && (page.match(/\{backButton\}/g) ?? []).length === 3 && (page.match(/<div className=\{pageClassName\}>/g) ?? []).length === 3, "Loading, error and the profile all use the same back link and page class");
  assert.ok(/\{isPhone \? \(\s*\/\/ Phones: initials, the name, one grey line, and ⋯ for the edits\.\s*<div className="people-profile-phone-identity">/.test(page) && /person\.roles\s*\.map\(\s*\(role\) =>\s*role\.name\s*\)\s*\.join\(", "\),\s*person\.email,\s*\]\s*\.filter\(Boolean\)\s*\.join\(" · "\)/.test(page), "Phones: the header is the initials, the name, and the roles · email on one grey line");
  assert.ok(/const canEditFromMenu =\s*Boolean\(\s*person &&\s*options\?\.capabilities\.canAssignRoles &&\s*canManagePerson\s*\);/.test(page) && /\.\.\.\(canEditFromMenu &&\s*person\?\.teamGroup\s*\?[\s\S]*?label: "Edit assignments",[\s\S]*?openRoleEditor\(\);/.test(page) && /\.\.\.\(canEditFromMenu\s*\?[\s\S]*?label: person\?\.teamGroup\s*\?\s*"Change team"\s*:\s*"Add to a team",[\s\S]*?openTeamEditor\(\);/.test(page), "⋯ holds Edit assignments (with a team, which it needs) and Change team, with desktop's permissions");
  assert.ok(/\{canEditFromMenu && \(\s*<PhoneActionMenu\s*label="More employee actions"\s*panelId="people-profile-phone-menu-panel"/.test(page), "Without those permissions there is no ⋯");
  assert.ok(/\{isPhone &&\s*tab\.id ===\s*"account-access"\s*\?\s*"Access"\s*:\s*tab\.label\}/.test(page), "Phones shorten Account Access to Access so four tabs fit");
  for (const tab of ["overview", "account-access"]) {
    assert.ok(new RegExp(`\\{activeTab ===\\s*"${tab}" &&\\s*isPhone && \\(`).test(page) && new RegExp(`\\{activeTab ===\\s*"${tab}" &&\\s*!isPhone && \\(`).test(page), `${tab}: a phone list, and desktop's cards only on desktop`);
  }
  assert.equal((page.match(/layout=\{\s*isPhone\s*\?\s*"phone"\s*:\s*"desktop"\s*\}/g) ?? []).length, 2, "QA and Strikes get the phone layout on phones");
  const overview = page.slice(page.indexOf("{/* Phones: one list for team, role and models"), page.indexOf('"overview" &&\n            !isPhone'));
  for (const label of ['label: "Team"', '? "Roles"', ': "Role"', 'label: "Models"', '"Not assigned"', '"No role"', '"None"', "formatDataScope(", "people-scope-note"]) assert.ok(overview.includes(label), `Overview on phones: ${label}`);
  const access = page.slice(page.indexOf("{/* Phones: the account facts"), page.indexOf('"account-access" &&\n            !isPhone'));
  for (const label of ['label: "Status"', 'label: "Created"', 'label: "Email verified"', 'label: "Last sign-in"']) assert.ok(access.includes(label), `Access on phones: ${label}`);
  assert.ok(/person\.status ===\s*"PENDING_SETUP" &&\s*options\.capabilities\.canCreatePeople && \(\s*<button[\s\S]*?data-profile-action="resend-invite"[\s\S]*?disabled=\{\s*saving \|\|\s*!canManagePerson \|\|\s*!options\s*\.capabilities\s*\.invitesAvailable\s*\}[\s\S]*?Resend invitation/.test(access), "Resend invitation: pending accounts, same permission and limits as desktop");
  assert.ok(/options\s*\.capabilities\s*\.canResetTwoFactor && \(\s*<button[\s\S]*?data-profile-action="reset-2fa"[\s\S]*?requestPhoneAction\(\s*"reset-2fa"\s*\)[\s\S]*?Reset 2FA\s*<\/span>/.test(access), "Reset 2FA keeps its name and asks for confirmation");
  assert.ok(/person\.status ===\s*"DEACTIVATED" &&\s*canChangeAccountStatus && \(\s*<button[\s\S]*?requestPhoneAction\(\s*"reactivate"\s*\)[\s\S]*?Reactivate account/.test(access), "Reactivate account: deactivated accounts, same permission as desktop");
  assert.ok(/person\.id !==\s*user\?\.id &&\s*\(\s*\(person\.status ===\s*"ACTIVE" &&\s*canChangeAccountStatus\) \|\|\s*options\.capabilities\.canDelete\s*\) && \(\s*<div className="people-profile-phone-danger">/.test(access), "The risky links never show on your own profile, as on desktop");
  assert.ok(/className="people-profile-phone-quiet-link"\s*data-profile-action="deactivate"[\s\S]*?requestPhoneAction\(\s*"deactivate"\s*\)[\s\S]*?disabled=\{\s*saving \|\|\s*\(options\.capabilities\.isOwner && !canManagePerson\)\s*\}\s*>\s*Deactivate account/.test(access) && /className="people-profile-phone-quiet-link"\s*data-profile-action="delete"[\s\S]*?requestPhoneAction\(\s*"delete"\s*\)[\s\S]*?Permanently delete account/.test(access), "Deactivate and Delete are quiet links with desktop's conditions, and still go through their confirmations");
  assert.ok(/function requestPhoneAction\([\s\S]*?phoneReturnFocus\.current =\s*`\[data-profile-action="\$\{action\}"\]`;\s*requestConfirmedAction\(\s*action\s*\);/.test(page), "Rows use the same confirmation as desktop and remember where focus returns");
  assert.ok(/const anyWindowOpen =\s*showRoleEditor \|\|\s*showTeamEditor \|\|\s*Boolean\(\s*confirmAction\s*\);/.test(page) && /if \(\s*anyWindowOpen\s*\) \{\s*return;\s*\}[\s\S]*?phoneReturnFocus\.current =\s*null;[\s\S]*?\.people-profile-tab\.active/.test(page), "Focus returns to ⋯ or the row once a window closes (the chosen tab when the row is gone)");
  assert.ok(/if \(\s*!isPhone\s*\) \{\s*setPhoneMenuOpen\(\s*false\s*\);\s*\}/.test(page), "Crossing 720px closes the ⋯ menu");
  pass("Profile code: phone lists per tab, edits in ⋯, account actions with desktop's permissions and confirmations");

  // 4. The QA and Strikes tabs.
  assert.ok(/layout = "desktop",/.test(panel) && (panel.match(/layout === "phone"/g) ?? []).length === 2, "PeopleQaPanel defaults to desktop; QA and Strikes each have a phone branch");
  const qaPhone = panel.slice(panel.indexOf('layout === "phone"'), panel.indexOf("QA History"));
  for (const part of ['label: "Incidents"', 'label: "QA profile"', "heading={`History · ${qa.totalIncidentCount}`}", 'emptyText="No QA records yet."', "incidentStatusLabel(", "`/incidents?incidentId=${encodeURIComponent(", "<ProfilePhonePager"]) assert.ok(qaPhone.includes(part), `QA on phones: ${part}`);
  const strikesPhone = panel.slice(panel.lastIndexOf('layout === "phone"'), panel.indexOf("Disciplinary Standing"));
  for (const part of ['label: "Standing"', 'label: "Active strikes"', 'label: "Deduction"', 'label: "Next expiry"', 'label: "Ladder"', "heading={`History · ${history.total}`}", 'emptyText="No strikes yet."', "strikeStatusLabel(", "`/strikes?strikeId=${encodeURIComponent(", "<ProfilePhonePager"]) assert.ok(strikesPhone.includes(part), `Strikes on phones: ${part}`);
  assert.ok(/status === "ACTIVE" \|\|\s*status === "OPEN"\s*\) \{\s*return "strong";/.test(panel) && /return status === "VOIDED"\s*\?\s*"dim"\s*:\s*"muted";/.test(panel), "Active and Open read strongest, Voided dim, the rest grey");
  assert.ok(read("lib/time.ts").includes("export function formatCentralShortDate(") && read("components/StrikePhoneViews.tsx").includes("formatCentralShortDate(") && !read("components/StrikePhoneViews.tsx").includes("new Intl.DateTimeFormat"), "Short dates come from one helper, shared with the strike rows");
  pass("QA and Strikes tabs: facts, then history rows that open each incident or strike");

  // 5. Styles.
  const ours = css.slice(css.indexOf("EMPLOYEE PROFILE ON PHONES (24 Nov 2026)"));
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
  for (const hex of phoneCss.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#777777", "#666666", "#555555", "#333333"].includes(hex.toUpperCase()), `Monochrome only (${hex})`);
  assert.ok(!/box-shadow|gradient/.test(phoneCss), "No shadows or gradients");
  for (const selector of [".people-profile-page-phone .people-profile-phone-back", ".people-profile-page-phone .people-profile-tab", ".people-profile-page-phone .people-profile-phone-row", ".people-profile-page-phone .people-profile-phone-action", ".people-profile-page-phone .people-profile-phone-quiet-link", ".people-profile-page-phone .people-profile-phone-pager .secondary-button", ".people-profile-page-phone .people-modal-footer button", ".people-profile-page-phone .people-check-option"]) {
    assert.ok(/min-height: (44|56)px;/.test(rule(selector)), `44px tap height or more (${selector})`);
  }
  assert.ok(/width: 44px;/.test(rule(".people-profile-page-phone .people-close")) && /height: 44px;/.test(rule(".people-profile-page-phone .people-close")), "The windows' close button is 44 × 44px");
  assert.ok(/font-size: 16px !important;/.test(rule(".people-profile-page-phone .people-overlay select")), "Fields are 16px so iPhones don't zoom");
  assert.ok(/flex: 1 1 0;/.test(rule(".people-profile-page-phone .people-profile-tab")) && /min-width: 0;/.test(rule(".people-profile-page-phone .people-profile-tab")), "Four tabs share the width");
  assert.ok(/min-width: 0;/.test(rule(".people-profile-page-phone .people-detail-panel")) && /overflow-wrap: anywhere;/.test(rule(".people-profile-phone-facts dd")) && /overflow-wrap: anywhere;/.test(rule(".people-profile-page-phone .people-profile-phone-copy p")), "Nothing is wider than the screen; long values and emails wrap");
  assert.ok(/inset: 0 0 var\(--portal-footer-height, 0px\) 0;/.test(rule(".people-profile-page-phone .people-overlay")) && /max-height: calc\(100dvh - var\(--portal-footer-height, 0px\) - 16px\);/.test(rule(".people-profile-page-phone .people-form-modal")) && /overflow-y: auto;/.test(rule(".people-profile-page-phone .people-form-body")), "Windows stop above the footer and scroll inside, so their buttons stay reachable");
  assert.ok(/text-decoration: underline;/.test(rule(".people-profile-page-phone .people-profile-phone-quiet-link")) && /color: #999999;/.test(rule(".people-profile-page-phone .people-profile-phone-quiet-link")), "Deactivate and Delete are quiet grey links");
  // Older People rules size these under 13px; the phone block must override each.
  for (const selector of [".people-profile-page-phone .people-scope-note", ".people-profile-page-phone .people-check-option small", ".people-profile-page-phone .people-qa-empty span", ".people-profile-page-phone .people-modal-header p"]) {
    assert.ok(/font-size: 13px !important;/.test(rule(selector)), `Phones resize ${selector}`);
  }
  pass("Phone styles: 44px targets, 16px fields, 13px text, monochrome, nothing wider than the screen");

  console.log(`${passed} employee profile phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__account;
  delete globalThis.__isPhone;
}
