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
const marker = "MY ACCOUNT — READABLE TEXT AND PHONE LAYOUT";
assert.ok(css.includes(marker), "The My Account block exists");
const block = css.slice(css.indexOf(marker));
assert.equal(css.lastIndexOf("@media (max-width: 720px)"), css.indexOf("@media (max-width: 720px)", css.indexOf(marker)), "The block comes last, after the older account rules");
const phone = block.slice(block.indexOf("@media (max-width: 720px) {"));
const allWidths = block.slice(0, block.indexOf("@media (max-width: 720px) {"));
const rule = (source, selector) => {
  const at = source.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} has a rule`);
  return source.slice(at, source.indexOf("}", at));
};

// 1. Readable text at every width.
for (const [, selector, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
  if (!size) continue;
  if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${selector.trim()})`);
  else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${selector.trim()}: ${size[1]}px)`);
}
const important = rule(allWidths, ".account-profile-card .account-profile-copy p,\n.account-two-factor .account-2fa-heading p,\n.account-two-factor .account-2fa-note");
assert.ok(important.includes("font-size: 13px !important;"), "The email and two-step text beat the global !important card-paragraph size (11.5px on phones)");
for (const selector of [".account-status-card span", ".account-profile-facts strong", ".account-notification-card .account-notification-error", ".account-avatar-help"]) {
  assert.ok(allWidths.includes(selector), `${selector} is raised to 13px`);
}
assert.ok(/\.account-status-card \{\s*border-color: #666666;/.test(allWidths), "The status border is monochrome, not tinted");
pass("Text is 13px (11px only for uppercase labels) at every width, and the status border is monochrome");

// 2. Header: title lines up with the cards; Notification is a full-width row.
assert.ok(/align-items: stretch;/.test(rule(phone, ".account-page-header")), "The title is no longer centred (the older rule centred it in the phone column)");
assert.ok(/display: none;/.test(rule(phone, ".account-page-header .page-eyebrow,\n  .account-page-header .page-description")), "Phones skip the small label and intro; the top bar names the page");
const row = rule(phone, ".account-page-header .account-header-notifications");
assert.ok(/display: flex;/.test(row) && /justify-content: space-between;/.test(row) && /min-height: 56px;/.test(row) && /border: 1px solid var\(--border\);/.test(row), "Notification is one bordered row");
assert.ok(/flex: 0 0 auto;/.test(rule(phone, ".account-header-notifications .account-notification-controls")), "The switch stays at the right edge");
assert.ok(toggle.includes('<h3 id="account-notification-title">Notification</h3>') && toggle.includes('aria-label="Notification"'), "The Notification label and switch are unchanged");
pass("Phones: the title lines up with the cards and Notification is one full-width row with the switch on the right");

// 3. Profile: compact header; role and status on one line; email once.
const hero = rule(phone, ".account-profile-hero");
assert.ok(hero.includes('"avatar name name"') && hero.includes('"avatar email email"') && hero.includes('"roles roles status"'), "Picture beside name and email; role and status below");
assert.ok(/display: contents;/.test(rule(phone, ".account-profile-copy")), "The name, email and roles join the profile grid");
assert.ok(/display: none;/.test(rule(phone, ".account-profile-label")), "The PROFILE label is hidden on phones");
assert.ok(/grid-area: status;/.test(rule(phone, ".account-status-card")) && page.includes("Account status:"), "The status keeps its visible words");
assert.ok(/display: none;/.test(rule(phone, ".account-profile-facts .account-fact-email")) && page.includes('<div className="account-fact-email">'), "The repeated email row is hidden on phones only");
assert.ok(page.includes('<div className="account-fact-sign-in">') && /flex-wrap: wrap;/.test(rule(phone, ".account-profile-facts > div")) && /white-space: nowrap;/.test(rule(phone, ".account-profile-facts span")), "Last sign-in is one row; on the narrowest phones the date drops below its label");
pass("Phones: the profile is a compact header, the email appears once, and Last sign-in is one row");

// 4. Two-step sign-in: full-width buttons below the title.
assert.ok(/flex-direction: column;/.test(rule(phone, ".account-2fa-heading")), "The button sits below the title");
const buttons = rule(phone, ".account-2fa-heading > .primary-button,\n  .account-2fa-actions > button");
assert.ok(/width: 100%;/.test(buttons) && /min-height: 44px;/.test(buttons), "44px full-width buttons");
assert.ok(twoFactor.includes('className="primary-button" onClick={() => setStep({ kind: "password", purpose: "setup" })}>Set up authenticator app</button>'), "The setup button is a direct child of the heading");
pass("Phones: two-step sign-in buttons are full width and 44px tall");

console.log(`${passed} My Account phone groups passed.`);
