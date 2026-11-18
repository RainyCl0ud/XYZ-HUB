import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(resolve(root, "src/pages/ChatPage.tsx"), "utf8");
const modal = readFileSync(resolve(root, "src/pages/ChatQuarantineDialog.tsx"), "utf8");
const css = readFileSync(resolve(root, "src/pages/ChatPage.css"), "utf8");

assert.ok(page.includes('onClick={() => setOpenMemberActions((current) => current === m.id ? null : m.id)}'));
assert.ok(page.includes('aria-expanded={openMemberActions === m.id}'));
assert.ok(page.includes('className="creator-chat-member-action-menu"'));
assert.ok(page.includes('onClick={() => {\n                        setOpenMemberActions(null);\n                        setQuarantining(m.quarantine!);'));
console.log("PASS 1: Three-dot menu opens a separate accessible member action, not the quarantine confirmation.");

assert.ok(page.includes('"Quarantine member…"'));
assert.ok(page.includes('"Review / lift quarantine"'));
assert.ok(modal.includes('"Quarantine member?" : "Lift quarantine?"'));
assert.ok(modal.includes('desiredActive ? "Quarantine member" : "Lift quarantine"'));
assert.ok(modal.includes('Reason for {desiredActive ? "quarantining this member" : "lifting quarantine"}'));
console.log("PASS 2: Confirmation and actions explicitly use Quarantine terminology.");

assert.ok(modal.includes('Their staff–management private chat stays open.'));
assert.ok(modal.includes('Login, Clock &amp; Hours and other creators are unaffected.'));
assert.ok(css.includes('.creator-chat-member-action-menu'));
assert.ok(page.includes('if (event.key === "Escape") setOpenMemberActions(null)'));
console.log("PASS 3: Impact, cancellation, keyboard dismissal and member-list styling remain clear.");
