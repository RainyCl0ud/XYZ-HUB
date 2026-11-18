import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(resolve(root, "src/pages/ChatPage.tsx"), "utf8");
const member = readFileSync(resolve(root, "src/pages/ChatMemberActions.tsx"), "utf8");
const message = readFileSync(resolve(root, "src/pages/ChatMessageTools.tsx"), "utf8");
const modal = readFileSync(resolve(root, "src/pages/ChatQuarantineDialog.tsx"), "utf8");
const css = readFileSync(resolve(root, "src/pages/ChatPage.css"), "utf8");

assert.ok(page.includes('<ChatMemberActions target={m.quarantine} onQuarantine={setQuarantining} />'));
assert.ok(member.includes("createPortal("));
assert.ok(member.includes("document.body"));
assert.ok(member.includes("creator-chat-action-popover creator-chat-member-action-popover"));
assert.ok(message.includes("className=\"creator-chat-action-popover\""));
assert.ok(!page.includes("creator-chat-member-action-menu"));
assert.ok(!css.includes(".creator-chat-member-entry"));
console.log("PASS 1: Member More menu uses the same portaled popover as message actions; it never shifts member rows.");

assert.ok(member.includes('aria-expanded={open}'));
assert.ok(member.includes('aria-controls={popupId}'));
assert.ok(member.includes("getBoundingClientRect()"));
assert.ok(member.includes("window.innerWidth - width - 8"));
assert.ok(member.includes('document.addEventListener("pointerdown", outside)'));
assert.ok(member.includes('document.addEventListener("scroll", scroll, true)'));
assert.ok(member.includes('window.addEventListener("resize", resize)'));
assert.ok(member.includes('event.key !== "Escape"'));
assert.ok(member.includes('trigger.current?.focus({ preventScroll: true })'));
console.log("PASS 2: Floating menu is anchored, viewport-clamped, keyboard-accessible and dismissible.");

assert.ok(member.includes('"Quarantine member…"'));
assert.ok(member.includes('"Review / lift quarantine"'));
assert.ok(member.includes("setOpen(false); onQuarantine(target);"));
assert.ok(modal.includes('"Quarantine member?" : "Lift quarantine?"'));
assert.ok(modal.includes('desiredActive ? "Quarantine member" : "Lift quarantine"'));
console.log("PASS 3: Three-dot button only opens the menu; choosing Quarantine opens its confirmation.");

assert.ok(modal.includes("Their staff–management private chat stays open."));
assert.ok(modal.includes("Login, Clock &amp; Hours and other creators are unaffected."));
console.log("PASS 4: Dialog impact and Block 2 quarantine behavior remain clear.");
