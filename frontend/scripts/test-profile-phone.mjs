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

// The source between two markers, failing loudly if either is missing.
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + 1);
  assert.ok(from >= 0 && to > from, `Found the code between ${start} and ${end}`);
  return source.slice(from, to);
};

try {
  const { ProfilePhoneTiles, ProfilePhoneSectionHead, ProfilePhoneTable, ProfilePhonePager } = await vite.ssrLoadModule("/src/components/ProfilePhoneViews.tsx");
  const PeopleDetailPage = (await vite.ssrLoadModule("/src/pages/PeopleDetailPage.tsx")).default;

  // 1. The shared phone pieces.
  const tiles = renderToStaticMarkup(createElement(ProfilePhoneTiles, { tiles: [{ label: "Current standing", value: "Clear", note: "Ladder v1" }, { label: "Active strikes", value: 0 }] }));
  assert.equal(
    tiles,
    '<dl class="people-profile-phone-tiles is-large"><div class="people-profile-phone-tile"><dt>Current standing</dt><dd><span class="people-profile-phone-tile-value">Clear</span> <span class="people-profile-phone-tile-note">Ladder v1</span></dd></div><div class="people-profile-phone-tile"><dt>Active strikes</dt><dd><span class="people-profile-phone-tile-value">0</span></dd></div></dl>',
    "Tiles: a label, a large value, and an optional grey line (a 0 still shows)"
  );
  assert.ok(renderToStaticMarkup(createElement(ProfilePhoneTiles, { size: "compact", tiles: [{ label: "Created", value: "Nov 10, 2026", note: "9:05 PM CST" }] })).startsWith('<dl class="people-profile-phone-tiles is-compact">'), "Dates use the compact tiles");
  assert.equal(renderToStaticMarkup(createElement(ProfilePhoneSectionHead, { id: "x-title", title: "Assignments", aside: createElement("button", null, "Edit") })), '<div class="people-profile-phone-section-head"><h4 id="x-title">Assignments</h4><button>Edit</button></div>', "A section heading with its action on the right");

  const rows = [
    { id: "fictional-1", title: "Late reply to fans", meta: "Warning · 0%", date: "Nov 20", status: "Active", tone: "strong" },
    { id: "fictional-2", title: "Missed shift handover", meta: "Final warning · 10%", date: "Nov 19", status: "Expired", tone: "muted" },
    { id: "fictional-3", title: "Fictional reason", meta: "Clear · 0%", date: "Nov 2, 2025", status: "Voided", tone: "dim" },
  ];
  const tableProps = { title: "Strike history", total: 3, columns: ["Reason", "Issued", "Status"], rows, emptyText: "No strikes yet.", onOpen() {} };
  const table = renderToStaticMarkup(createElement(ProfilePhoneTable, tableProps));
  assert.ok(table.startsWith('<section class="people-profile-phone-section"><div class="people-profile-phone-section-head"><h4>Strike history</h4><span class="people-profile-phone-count">3 records</span></div><div class="people-profile-phone-table"><div class="people-profile-phone-table-head" aria-hidden="true"><span>Reason</span><span>Issued</span><span>Status</span></div><ul><li><button type="button" class="people-profile-phone-table-row" data-record-id="fictional-1">'), "A titled table with its count, a header row screen readers skip, then one button per record");
  const [first, second, third] = table.split("</li>");
  assert.equal(text(first.slice(first.indexOf("<li>"))), "Late reply to fans Warning · 0% Nov 20 Active", "Each row reads title, detail, date, status, with the words apart");
  assert.ok(first.includes('<span class="people-profile-phone-tag is-strong">Active</span><span class="people-profile-phone-chevron" aria-hidden="true"></span>') && second.includes('class="people-profile-phone-tag is-muted">Expired<') && third.includes('class="people-profile-phone-table-row is-dimmed"') && third.includes('class="people-profile-phone-tag is-dim">Voided<'), "Active white, Expired grey, Voided dim with its row dimmed; a chevron shows the row opens");
  const opened = [];
  for (const button of findAll(ProfilePhoneTable({ ...tableProps, onOpen: (id) => opened.push(id) }), (el) => el.type === "button")) button.props.onClick();
  assert.deepEqual(opened, ["fictional-1", "fictional-2", "fictional-3"], "Tapping a row opens that record");
  assert.ok(renderToStaticMarkup(createElement(ProfilePhoneTable, { ...tableProps, total: 1, rows: rows.slice(0, 1) })).includes(">1 record<"), "One record is singular");
  const empty = renderToStaticMarkup(createElement(ProfilePhoneTable, { ...tableProps, total: 0, rows: [] }));
  assert.ok(empty.includes(">0 records<") && empty.endsWith('<p class="people-profile-phone-empty">No strikes yet.</p></section>') && !empty.includes("table-head"), "An empty history says so, without an empty table");

  const pager = (props) => renderToStaticMarkup(createElement(ProfilePhonePager, { label: "Pages", disabled: false, onPrevious() {}, onNext() {}, ...props }));
  assert.equal(pager({ page: 1, pageCount: 1 }), "", "One page: no pager");
  const two = pager({ page: 1, pageCount: 2 });
  assert.ok(two.includes('role="group" aria-label="Pages"') && /disabled="">Previous<\/button><span>Page 1 of 2<\/span><button type="button" class="secondary-button">Next</.test(two), "More pages: Previous, the page, Next; Previous waits on the first page");

  const { formatCentralShortDate, formatCentralDateParts } = await vite.ssrLoadModule("/src/lib/time.ts");
  const now = new Date("2026-11-24T18:00:00.000Z");
  assert.equal(formatCentralShortDate("2026-11-23T15:00:00.000Z", now), "Nov 23", "This year's dates are short");
  assert.equal(formatCentralShortDate("2025-11-23T15:00:00.000Z", now), "Nov 23, 2025", "Other years keep the year, so history across years stays clear");
  assert.equal(formatCentralShortDate("2026-01-01T03:00:00.000Z", now), "Dec 31, 2025", "Dates are read in Central time");
  assert.equal(formatCentralShortDate("not a date", now), "—", "A bad date shows a dash");
  assert.deepEqual(formatCentralDateParts("2026-11-21T08:08:00.000Z"), { date: "Nov 21, 2026", time: "2:08 AM CST" }, "A tile's date and its time, in Central time");
  assert.deepEqual(formatCentralDateParts("2026-07-04T17:30:00.000Z"), { date: "Jul 4, 2026", time: "12:30 PM CDT" }, "Summer dates use daylight time");
  assert.equal(formatCentralDateParts(null), null, "No date: nothing to split");
  assert.equal(formatCentralDateParts("not a date"), null, "A bad date: nothing to split");
  pass("Shared pieces: tiles, section headings, a table whose rows open the record, a pager only when needed, Central dates");

  // 2. The profile page on a phone and on a desktop (a server render shows loading).
  const render = (isPhone, from) => {
    globalThis.__isPhone = isPhone;
    globalThis.__account = { user: { id: "fictional-viewer" } };
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/people/fictional-1?tab=strikes&from=${encodeURIComponent(from)}`] }, createElement(PeopleDetailPage)));
  };
  const phone = render(true, "/strikes?strikeId=fictional-1");
  assert.ok(phone.startsWith('<div class="page people-profile-page people-profile-page-phone"><div class="people-profile-phone-backbar"><button type="button" class="people-profile-phone-back" aria-label="Back to Strike Management"><span class="people-profile-phone-back-arrow" aria-hidden="true"></span><span>Strike Management</span></button></div>'), "Phones: a small back link in its own bar, naming the page it returns to, with no label or line beside it");
  assert.ok(render(true, "/incidents").includes("<span>Incidents</span>") && render(true, "/people").includes("<span>Employee Management</span>"), "The back link names Incidents or Employee Management too");
  const desktop = render(false, "/strikes");
  assert.ok(desktop.startsWith('<div class="page people-profile-page"><button type="button" class="secondary-button people-profile-page-back">← Back to Strike Management</button>') && !desktop.includes("phone"), "Desktop keeps its boxed back button and no phone classes");
  pass("Phones: a back link in a bar of its own; desktop keeps its button");

  // 3. The page's code.
  assert.ok(/const backButton =\s*isPhone \? \(\s*<div\s*className="people-profile-phone-backbar"\s*inert=\{\s*anyWindowOpen\s*\?\s*true\s*:\s*undefined\s*\}\s*>/.test(page) && (page.match(/\{backButton\}/g) ?? []).length === 3 && (page.match(/<div className=\{pageClassName\}>/g) ?? []).length === 3, "Loading, error and the profile all use the same back bar and page class; it is inert behind a window");
  assert.ok(!page.includes("PhoneActionMenu") && !page.includes("phoneMenu"), "The ⋯ menu is gone; its edits sit on Overview");
  const header = between(page, "// Phones: initials, the name with its role tags", ") : (\n          <div className=\"people-profile-identity\">");
  assert.ok(/<div className="people-profile-phone-identity-row">[\s\S]*?<h3>\s*\{person\.name\}\s*<\/h3>[\s\S]*?person\.roles\.length > 0 && \([\s\S]*?className="people-profile-phone-role"[\s\S]*?\{role\.name\}/.test(header) && /<\/div>\s*<p className="people-profile-phone-email">\s*\{person\.email\}\s*<\/p>/.test(header), "Header: initials, the name with role tags, then the email on its own line");
  assert.ok(/\{isPhone &&\s*tab\.id ===\s*"account-access"\s*\?\s*"Access"\s*:\s*tab\.label\}/.test(page), "Phones shorten Account Access to Access so four tabs fit");
  for (const tab of ["overview", "account-access"]) {
    assert.ok(new RegExp(`\\{activeTab ===\\s*"${tab}" &&\\s*isPhone && \\(`).test(page) && new RegExp(`\\{activeTab ===\\s*"${tab}" &&\\s*!isPhone && \\(`).test(page), `${tab}: a phone layout, and desktop's only on desktop`);
  }
  assert.equal((page.match(/layout=\{\s*isPhone\s*\?\s*"phone"\s*:\s*"desktop"\s*\}/g) ?? []).length, 2, "QA and Strikes get the phone layout on phones");

  // Overview: cards, with Edit and Change team beside what they change.
  assert.ok(/const canEditAssignments =\s*Boolean\(\s*person &&\s*options\?\.capabilities\.canAssignRoles &&\s*canManagePerson\s*\);/.test(page), "Overview's edits need desktop's permissions");
  const overview = between(page, "{/* Phones: team, role and models as cards", '"overview" &&\n            !isPhone');
  assert.ok(/aside=\{\s*canEditAssignments &&\s*person\.teamGroup \? \(\s*<button[\s\S]*?data-profile-action="assignments"\s*aria-label="Edit assignments"[\s\S]*?openPhoneWindow\(\s*"assignments"\s*\)[\s\S]*?>\s*Edit\s*<\/button>\s*\) : undefined\s*\}/.test(overview), "Edit sits by the Assignments heading, once there's a team (the editor needs one); screen readers hear Edit assignments");
  assert.ok(/\{canEditAssignments && \(\s*<button[\s\S]*?data-profile-action="team"[\s\S]*?openPhoneWindow\(\s*"team"\s*\)[\s\S]*?disabled=\{\s*saving\s*\}[\s\S]*?\? "Change team"\s*: "Add to a team"\}/.test(overview), "Change team (or Add to a team) sits in the Team card and waits for a save, like desktop's");
  for (const part of ['title="Assignments"', "Role permissions are set in Role Settings.", '"Not assigned"', '? "Roles"', ': "Role"', "Data scope · {formatDataScope(", "No role assignments", "`Models · ${person.models.length}`", 'className="people-profile-phone-chips"', "No model assignments", "people-scope-note"]) assert.ok(overview.includes(part), `Overview on phones: ${part}`);
  assert.ok(/function openPhoneWindow\([\s\S]*?if \(\s*saving\s*\) \{\s*return;\s*\}\s*phoneReturnFocus\.current =\s*`\[data-profile-action="\$\{action\}"\]`;[\s\S]*?openRoleEditor\(\);[\s\S]*?openTeamEditor\(\);/.test(page), "Edit and Change team open desktop's windows and remember where focus returns");

  // Account Access: tiles, security cards, then the Danger zone box.
  const access = between(page, "{/* Phones: the account facts as tiles", '"account-access" &&\n            !isPhone');
  assert.ok(/size="compact"[\s\S]*?label: "Status",\s*value: formatStatus\(\s*person\.status\s*\)/.test(access) && /phoneDateTile\(\s*"Last sign-in",\s*person\.security\s*\?\.lastSignInAt,\s*"—"\s*\)/.test(access) && /phoneDateTile\(\s*"Created",\s*person\.createdAt,\s*"—"\s*\)/.test(access) && /phoneDateTile\(\s*"Email verified",\s*person\.emailVerifiedAt,\s*"Not verified"\s*\)/.test(access), "Access: status and three dates as tiles");
  assert.ok(/function phoneDateTile\([\s\S]*?formatCentralDateParts\(\s*value\s*\);[\s\S]*?parts\?\.date \?\?\s*empty,[\s\S]*?parts\?\.time,/.test(page), "A date tile shows the date with its time beneath, or the empty text");
  assert.ok(/title="Security and sign-in"/.test(access), "Security actions sit under their own heading");
  assert.ok(/person\.status ===\s*"PENDING_SETUP" &&\s*options\.capabilities\.canCreatePeople && \([\s\S]*?Invitation pending[\s\S]*?data-profile-action="resend-invite"[\s\S]*?disabled=\{\s*saving \|\|\s*!canManagePerson \|\|\s*!options\s*\.capabilities\s*\.invitesAvailable\s*\}\s*>\s*Resend invitation/.test(access), "Resend invitation: pending accounts, same permission and limits as desktop");
  assert.ok(/options\s*\.capabilities\s*\.canResetTwoFactor && \([\s\S]*?Reset two-factor authentication[\s\S]*?data-profile-action="reset-2fa"[\s\S]*?requestPhoneAction\(\s*"reset-2fa"\s*\)[\s\S]*?>\s*Reset 2FA\s*<\/button>/.test(access), "Reset 2FA keeps its name and asks for confirmation");
  assert.ok(/person\.status ===\s*"DEACTIVATED" &&\s*canChangeAccountStatus && \([\s\S]*?data-profile-action="reactivate"[\s\S]*?requestPhoneAction\(\s*"reactivate"\s*\)[\s\S]*?>\s*Reactivate account\s*<\/button>/.test(access), "Reactivate account: deactivated accounts, same permission as desktop");
  assert.ok(!/quiet-link|data-profile-action="deactivate"|data-profile-action="delete"/.test(access), "Deactivate and Delete are no longer on the tab itself");
  assert.ok(/\{showPhoneDangerZone && \(\s*<button\s*type="button"\s*className="people-profile-phone-danger-zone"\s*data-profile-action="danger-zone"\s*aria-haspopup="dialog"\s*onClick=\{\s*openDangerZone\s*\}\s*>/.test(access) && access.includes('"Deactivate or permanently delete this account."') && access.includes('"Deactivate this account."') && access.includes('"Permanently delete this account."'), "A Danger zone box opens its window and says which actions are inside");
  assert.ok(/const canDeactivateHere =\s*person\?\.status ===\s*"ACTIVE" &&\s*canChangeAccountStatus;/.test(page) && /const showPhoneDangerZone =\s*Boolean\(\s*person &&\s*person\.id !==\s*user\?\.id &&\s*\(canDeactivateHere \|\|\s*options\?\.capabilities\.canDelete\)\s*\);/.test(page), "The Danger zone shows only when an action is usable, and never on your own profile, as on desktop");

  // The Danger zone window.
  const danger = between(page, "{/* Phones: the Danger zone window.", "{confirmAction && (");
  assert.ok(/\{isPhone &&\s*showDangerZone &&\s*showPhoneDangerZone &&\s*options && \(\s*<div className="people-overlay">\s*<section\s*className="people-confirm-modal people-danger-window"\s*role="dialog"\s*aria-modal="true"\s*aria-labelledby="people-danger-window-title"\s*>/.test(danger) && /<h3 id="people-danger-window-title">\s*Danger zone\s*<\/h3>/.test(danger), "Phones only: the Danger zone is a modal dialog named by its heading");
  assert.ok(/\{canDeactivateHere && \([\s\S]*?Deactivate account\s*<\/strong>[\s\S]*?className="people-profile-phone-card-button is-danger"\s*data-profile-action="deactivate"[\s\S]*?requestDangerAction\(\s*"deactivate"\s*\)[\s\S]*?disabled=\{\s*saving \|\|\s*\(options\.capabilities\.isOwner && !canManagePerson\)\s*\}\s*>\s*Deactivate account\s*<\/button>/.test(danger), "Deactivate: desktop's condition, description and limits");
  assert.ok(/\{options\s*\.capabilities\s*\.canDelete && \([\s\S]*?Permanently delete account\s*<\/strong>[\s\S]*?This cannot be undone and requires the account email as confirmation\.[\s\S]*?className="people-profile-phone-card-button is-danger"\s*data-profile-action="delete"[\s\S]*?requestDangerAction\(\s*"delete"\s*\)[\s\S]*?disabled=\{\s*saving\s*\}\s*>\s*Permanently delete\s*<\/button>/.test(danger), "Permanently delete: desktop's condition, description and limits");
  assert.equal((danger.match(/setShowDangerZone\(\s*false\s*\)/g) ?? []).length, 2, "The close button and Cancel both close it");
  assert.ok(/function requestDangerAction\([\s\S]*?phoneReturnFocus\.current =\s*DANGER_ZONE_BUTTON;\s*setShowDangerZone\(\s*false\s*\);\s*requestConfirmedAction\(\s*action\s*\);/.test(page) && /function openDangerZone\(\) \{\s*phoneReturnFocus\.current =\s*DANGER_ZONE_BUTTON;\s*setShowDangerZone\(\s*true\s*\);/.test(page) && page.includes(`const DANGER_ZONE_BUTTON =\n  '[data-profile-action="danger-zone"]';`), "Choosing an action swaps the window for its usual confirmation; focus then returns to the Danger zone box");

  // Windows and focus.
  assert.ok(/function requestPhoneAction\([\s\S]*?phoneReturnFocus\.current =\s*`\[data-profile-action="\$\{action\}"\]`;\s*requestConfirmedAction\(\s*action\s*\);/.test(page), "Security buttons use desktop's confirmations and remember where focus returns");
  assert.ok(/const openWindow =\s*showRoleEditor &&\s*options\?\.capabilities\.canAssignRoles\s*\?\s*"assignments"\s*:\s*showTeamEditor\s*\?\s*"team"\s*:\s*confirmAction\s*\?\s*`confirm-\$\{confirmAction\}`\s*:\s*showDangerZone &&\s*isPhone &&\s*showPhoneDangerZone &&\s*options\s*\?\s*"danger-zone"\s*:\s*null;/.test(page) && /const anyWindowOpen =\s*openWindow !==\s*null;/.test(page), "The open window is named, with each window's own render condition (the editor needs the permission, the Danger zone must show), so the page is never inert with nothing open and swapping windows counts as a change");
  assert.equal((page.match(/\{options\?\.capabilities\.canAssignRoles &&\s*showRoleEditor && \(/g) ?? []).length, 1, "The editor's render condition is the one openWindow mirrors");
  assert.ok(/useEffect\(\s*\(\) => \{\s*if \(\s*!showPhoneDangerZone\s*\) \{\s*setShowDangerZone\(\s*false\s*\);\s*\}\s*\},\s*\[\s*showPhoneDangerZone,\s*\]\s*\);/.test(page) && page.indexOf("const showPhoneDangerZone =") < page.indexOf("!showPhoneDangerZone\n"), "When a live update takes the Danger zone away, its window closes for good instead of reopening later");
  assert.ok(/if \(\s*openWindow\s*\) \{\s*const overlay =\s*isPhone\s*\?\s*document\.querySelector<HTMLElement>\(\s*"\.people-profile-page-phone \.people-overlay"\s*\)\s*:\s*null;[\s\S]*?!overlay\.contains\(\s*document\.activeElement\s*\)[\s\S]*?"input:not\(\[type='checkbox'\]\), select, button"[\s\S]*?\?\.focus\(\);\s*\}\s*return;\s*\}\s*const selector =\s*phoneReturnFocus\.current;[\s\S]*?phoneReturnFocus\.current =\s*null;[\s\S]*?\.people-profile-tab\.active/.test(page) && /\[\s*openWindow,\s*isPhone,\s*\]/.test(page), "On phones focus moves into each window as it opens, and back to what opened it when the last one closes");
  assert.ok(/if \(\s*!isPhone\s*\) \{\s*setShowDangerZone\(\s*false\s*\);[\s\S]{0,120}?phoneReturnFocus\.current =\s*null;\s*\}/.test(page), "Crossing to desktop closes the Danger zone window and forgets the phone focus target");
  assert.equal((page.match(/role=\{isPhone \? "dialog" : undefined\}\s*aria-modal=\{isPhone \? true : undefined\}/g) ?? []).length, 3, "On phones the team, assignments and confirmation windows are modal dialogs (desktop markup unchanged)");
  for (const id of ["people-team-window-title", "people-assignments-window-title", "people-confirm-window-title"]) {
    assert.ok(page.includes(`aria-labelledby={isPhone ? "${id}" : undefined}`) && page.includes(`<h3 id={isPhone ? "${id}" : undefined}>`), `${id} names its window`);
  }
  assert.ok(/inert=\{\s*isPhone &&\s*anyWindowOpen\s*\?\s*true\s*:\s*undefined\s*\}/.test(page), "On phones the profile behind a window is inert");
  pass("Profile code: Overview cards with their edits, Access cards, a Danger zone window, desktop's permissions and confirmations");

  // 4. The QA and Strikes tabs.
  assert.ok(/layout = "desktop",/.test(panel) && (panel.match(/layout === "phone"/g) ?? []).length === 2, "PeopleQaPanel defaults to desktop; QA and Strikes each have a phone branch");
  const qaPhone = between(panel, 'layout === "phone"', "QA History");
  for (const part of ["<ProfilePhoneTiles", 'label: "Total incidents"', 'label: "QA profile"', 'title="QA history"', "total={qa.totalIncidentCount}", '"QA record"', '"Date"', '"Status"', "incident.severityNameSnapshot", "incident.weightNameSnapshot", "formatCentralShortDate(\n                  incident.occurredAt", 'emptyText="No QA records yet."', "incidentStatusLabel(", "`/incidents?incidentId=${encodeURIComponent(", "<ProfilePhonePager"]) assert.ok(qaPhone.includes(part), `QA on phones: ${part}`);
  const strikesPhone = panel.slice(panel.lastIndexOf('layout === "phone"'), panel.indexOf("Disciplinary Standing"));
  for (const part of ["<ProfilePhoneTiles", 'label: "Current standing"', "note: `Ladder v${summary.ladderVersion}`", 'label: "Active strikes"', 'label: "Current deduction"', 'label: "Next expiry"', "note: nextExpiry?.time", 'title="Strike history"', "total={history.total}", '"Reason"', '"Issued"', "`${strike.standingLabelSnapshot} · ${formatPercent(", "strike.deductionPercentSnapshot", 'emptyText="No strikes yet."', "strikeStatusLabel(", "`/strikes?strikeId=${encodeURIComponent(", "<ProfilePhonePager"]) assert.ok(strikesPhone.includes(part), `Strikes on phones: ${part}`);
  assert.ok(/status === "ACTIVE" \|\|\s*status === "OPEN"\s*\) \{\s*return "strong";/.test(panel) && /return status === "VOIDED"\s*\?\s*"dim"\s*:\s*"muted";/.test(panel), "Active and Open read strongest, Voided dim, the rest grey");
  assert.ok(read("components/StrikePhoneViews.tsx").includes("formatCentralShortDate(") && !read("components/StrikePhoneViews.tsx").includes("new Intl.DateTimeFormat"), "Short dates come from one helper, shared with the strike rows");
  pass("QA and Strikes tabs: tiles, then a table whose rows open each incident or strike");

  // 5. Styles.
  const ours = css.slice(css.indexOf("EMPLOYEE PROFILE ON PHONES (redesign, 25 Nov 2026)"));
  assert.ok(!css.includes("EMPLOYEE PROFILE ON PHONES (24 Nov 2026)"), "The first phone layout's styles are replaced, not stacked");
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
  // The design reference's palette (docs/xyz-design-reference.md): surfaces, text, rules.
  for (const hex of phoneCss.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#000000", "#0D0D0D", "#141414", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#5C5C5C", "#333333", "#666666"].includes(hex.toUpperCase()), `Only the design reference's greys (${hex})`);
  assert.ok(!/\b(?:rgba?|hsla?)\(|var\(--(?:accent|danger|success|warning)/.test(phoneCss), "No other colour notations or accent colours slip in");
  assert.ok(!/gradient/.test(phoneCss) && [...phoneCss.matchAll(/box-shadow: ([^;]+);/g)].every(([, value]) => value === "none"), "No shadows or gradients");
  assert.ok(/border: 0;[\s\S]*box-shadow: none;/.test(rule(".people-profile-page-phone .people-detail-panel.team-colored")), "A team's colour border and line are dropped on phones, so the page stays monochrome");

  const backbar = rule(".people-profile-page-phone .people-profile-phone-backbar");
  assert.ok(/position: sticky;/.test(backbar) && /top: 0;/.test(backbar) && /background: #000000;/.test(backbar) && !/border/.test(backbar), "The back link stays under the top bar while the page scrolls, with no line under it");
  assert.ok(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(rule(".people-profile-phone-tiles")) && /border: 1px solid #333333;/.test(rule(".people-profile-phone-tile")), "Tiles are boxed, two across");
  assert.ok(/text-transform: uppercase;/.test(rule(".people-profile-phone-tile dt")) && /font-size: 20px;/.test(rule(".people-profile-phone-tile-value")) && /font-size: 15px;/.test(rule(".people-profile-phone-tiles.is-compact .people-profile-phone-tile-value")), "Tiles: an uppercase label over a large value (dates a little smaller)");
  const shared = [...phoneCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, list]) => squash(list) === ".people-profile-phone-table-head, .people-profile-page-phone .people-profile-phone-table-row");
  assert.ok(shared && /grid-template-columns: minmax\(0, 1fr\) 50px 78px 8px;/.test(shared[2]), "The header and rows share one set of columns: the first takes the room, then the date, the status and the chevron");
  assert.ok(/border-top: 2px solid #FFFFFF;/.test(rule(".people-profile-page-phone .people-profile-phone-danger-zone")) && /border-width: 2px;/.test(rule(".people-profile-page-phone .people-profile-phone-card-button.is-danger")), "The Danger zone has desktop's heavy top line, and its buttons the thick outline");
  for (const selector of [".people-profile-page-phone .people-profile-phone-back", ".people-profile-page-phone .people-profile-tab", ".people-profile-page-phone .people-profile-phone-table-row", ".people-profile-page-phone .people-profile-phone-small-button", ".people-profile-page-phone .people-profile-phone-card-button", ".people-profile-page-phone .people-profile-phone-danger-zone", ".people-profile-page-phone .people-profile-phone-pager .secondary-button", ".people-profile-page-phone .people-modal-footer button", ".people-profile-page-phone .people-check-option"]) {
    assert.ok(/min-height: (44|64)px;/.test(rule(selector)), `44px tap height or more (${selector})`);
  }
  assert.ok(/width: 44px;/.test(rule(".people-profile-page-phone .people-close")) && /height: 44px;/.test(rule(".people-profile-page-phone .people-close")), "The windows' close button is 44 × 44px");
  assert.ok(/font-size: 16px !important;/.test(rule(".people-profile-page-phone .people-overlay select")), "Fields are 16px so iPhones don't zoom");
  assert.ok(/flex: 1 1 0;/.test(rule(".people-profile-page-phone .people-profile-tab")) && /min-width: 0;/.test(rule(".people-profile-page-phone .people-profile-tab")), "Four tabs share the width");
  for (const selector of [".people-profile-page-phone .people-profile-phone-email", ".people-profile-phone-tile-value", ".people-profile-phone-table-title", ".people-profile-phone-table-meta", ".people-profile-phone-card-value", ".people-profile-phone-chips > li"]) {
    assert.ok(/overflow-wrap: anywhere;/.test(rule(selector)), `Long text wraps instead of widening the page (${selector})`);
  }
  assert.ok(/min-width: 0;/.test(rule(".people-profile-page-phone .people-detail-panel")), "Nothing is wider than the screen");
  assert.ok(/inset: 0 0 var\(--portal-footer-height, 0px\) 0;/.test(rule(".people-profile-page-phone .people-overlay")) && /max-height: calc\(100dvh - var\(--portal-footer-height, 0px\) - 16px\);/.test(rule(".people-profile-page-phone .people-confirm-modal")) && /overflow-y: auto;/.test(rule(".people-profile-page-phone .people-confirm-body")), "Windows, the Danger zone's included, stop above the footer and scroll inside");
  // Older People rules size these under 13px; the phone block must override each.
  for (const selector of [".people-profile-page-phone .people-scope-note", ".people-profile-page-phone .people-check-option small", ".people-profile-page-phone .people-qa-empty span", ".people-profile-page-phone .people-modal-header p"]) {
    assert.ok(/font-size: 13px !important;/.test(rule(selector)), `Phones resize ${selector}`);
  }
  pass("Phone styles: a pinned back link, tiles, a table, a heavy-lined Danger zone, 44px targets, 16px fields, 13px text, monochrome");

  console.log(`${passed} employee profile phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__account;
  delete globalThis.__isPhone;
}
