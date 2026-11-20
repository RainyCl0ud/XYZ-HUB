import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.HUB_TEST_ORIGIN || "http://127.0.0.1:4198";
assert.equal(new URL(origin).hostname, "127.0.0.1", "Use a local fixture, never shared staging data.");
const out = resolve(process.env.HUB_TEST_OUTPUT || "../../outputs/site-toast-browser");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let grant = null, failGrant = false, writes = 0, roleMode = "chatter";
let signedIn = true;
const fixtureDate = "2026-11-19T12:00:00.000Z";
const user = { id: "toast-user", name: "Casey Example", email: "casey@example.test", status: "ACTIVE", lastSignInAt: fixtureDate, avatarUpdatedAt: fixtureDate };
const access = { roles: [{ id: "owner", name: "Owner", systemKey: "OWNER", rank: 1, dataScope: "ALL" }], highestRank: 1, effectiveDataScope: "ALL", permissions: ["dashboard.view", "chat.access"], assignedModelIds: [], canSeeAllModels: true };
const toast = text => page.locator(".toast").filter({ hasText: text });
async function dismiss() { const buttons = page.getByRole("button", { name: "Dismiss notification", exact: true }); while (await buttons.count()) await buttons.first().click(); }
await page.route(origin + "/toast-*", async route => {
  const response = await route.fetch(), html = await response.text();
  assert.ok(html.includes("/src/main.tsx"), "Run the local Vite development server for this fixture.");
  return route.fulfill({ response, body: html.replace("/src/main.tsx", "/scripts/fixtures/site-action-toasts.tsx") });
});
await page.route("**/api/**", async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...headers, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET,PUT,PATCH,POST,DELETE" } });
  const json = (body, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) });
  if (path === "/api/auth/me") return signedIn ? json({ user, access }) : json({ error: "UNAUTHENTICATED" }, 401);
  if (path === "/api/auth/avatar" && req.method() === "DELETE") { user.avatarUpdatedAt = null; return json({ success: true }); }
  if (path === "/api/auth/avatar" && req.method() === "PUT") { user.avatarUpdatedAt = fixtureDate; return json({ success: true }); }
  if (path === "/api/access/models") return json({ models: [], canSeeAllModels: true });
  if (path === "/api/chat/unread") return json({ totalUnread: 0, totalUnreadMentions: 0, conversations: [] });
  if (path === "/api/chat/browser-notifications") return json({ enabled: false, userId: user.id, limitedScope: false, messages: [], serverTime: fixtureDate });
  if (path === "/api/auth/password-reset/request") return json({ status: "PASSWORD_RESET_REQUEST_ACCEPTED", message: "If an account uses this address, reset instructions are on the way." });
  if (path === "/api/auth/password-reset/validate") return json({ status: "VALID_PASSWORD_RESET" });
  if (path === "/api/auth/password-reset/complete") return json({ status: "PASSWORD_RESET_COMPLETED" });
  if (path === "/api/invites/validate") return json({ status: "VALID_INVITE", invite: { name: "Casey Example", email: "casey@example.test", expiresAt: "2027-03-01T00:00:00Z" } });
  if (path === "/api/invites/accept") return json({ status: "INVITE_ACCEPTED" });
  if (req.method() === "PUT") { writes++; if (failGrant) return route.fulfill({ status: 400, headers, body: JSON.stringify({ message: "Permission change was not saved." }) }); grant = JSON.parse(req.postData()); }
  const body = path.endsWith("/grants") ? { roles: [{ id: roleMode, name: roleMode === "ops" ? "Ops Manager" : roleMode === "manager" ? "Manager" : "Chatter", siteWideAccess: { canView: roleMode !== "chatter", canPost: roleMode === "ops" }, grant }], people: [] } : { success: true };
  return route.fulfill({ headers, body: JSON.stringify(body) });
});
try {
  await page.goto(origin + "/toast-ui");
  await page.getByRole("textbox", { name: "Channel name", exact: true }).fill("Updated channel");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await toast("Channel name saved.").waitFor(); assert.equal(await page.locator(".toast").count(), 1);
  assert.equal(await page.locator(".creator-chat-settings-success").count(), 0); await dismiss();
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByLabel("Role access for Chatter").selectOption("post");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toast("Access saved for Chatter.").waitFor(); assert.equal(writes, 1); assert.equal(await page.locator(".toast").count(), 1);
  await page.screenshot({ path: out + "/permission-toast.png", animations: "disabled" }); await dismiss();
  failGrant = true; await page.getByLabel("Role access for Chatter").selectOption("view"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Permission change was not saved." }).waitFor(); assert.equal(await page.locator(".toast-success").count(), 0);
  failGrant = false; await page.getByRole("button", { name: "Save", exact: true }).click(); await toast("Access saved for Chatter.").waitFor(); assert.equal(await page.locator(".toast").count(), 1); await dismiss();
  console.log("PASS: actual channel name and permission actions emit one toast, failures retain validation and never claim success, and retry succeeds.");
  roleMode = "ops"; grant = { canView: false, canPost: false }; await page.reload();
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  const opsAccess = page.getByLabel("Role access for Ops Manager"); await opsAccess.waitFor();
  assert.equal(await opsAccess.textContent(), "Can post"); assert.equal(await opsAccess.evaluate(n => n.tagName), "SPAN");
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0);
  assert.equal(await page.getByText("Site-wide role access", { exact: true }).count(), 1);
  await page.screenshot({ path: out + "/ops-inherited-post.png", animations: "disabled" });
  roleMode = "manager"; grant = null; await page.reload(); await page.getByRole("button", { name: "Permissions", exact: true }).click();
  const managerAccess = page.getByLabel("Role access for Manager"); assert.equal(await managerAccess.inputValue(), "view");
  assert.ok(await managerAccess.locator('option[value="none"]').isDisabled());
  await managerAccess.selectOption("post"); await page.getByRole("button", { name: "Save", exact: true }).click(); await toast("Access saved for Manager.").waitFor(); await dismiss();
  assert.equal(await managerAccess.inputValue(), "post");
  console.log("PASS: inherited Ops access displays Can post without editable grant controls; inherited See cannot be removed but can receive a Post grant.");

  await page.getByRole("button", { name: "Open test dialog", exact: true }).click(); const modal = page.getByRole("dialog", { name: "Test dialog", exact: true });
  await modal.getByRole("button", { name: "Save dialog change", exact: true }).click(); await toast("Dialog change saved.").waitFor();
  assert.ok(await modal.getByRole("button", { name: "Save dialog change", exact: true }).evaluate(n => n === document.activeElement), "A toast must not steal focus from the form");
  assert.ok(await page.locator(".toast-region").evaluate(n => n.matches(":popover-open") && n.closest("dialog")?.matches(":modal")));
  const bounds = await page.locator(".toast-region").boundingBox(); assert.ok(bounds.y <= 24 && bounds.x + bounds.width <= 1440);
  await dismiss(); assert.ok(await modal.isVisible());
  await modal.getByRole("button", { name: "Open nested dialog", exact: true }).click(); const nested = page.getByRole("dialog", { name: "Nested test dialog", exact: true });
  await nested.getByRole("button", { name: "Save dialog change", exact: true }).click(); await toast("Nested change saved.").waitFor(); await dismiss();
  await nested.getByRole("button", { name: "Close test dialog", exact: true }).click(); await modal.getByRole("button", { name: "Save dialog change", exact: true }).click();
  await modal.getByRole("button", { name: "Close test dialog", exact: true }).click(); await toast("Dialog change saved.").waitFor();
  await page.getByRole("link", { name: "Another page", exact: true }).click(); await page.getByRole("heading", { name: "Another page" }).waitFor(); await toast("Dialog change saved.").waitFor(); await dismiss();
  console.log("PASS: toasts remain above native and nested dialogs, stay dismissible, and survive closing a dialog and route navigation without taking focus.");

  await page.getByRole("button", { name: "Show timed toast" }).click(); await toast("Timed confirmation.").waitFor(); await toast("Timed confirmation.").waitFor({ state: "hidden" });
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Save page", exact: true }).click(); assert.equal(await page.locator(".toast").count(), 5); await dismiss();
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Save page", exact: true }).click();
  const mobile = await page.locator(".toast-region").boundingBox(); assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390 && mobile.y >= 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: out + "/toast-mobile.png", animations: "disabled" }); await dismiss();
  console.log("PASS: auto-dismiss, five-toast queue bounds and mobile placement work.");

  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(origin + "/account");
  await page.getByRole("button", { name: "Change profile picture", exact: true }).click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click(); await toast("Profile picture removed.").waitFor();
  assert.equal(await page.locator(".toast").count(), 1); await dismiss();
  await page.getByRole("button", { name: "Change profile picture", exact: true }).click();
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 128; const context = c.getContext("2d"); context.fillStyle = "#4c5974"; context.fillRect(0, 0, 128, 128); return c.toDataURL("image/png").split(",")[1]; });
  await page.locator('input[type="file"]').setInputFiles({ name: "fixture-avatar.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.getByRole("button", { name: "Save photo", exact: true }).click(); await toast("Profile picture updated.").waitFor(); assert.equal(await page.locator(".toast").count(), 1); await dismiss();
  console.log("PASS: actual account avatar save/removal show one global toast after the editor closes.");

  signedIn = false; await page.goto(origin + "/forgot-password"); await page.getByRole("textbox", { name: "Email address", exact: true }).fill("casey@example.test");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click(); await toast("reset instructions are on the way.").waitFor();
  assert.equal(await page.locator(".auth-message-success").count(), 0); assert.equal(await page.locator(".toast").count(), 1);
  await page.goto(origin + "/reset-password#token=fictional-local-reset"); await page.locator('input[type="password"]').first().waitFor();
  for (const field of await page.locator('input[type="password"]').all()) await field.fill("FixtureOnly-Password123!");
  await page.locator('button[type="submit"]').click(); await toast("Password updated.").waitFor(); await page.getByRole("heading", { name: "Password updated", exact: true }).waitFor();
  assert.equal(await page.locator(".auth-message-success").count(), 0);
  await page.goto(origin + "/invite#token=fictional-local-invite"); await page.locator('input[type="password"]').first().waitFor();
  for (const field of await page.locator('input[type="password"]').all()) await field.fill("FixtureOnly-Password123!");
  await page.locator('button[type="submit"]').click(); await toast("Account setup completed.").waitFor(); await page.getByRole("heading", { name: "Your account is ready", exact: true }).waitFor();
  assert.equal(await page.locator(".auth-message-success").count(), 0);
  console.log("PASS: password recovery, password reset and invitation completion use toast confirmations while retaining next-step pages.");
} catch (error) { await page.screenshot({ path: out + "/failure.png", fullPage: true }); throw error; }
finally { await browser.close(); }
