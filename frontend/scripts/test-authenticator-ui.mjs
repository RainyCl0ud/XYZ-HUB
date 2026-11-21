import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8").then((s) => s.replace(/\r\n?/g, "\n"));
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const login = await read("src/pages/LoginPage.tsx");
const code = await read("src/pages/TwoFactorPage.tsx");
assert.ok(login.includes('"xyz_pending_2fa_method"') && login.includes('result.method ??'), "Sign-in remembers which kind of code to ask for");
assert.ok(code.includes('"Enter your code"') && code.includes('"Check your email"') && code.includes('"Use a recovery code"'));
assert.ok(code.includes("Open your authenticator app and enter the 6-digit code for XYZ Hub."));
assert.ok(code.includes('"/api/auth/two-factor/email-instead"') && code.includes("Email me a code</button>") && code.includes("Use my authenticator app"));
assert.ok(code.includes('autoComplete="one-time-code"') && code.includes('placeholder="XXXX-XXXX"'));
assert.ok(code.includes("sessionStorage.removeItem(KEYS.method)"), "Pending sign-in state is cleared afterwards");
pass("The code screen asks for the right code, offers a recovery code or an emailed code, and cleans up after sign-in");

const shell = await read("src/components/AuthShell.tsx");
assert.ok(shell.includes("description: ReactNode;") && shell.includes("className?: string;"), "The sign-in card can carry a page class and a two-line description");
assert.ok(code.includes('className="auth-card-two-step"') && code.includes('eyebrow="Two-step sign-in"'));
assert.ok(code.includes('<span className="auth-identity">Signing in as {email}</span>'), "People see which account they are signing in to");
assert.ok(code.includes('{email ? "Not you?" : "Need to start over?"}'));
const digitsInput = code.slice(code.indexOf('<input key="digits"'), code.indexOf("/>", code.indexOf('<input key="digits"')));
assert.ok(digitsInput.includes('className="auth-code-boxes-input"') && digitsInput.includes('inputMode="numeric"') && digitsInput.includes('autoComplete="one-time-code"')
  && code.includes("Array.from({ length: CODE_LENGTH }") && code.includes('<span key={index} aria-hidden="true"'), "Six drawn boxes sit over one real input, so paste and autofill still work");
assert.ok(!digitsInput.includes("maxLength") && code.includes('const next = raw.replace(/\\D/g, "").slice(0, CODE_LENGTH);'), "Pasting a spaced code like 123 456 keeps all six digits");
assert.ok(digitsInput.includes("onSelect={keepCaretAtEnd}") && code.includes("input.setSelectionRange(end, end)") && code.includes("const all = input.selectionStart === 0 && input.selectionEnd === end;"),
  "The real caret stays at the end, where the ring is, so a digit can't land mid-code (select-all still allowed)");
assert.ok(code.includes('<label className="auth-sr" htmlFor="two-step-code">'), "Screen readers get a named field");
assert.ok(code.includes("if (next.length === CODE_LENGTH && code.length !== CODE_LENGTH) void verify(next);"), "The sixth digit signs in straight away");
const verifyBody = code.slice(code.indexOf("async function verify("), code.indexOf("function handleSubmit("));
assert.ok(verifyBody.indexOf("if (inFlight.current) return;") >= 0 && verifyBody.indexOf("inFlight.current = true;") < verifyBody.indexOf("await apiRequest") && verifyBody.includes("finally { inFlight.current = false;"), "A code is never sent twice");
assert.ok(verifyBody.includes("if (ENDED_CODES.includes(caught.code ?? \"\")) { sessionStorage.removeItem(KEYS.challenge); setEnded(true); return; }")
  && code.includes('<Link className="auth-submit auth-restart" to="/login" onClick={clearPending}>Sign in again</Link>'), "A locked, expired or used-up sign-in ends in Sign in again instead of taking more codes");
assert.ok(verifyBody.includes("if (recovery) selectInput(); else { setCode(\"\"); focusInput(); }"), "A wrong recovery code stays, selected, for a quick fix");
assert.ok(code.includes('<button className="auth-submit" type="submit" disabled={submitting}>') && !code.includes("disabled={submitting || !ready}"), "Verify stays available and explains what's missing");
assert.ok(code.includes('setError(recovery ? "Enter a recovery code, like 7K4M-9QRT." : "Enter the 6-digit code.")') && code.includes('role="alert">{error}</div>'), "Errors show the message alone, in the bold white-bordered box");
assert.ok(code.includes('<section className="auth-other-ways" aria-labelledby="auth-other-ways-title">') && code.includes(">Other ways to sign in</h2>")
  && (code.match(/className="auth-alt-button"/g) ?? []).length === 2, "Other ways are full-width buttons, not small links");
assert.ok(!code.includes("auth-text-button") && !code.includes("auth-alternatives"));
pass("The code screen is redesigned: six code boxes, a clear account line, one white Verify button and full-width other ways to sign in");

const account = await read("src/pages/AccountPage.tsx");
const card = await read("src/components/AccountTwoFactor.tsx");
assert.ok(account.includes("<AccountTwoFactor />"));
for (const endpoint of ["/api/auth/two-factor", "/api/auth/two-factor/authenticator/setup", "/api/auth/two-factor/authenticator/confirm", "/api/auth/two-factor/recovery-codes", "/api/auth/two-factor/authenticator/disable"]) assert.ok(card.includes(`"${endpoint}"`), endpoint);
assert.ok(card.includes('autoComplete="current-password"') && card.includes("Enter your password to start"), "Every change asks for the password");
assert.ok(card.includes('alt="QR code to add XYZ Hub to your authenticator app"') && card.includes("step.setup.key") && card.includes("open it in your app"));
assert.ok(card.includes("Download as text file") && card.includes("Copy codes") && card.includes("I’ve saved my recovery codes") && card.includes("disabled={!saved}"));
assert.ok(card.includes("Emailed codes stay available as a backup") && card.includes("ask an Owner to reset two-step sign-in"));
assert.ok(!/premium|paid plan|subscription/i.test(card + code), "Only free apps are suggested");
pass("My Account sets up the app with a QR code or key, makes people save recovery codes, and every change needs the password");

const approved = new Set(["#000000", "#0D0D0D", "#141414", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#5C5C5C", "#333333", "#666666"]);
const accountCss = await read("src/pages/AccountPage.css"), authCss = await read("src/pages/AuthPages.css");
const block = accountCss.slice(accountCss.indexOf("/* Two-step sign-in (authenticator app)")) + authCss.slice(authCss.indexOf("/* Two-step sign-in code screen"));
const colours = [...block.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
assert.ok(colours.length && colours.every((c) => approved.has(c)), "Only approved monochrome tokens: " + colours.filter((c) => !approved.has(c)).join(", "));
assert.ok(!/box-shadow|linear-gradient/.test(block) && block.includes(":focus-visible"));
assert.ok(block.includes(".account-2fa-qr { display: block; padding: 8px; background: #FFFFFF"), "The QR code keeps a light background so phones can scan it");
assert.ok(authCss.indexOf("/* Two-step sign-in code screen") > 0 && !authCss.includes(".auth-text-button") && !authCss.includes(".auth-alternatives"));
assert.ok(/\.auth-code-box\.is-active \{\s*border-color: #FFFFFF;\s*outline: 1px solid #FFFFFF;/.test(block) && block.includes(".auth-alt-button:focus-visible {"), "Focus shows on the active code box and on every button");
assert.ok(/@media \(forced-colors: active\) \{\s*\.auth-code-boxes-input \{\s*forced-color-adjust: none;/.test(block) && block.includes("outline: 2px solid Highlight;"), "Windows High Contrast keeps the real input hidden and the focus ring visible");
assert.ok(/\.auth-code-boxes \.auth-code-boxes-input \{\s*font-size: 16px !important;/.test(block), "The hidden input is 16px, beating the global 12.5px rule, so iOS doesn't zoom");
assert.ok(/\.auth-code-boxes \.auth-code-boxes-input:focus-visible \{\s*outline: none;/.test(block), "Focus shows once, on the active box");
assert.ok(/\.auth-card-two-step \.auth-description \{\s*color: #CCCCCC;/.test(block), "Description copy is monochrome");
assert.ok(block.includes("@media (prefers-reduced-motion: reduce)"), "The blinking caret respects reduced motion");
pass("New sign-in styles follow the XYZ web kit: monochrome, no shadows, visible focus, and a scannable QR code");
console.log(`${passed} authenticator UI groups passed.`);
