import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("pages/AccountPage.tsx");
const toggle = read("components/AccountNotificationToggle.tsx");
const twoFactor = read("components/AccountTwoFactor.tsx");
const css = read("pages/AccountPage.css");
const f4 = read("F4Usability.css");
const marker = "MY ACCOUNT — READABLE TEXT AND PHONE LAYOUT";
assert.ok(css.includes(marker), "The My Account block exists");
const block = css.slice(css.indexOf(marker));
assert.equal(css.lastIndexOf("@media (max-width: 720px)"), css.indexOf("@media (max-width: 720px)", css.indexOf(marker)), "The block comes last, after the older account rules");
const phone = block.slice(block.indexOf("@media (max-width: 720px) {"));
const allWidths = block.slice(0, block.indexOf("@media (max-width: 720px) {"));
// The rule whose selector list is exactly `selector`.
const rule = (source, selector) => {
  const at = source.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} has a rule`);
  return source.slice(at, source.indexOf("}", at));
};
// The rule whose selector list includes `selector`.
const ruleWith = (source, selector) => {
  const found = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, list]) => list.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim()).includes(selector));
  assert.ok(found, `${selector} is styled`);
  return found[2];
};

// 1. Readable text at every width.
for (const [, selector, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
  if (!size) continue;
  if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${selector.trim()})`);
  else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${selector.trim()}: ${size[1]}px)`);
}
// Card paragraphs are capped by a global !important rule (F4Usability).
assert.ok(/\.content-card p,[\s\S]*?font-size: 11\.5px !important;/.test(f4), "The global rule this block has to beat is still there");
for (const selector of [".account-profile-card .account-profile-copy p", ".account-two-factor .account-2fa-heading p", ".account-two-factor .account-2fa-note", ".account-two-factor .account-2fa-error"]) {
  assert.ok(selector.split(" ").length >= 2 && /font-size: 13px !important;/.test(ruleWith(allWidths, selector)), `${selector} is 13px and beats .content-card p (more specific, also !important)`);
}
for (const selector of [".account-status-card span", ".account-status-card strong", ".account-profile-facts strong", ".account-notification-card .account-notification-error", ".account-avatar-modal-header p", ".account-avatar-help"]) {
  assert.ok(/font-size: 13px;/.test(ruleWith(allWidths, selector)), `${selector} is 13px`);
}
assert.ok(/font-size: 11px;/.test(ruleWith(allWidths, ".account-profile-facts span")) && /text-transform: uppercase;/.test(ruleWith(allWidths, ".account-profile-facts span")), "Fact labels are 11px uppercase");
assert.ok(/border-color: #666666;/.test(rule(allWidths, ".account-status-card")), "The status border is monochrome, not tinted");
pass("Text is 13px (11px only for uppercase labels), beating the global card-paragraph cap; the status border is monochrome");

// 2. Header: title lines up with the cards; Notification is a full-width row.
assert.ok(/align-items: stretch;/.test(rule(phone, ".account-page-header")), "The title is no longer centred (the older rule centred it in the phone column)");
assert.ok(/display: none;/.test(rule(phone, ".account-page-header .page-eyebrow,\n  .account-page-header .page-description")), "Phones skip the small label and intro; the top bar names the page");
const row = rule(phone, ".account-page-header .account-header-notifications");
assert.ok(/display: flex;/.test(row) && /justify-content: space-between;/.test(row) && /min-height: 56px;/.test(row) && /border: 1px solid var\(--border\);/.test(row), "Notification is one bordered row");
assert.ok(/flex: 0 0 auto;/.test(rule(phone, ".account-header-notifications .account-notification-controls")), "The switch stays at the right edge (an older rule made its wrapper grow)");
const hit = rule(phone, ".account-header-notifications .account-notification-toggle::before");
assert.ok(/content: "";/.test(hit) && /inset: -5px -2px;/.test(hit), "The 34px switch has a 44px tap area");
assert.ok(toggle.includes('<h3 id="account-notification-title">Notification</h3>') && toggle.includes('aria-label="Notification"'), "The Notification label and switch are unchanged");
pass("Phones: the title lines up with the cards; Notification is one row with a 44px switch target on the right");

// 3. Profile: compact header; tags wrap; status and sign-in are rows; email once.
const hero = rule(phone, ".account-profile-hero");
assert.ok(['"avatar name"', '"avatar email"', '"roles roles"', '"status status"'].every((area) => hero.includes(area)) && hero.includes("grid-template-columns: 56px minmax(0, 1fr);"), "Picture beside name and email; role tags and status on their own full-width rows");
assert.ok(/display: contents;/.test(rule(phone, ".account-profile-copy")), "The name, email and roles join the profile grid");
assert.ok(/display: none;/.test(rule(phone, ".account-profile-label")), "The PROFILE label is hidden on phones");
assert.ok(/overflow-wrap: anywhere;/.test(rule(phone, ".account-profile-copy h3")) && /overflow-wrap: anywhere;/.test(rule(phone, ".account-profile-copy p")), "Long names and emails wrap instead of being clipped");
assert.ok(/max-width: 100%;/.test(rule(phone, ".account-role-list span")) && /overflow-wrap: anywhere;/.test(rule(phone, ".account-role-list span")), "Any number of roles, and long role names, stay inside the card");
const status = rule(phone, ".account-status-card");
assert.ok(/grid-area: status;/.test(status) && /min-height: 48px;/.test(status) && /border-top: 1px solid var\(--border\);/.test(status) && /justify-content: space-between;/.test(status), "Account status is a full-width row like Last sign-in");
assert.ok(/text-transform: uppercase;/.test(rule(phone, ".account-status-card span")) && /font-size: 11px;/.test(rule(phone, ".account-status-card span")), "Its label matches the fact labels");
assert.ok(/display: none;/.test(rule(phone, ".account-profile-facts .account-fact-email")) && page.includes('<div className="account-fact-email">'), "The repeated email row is hidden on phones only");
assert.ok(page.includes('<div className="account-fact-sign-in">') && /flex-wrap: wrap;/.test(rule(phone, ".account-profile-facts > div")) && /white-space: nowrap;/.test(rule(phone, ".account-profile-facts span")), "Last sign-in is one row; on the narrowest phones the date drops below its label");
pass("Phones: picture, name and email, then wrapping role tags, then Account status and Last sign-in rows; the email appears once");

// 4. Two-step sign-in: full-width 44px buttons in every state.
assert.ok(/flex-direction: column;/.test(rule(phone, ".account-2fa-heading")), "Buttons sit below the title");
const heading = twoFactor.slice(twoFactor.indexOf('className="account-2fa-heading"'), twoFactor.indexOf("{error &&"));
assert.ok(heading.includes('<div className="account-2fa-actions">') && heading.includes('className="primary-button" onClick={() => setStep({ kind: "password", purpose: "setup" })}'), "Both heading states (set up; recovery codes and Turn off) are covered by the rules below");
const buttons = rule(phone, ".account-2fa-heading > .primary-button,\n  .account-2fa-actions > button,\n  .account-2fa-step > .primary-button");
assert.ok(/width: 100%;/.test(buttons) && /min-height: 44px;/.test(buttons), "Full-width 44px buttons, including Done on the recovery codes step");
assert.ok(/minmax\(150px, 1fr\)/.test(rule(phone, ".account-2fa-actions")), "Two buttons per row when each can be 150px wide, otherwise stacked");
assert.ok(/min-height: 44px;/.test(rule(phone, ".account-2fa-check")) && /height: 44px;/.test(rule(phone, ".account-avatar-close")), "The saved-codes checkbox row and the picture editor's close button are 44px");
pass("Phones: two-step and picture-editor controls are full width or 44px in every state");

console.log(`${passed} My Account phone groups passed.`);
