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

const page = read("pages/AccountPage.tsx");
const twoFactor = read("components/AccountTwoFactor.tsx");
const hook = read("lib/useMediaQuery.ts");
const css = read("pages/AccountPage.css");
const f4 = read("F4Usability.css");

// The signed-in account, toasts and the screen width come from stubs, so
// the page renders with a fictional account and no session or API.
const stubs = {
  "/src/auth/AuthContext.tsx": "export const useAuth = () => globalThis.__account;\nexport const AuthProvider = ({ children }) => children;",
  "/src/components/ToastProvider.tsx": "export const useToast = () => ({ success() {}, error() {} });\nexport default ({ children }) => children;",
  "/src/lib/useMediaQuery.ts": 'export const PHONE_QUERY = "(max-width: 720px)";\nexport const useMediaQuery = () => globalThis.__isPhone;',
};
const stubPlugin = {
  name: "account-stubs",
  enforce: "pre",
  load(id) {
    const path = id.replace(/\\/g, "/");
    const key = Object.keys(stubs).find((suffix) => path.endsWith(suffix));
    return key ? stubs[key] : undefined;
  },
};

const vite = await createServer({
  root, configFile: false, envDir: false, plugins: [stubPlugin],
  define: { "import.meta.env.VITE_BLOCK2_CHAT_ENABLED": JSON.stringify("true") },
  optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
});

try {
  const AccountPage = (await vite.ssrLoadModule("/src/pages/AccountPage.tsx")).default;
  const roles = [{ id: "role-owner", name: "Owner", systemKey: "OWNER" }, { id: "role-ops", name: "Ops Manager", systemKey: "OPS_MANAGER" }];
  globalThis.__account = {
    user: { id: "fictional-user", name: "Quinn Harper", email: "quinn.harper@example.test", status: "ACTIVE", lastSignInAt: "2026-11-22T15:51:00.000Z", avatarUpdatedAt: null },
    access: { roles, permissions: ["dashboard.view", "chat.access"], canSeeAllModels: true, assignedModelIds: [] },
    refreshAuth: async () => {},
  };
  const render = (isPhone) => {
    globalThis.__isPhone = isPhone;
    return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccountPage)));
  };
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // 1. Phones: a short layout with little text.
  const phone = render(true);
  const at = (needle) => { const i = phone.indexOf(needle); assert.ok(i >= 0, `${needle} renders`); return i; };
  assert.ok(phone.includes('class="page account-page account-page-phone"'), "Phones get their own layout");
  assert.ok(/<h2 class="account-sr-only">\s*My Account\s*<\/h2>/.test(phone), "The page heading is kept for screen readers; the top bar shows the title");
  const order = [at('class="account-phone-profile"'), at('aria-label="Change profile picture"'), at(">Quinn Harper<"), at(">quinn.harper@example.test<"), at(">Owner<"), at(">Ops Manager<"), at('class="account-phone-settings"'), at('class="account-notification-card account-settings-row"'), at('class="account-two-factor account-2fa-compact"'), at('class="account-phone-last-sign-in"')];
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Order: picture, name, email, role tags, then Notification and Two-step sign-in, then the last sign-in");
  for (const removed of ["Personal account", "Review your profile", "Account status", "account-profile-facts", ">Profile<"]) {
    assert.ok(!phone.includes(removed), `Phones don't show "${removed}"`);
  }
  assert.equal((phone.match(/quinn\.harper@example\.test/g) ?? []).length, 1, "The email appears once");
  assert.ok(/Last sign-in Nov 22, 2026, 9:51 AM CST/.test(text(phone)), "Last sign-in is one line");
  assert.ok(/<button type="button" class="account-2fa-row" aria-expanded="false">/.test(phone) && !phone.includes('id="account-2fa-panel"') && !phone.includes("aria-controls"), "Two-step sign-in starts closed as a button row, with no reference to a panel that isn't there");
  assert.ok(!phone.includes('aria-label="Profile"') && !phone.includes('aria-label="Settings"'), "No extra landmark regions for screen readers to wade through");
  assert.ok(phone.includes('<span class="account-2fa-row-chevron" aria-hidden="true"></span>'), "The row's arrow is drawn and silent");
  assert.ok(!phone.includes("!"), "No ! markers");
  pass("Phones: picture, name, email and roles, then Notification and Two-step sign-in rows, then one last sign-in line; nothing else");

  // 2. Desktop is unchanged.
  const desktop = render(false);
  for (const kept of ['class="page-eyebrow"', "Review your profile and current XYZ Management access.", 'class="account-notification-card account-header-notifications"', 'class="account-profile-hero"', "Account status:", 'class="account-fact-email"', 'class="account-fact-sign-in"', 'class="account-2fa-heading"', '<h3 id="account-2fa-title">Two-step sign-in</h3>']) {
    assert.ok(desktop.includes(kept), `Desktop keeps ${kept}`);
  }
  assert.ok(!desktop.includes("account-page-phone") && !desktop.includes("account-2fa-compact"), "Desktop doesn't use the phone layout");
  pass("Desktop keeps its pieces: header with Notification, profile card with status and facts, two-step card");

  // 3. Both layouts render two-step sign-in and the picture editor from one
  // place, so crossing 720px (rotating, resizing, zooming) keeps their state.
  const body = page.slice(page.indexOf("  return (\n    <div className={`page account-page"));
  assert.ok(body.length < page.length, "The shared return is found");
  assert.equal((page.match(/^ {2}return \(/gm) ?? []).length, 1, "One return for both layouts");
  assert.equal((body.match(/<AccountTwoFactor /g) ?? []).length, 1, "Two-step sign-in is rendered from one place");
  assert.ok(body.includes("<AccountTwoFactor compact={isPhone} />") && body.includes('<div className={isPhone ? "account-phone-settings" : "account-settings"}>'), "Same component, same parent, only the style changes");
  assert.equal((body.match(/\{avatarEditor\}/g) ?? []).length, 1, "The picture editor is rendered from one place");
  const lastLine = body.indexOf('{isPhone && (\n        <p className="account-phone-last-sign-in">');
  assert.ok(lastLine > 0 && body.indexOf("{avatarEditor}") < lastLine, "The editor keeps its position; the phone-only line comes after it");
  pass("Crossing 720px keeps a two-step step in progress and an open picture editor (same components, same place)");

  // 4. Two-step sign-in row (source checks; a server render only shows loading).
  const compact = twoFactor.slice(twoFactor.indexOf("if (compact) {"), twoFactor.indexOf("return <section className=\"content-card account-two-factor\""));
  assert.ok(compact.includes('const settled = step.kind === "idle" && !error;') && compact.includes("const open = expanded || !settled;"), "A step in progress or an error keeps the row open");
  assert.ok(compact.includes(': <span className="account-2fa-row">{row}</span>'), "While a step is in progress the row is plain text, so it can't be folded away mid-setup");
  assert.ok(compact.includes('enabled ? "Authenticator app" : "Email codes"'), "The row shows the current method");
  assert.ok(!compact.includes("Sign-in codes come by email") && compact.indexOf("{note}") > compact.indexOf("{open && <div id=\"account-2fa-panel\""), "The long explanation sits inside the panel, shown only after tapping");
  assert.ok(compact.indexOf("{note}") < compact.indexOf("{actions}"), "Opened: the explanation, then the buttons");
  assert.ok(compact.includes('!status ? (error ? "Not available" : "Loading…")') && compact.includes('{!status && error && <button type="button" className="secondary-button" onClick={() => { setError(""); void load(); }}>Try again</button>}'), "If the status can't load, the row says Not available and offers Try again");
  assert.ok(compact.includes('aria-controls={open ? "account-2fa-panel" : undefined}'), "aria-controls only while the panel exists");
  assert.ok(hook.includes('export const PHONE_QUERY = "(max-width: 720px)";') && css.slice(css.indexOf("MY ACCOUNT — READABLE TEXT")).includes("@media (max-width: 720px) {"), "The phone layout switches at the same width as the new phone styles");
  pass("Two-step row (source): shows the method, opens to the explanation then buttons, stays open mid-step, recovers from a failed load");

  // 5. Styles.
  const block = css.slice(css.indexOf("MY ACCOUNT — READABLE TEXT"));
  const phoneCss = block.slice(block.indexOf("@media (max-width: 720px) {"));
  const rule = (source, selector) => {
    const i = source.indexOf(`${selector} {`);
    assert.ok(i >= 0, `${selector} has a rule`);
    return source.slice(i, source.indexOf("}", i));
  };
  for (const [, selector, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
    if (!size) continue;
    if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${selector.trim()})`);
    else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${selector.trim()}: ${size[1]}px)`);
  }
  for (const hex of block.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#666666"].includes(hex.toUpperCase()), `Monochrome token only (${hex})`);
  assert.ok(/\.content-card p,[\s\S]*?font-size: 11\.5px !important;/.test(f4) && /\.account-two-factor \.account-2fa-note,[\s\S]*?font-size: 13px !important;/.test(block), "Desktop two-step text still beats the global card-paragraph cap");
  assert.ok(/align-items: center;/.test(rule(phoneCss, ".account-phone-profile")) && /text-align: center;/.test(rule(phoneCss, ".account-phone-profile")), "The profile is centred");
  assert.ok(/width: 84px;/.test(rule(phoneCss, ".account-phone-profile .account-profile-avatar-button")), "A larger picture");
  assert.ok(/overflow-wrap: anywhere;/.test(rule(phoneCss, ".account-phone-profile h3")) && /overflow-wrap: anywhere;/.test(rule(phoneCss, ".account-phone-profile p")) && /overflow-wrap: anywhere;/.test(rule(phoneCss, ".account-phone-profile .account-role-list span")), "Long names, emails and roles wrap");
  assert.ok(/border-top: 1px solid var\(--border\);/.test(rule(phoneCss, ".account-phone-settings > * + *")), "The two settings rows share one card with a line between them");
  assert.ok(/min-height: 56px;/.test(rule(phoneCss, ".account-phone-settings .account-settings-row")) && /min-height: 56px;/.test(rule(phoneCss, ".account-2fa-row")), "Both rows are 56px tall");
  assert.ok(/inset: -6px -2px;/.test(rule(phoneCss, ".account-settings-row .account-notification-toggle::before")), "The switch has a 44px tap area (32px inner box + 6px above and below)");
  assert.ok(/font-size: 16px !important;/.test(rule(phoneCss, ".account-page-phone .account-two-factor .form-field input")), "Inputs are 16px so iPhones don't zoom on focus");
  assert.ok(/font-size: 13px !important;/.test(rule(phoneCss, ".account-page-phone .account-two-factor button,\n  .account-page-phone .account-avatar-modal-footer button,\n  .account-page-phone .account-avatar-select,\n  .account-page-phone .account-two-factor .form-field > span")), "Buttons and field labels are 13px, above the global caps");
  assert.ok(/outline-offset: 9px;/.test(rule(phoneCss, ".account-phone-profile .account-profile-avatar-button:focus-visible")), "The picture's focus ring clears the camera badge");
  assert.ok(/rotate\(-45deg\)/.test(rule(phoneCss, ".account-2fa-row-chevron")) && /rotate\(45deg\)/.test(rule(phoneCss, '.account-2fa-row[aria-expanded="true"] .account-2fa-row-chevron')), "The arrow points right when closed, down when open");
  assert.ok(/outline: 2px solid #FFFFFF;/.test(rule(phoneCss, "button.account-2fa-row:focus-visible")), "Keyboard focus is a 2px white outline");
  const buttons = rule(phoneCss, ".account-2fa-panel > .primary-button,\n  .account-2fa-actions > button,\n  .account-2fa-step > .primary-button");
  assert.ok(/width: 100%;/.test(buttons) && /min-height: 44px;/.test(buttons) && /flex: none;/.test(rule(phoneCss, ".account-avatar-close")) && /height: 44px;/.test(rule(phoneCss, ".account-avatar-close")), "Buttons are full width and 44px; the picture editor's close button is 44px");
  assert.ok(/color: #8E8E8E;/.test(rule(phoneCss, ".account-phone-last-sign-in")) && /font-size: 13px;/.test(rule(phoneCss, ".account-phone-last-sign-in")), "Last sign-in is a quiet 13px line");
  pass("Phone styles: centred profile, one settings card with 56px rows, 44px targets, 13px text, monochrome");

  console.log(`${passed} My Account phone groups passed.`);
} finally {
  await vite.close();
  delete globalThis.__account;
  delete globalThis.__isPhone;
}
