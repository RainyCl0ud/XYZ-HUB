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
assert.ok(code.includes('"Enter your authenticator code"') && code.includes('"Check your email"'));
assert.ok(code.includes("Google Authenticator, Apple Passwords or Bitwarden Authenticator"));
assert.ok(code.includes('"/api/auth/two-factor/email-instead"') && code.includes("Email me a code instead") && code.includes("Use a recovery code"));
assert.ok(code.includes('autoComplete="one-time-code"') && code.includes('placeholder="XXXX-XXXX"'));
assert.ok(code.includes("sessionStorage.removeItem(KEYS.method)"), "Pending sign-in state is cleared afterwards");
pass("The code screen asks for the right code, offers a recovery code or an emailed code, and cleans up after sign-in");

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
const block = accountCss.slice(accountCss.indexOf("/* Two-step sign-in (authenticator app)")) + authCss.slice(authCss.indexOf("/* Authenticator sign-in alternatives"));
const colours = [...block.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
assert.ok(colours.length && colours.every((c) => approved.has(c)), "Only approved monochrome tokens: " + colours.filter((c) => !approved.has(c)).join(", "));
assert.ok(!/box-shadow|linear-gradient/.test(block) && block.includes(":focus-visible"));
assert.ok(block.includes(".account-2fa-qr { display: block; padding: 8px; background: #FFFFFF"), "The QR code keeps a light background so phones can scan it");
pass("New sign-in styles follow the XYZ web kit: monochrome, no shadows, visible focus, and a scannable QR code");
console.log(`${passed} authenticator UI groups passed.`);
