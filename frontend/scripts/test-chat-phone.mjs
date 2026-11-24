import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Chat on phones (25 Nov 2026): it opens on the conversation list, keeps
// Unread only, New channel and Staff announcements in one menu, and shows a
// conversation full width with a back arrow and a compact composer.
// Chat needs a live server, so behaviour is read from the code and styles;
// it was also checked signed in on a local copy.

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(resolve(src, path), "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

const page = read("pages/ChatPage.tsx");
const css = read("pages/ChatPage.css");

// 1. The list first, and only on phones.
assert.ok(page.includes('import { PHONE_QUERY, useMediaQuery } from "../lib/useMediaQuery";') && /const isPhone = useMediaQuery\(PHONE_QUERY\);/.test(page), "Chat knows when it's on a phone (720px and below)");
assert.ok(/const \[showChannels, setShowChannels\] = useState\(\(\) =>\s*typeof window !== "undefined" && window\.matchMedia\(PHONE_QUERY\)\.matches && !linkedConversation && !retainedConversation\);/.test(page), "Phones open on the conversation list, unless a link names a conversation or retained history");
assert.ok(/if \(chatLayoutIsPhone !== isPhone\) \{\s*setChatLayoutIsPhone\(isPhone\);\s*setShowChannels\(false\);\s*setBrowseMenuOpen\(false\);\s*\}/.test(page), "Crossing 720px leaves the list (desktop shows both) and closes the menu, so reading isn't left paused");
assert.ok(page.includes('<section className={`creator-chat${isPhone ? " creator-chat-phone" : ""}`} aria-label="Chat workspace">'), "The phone styles hang off a class only phones render");
assert.ok(/onClick=\{\(\) => \{ openConversation\(c\.id\); setShowChannels\(false\); \}\}/.test(page), "Tapping a conversation opens it");
pass("Phones open on the list; links still open their conversation; desktop is unaffected");

// 2. One menu for the list's extra actions.
const menu = page.slice(page.indexOf("{isPhone && <PhoneActionMenu"), page.indexOf("]} />}", page.indexOf("{isPhone && <PhoneActionMenu")));
assert.ok(menu.includes('label="More conversation list actions" panelId="chat-browse-menu-panel"'), "A named ⋯ menu sits beside the creator picker, on phones only");
assert.ok(menu.includes('label: unreadOnly ? "Show all conversations" : "Show unread only", onSelect: () => setUnreadOnly(!unreadOnly)'), "Unread only is switched from the menu, saying what it will do");
assert.ok(menu.includes('...(browseArea?.canManage && channelFilter === "channels" ? [{ key: "new-channel", label: "New channel", onSelect: () => openChannelSettings({ modelId: browseArea.modelId, name: "" }) }] : [])') && page.includes('{browseArea?.canManage && channelFilter === "channels" && <button type="button" onClick={() => openChannelSettings({ modelId: browseArea.modelId, name: "" })}>+ New channel</button>}'), "New channel shows under the same condition as desktop's button and opens the same settings");
assert.ok(menu.includes('...(canAnnounce ? [{ key: "announcements", label: "Staff announcements", onSelect: () => { setShowChatOptions(false); setShowAnnouncements(true); } }] : [])'), "Staff announcements (desktop's Chat options) is in the menu for people who can announce");
pass("Unread only, New channel and Staff announcements live in one ⋯ menu, with desktop's conditions");

// 3. A conversation: back to the list, and its creator.
assert.ok(page.includes('className="creator-chat-mobile creator-chat-browse-button" onClick={() => { setShowMobileActions(false); setShowMembers(false); setShowChannels(true); }} aria-label="Back to conversations"><ChatIcon name="back" /></button>'), "A back arrow (not a second ☰) returns to the list");
assert.ok(page.includes('back: "m15 18-6-6 6-6",'), "The back icon is a left chevron");
assert.ok(page.includes('{isPhone && area && <p className="creator-chat-channel-area">{area.name}</p>}'), "Phones show the creator under the conversation's name");
pass("A conversation has a back arrow and names its creator");

// 4. Styles.
const ours = css.slice(css.indexOf("CHAT ON PHONES (25 Nov 2026)"));
const mediaStart = ours.indexOf("@media (max-width: 720px) {");
let depth = 0, mediaEnd = -1;
for (let i = mediaStart; i < ours.length; i += 1) {
  if (ours[i] === "{") depth += 1;
  if (ours[i] === "}" && --depth === 0) { mediaEnd = i; break; }
}
assert.ok(mediaStart > 0 && mediaEnd > mediaStart, "The phone styles sit in one 720px block");
const phoneCss = ours.slice(mediaStart, mediaEnd + 1);
const outside = (ours.slice(0, mediaStart) + ours.slice(mediaEnd + 1)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^*]*\*\//, "");
assert.deepEqual([...outside.matchAll(/([^{}]+)\{/g)].map(([, s]) => s.trim()), [], "Nothing in this block applies above 720px");
const squash = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
const rules = [...phoneCss.slice(phoneCss.indexOf("{") + 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, list, body]) => ({ selectors: squash(list).split(",").map((s) => s.trim()), body }));
for (const { selectors } of rules) for (const selector of selectors) assert.ok(selector.startsWith(".creator-chat.creator-chat-phone"), `Scoped to phones' class: ${selector}`);
const rule = (selector) => {
  const bodies = rules.filter(({ selectors }) => selectors.includes(selector)).map(({ body }) => body);
  assert.ok(bodies.length, `${selector} has a rule`);
  return bodies.join("\n");
};
const p = (s) => `.creator-chat.creator-chat-phone ${s}`;
for (const { selectors, body } of rules) {
  const size = body.match(/font-size: (\d+(?:\.\d+)?)px/);
  if (!size) continue;
  if (Number(size[1]) === 11) assert.ok(/text-transform: uppercase;/.test(body), `11px only for uppercase labels (${selectors.join(", ")})`);
  else assert.ok(Number(size[1]) >= 13, `Text is 13px or larger (${selectors.join(", ")}: ${size[1]}px)`);
}
for (const hex of phoneCss.match(/#[0-9a-f]{3,8}\b/gi) ?? []) assert.ok(["#000000", "#0D0D0D", "#141414", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#5C5C5C", "#333333", "#666666"].includes(hex.toUpperCase()), `Only the design reference's greys (${hex})`);
assert.ok(!/gradient|box-shadow|\b(?:rgba?|hsla?)\(/.test(phoneCss), "No shadows, gradients or other colour notations");

assert.ok(/padding: 0;/.test(rule(".creator-chat.creator-chat-phone")) && /border: 0;/.test(rule(p(".creator-chat-shell"))), "Chat fills the width, with no box around it");
assert.ok(/display: none;/.test(rule(".creator-chat.creator-chat-phone > .creator-chat-heading")) && /display: none;/.test(rule(p(".creator-chat-channel-heading"))) && /display: none;/.test(rule(p(".creator-chat-browse-footer"))), "Chat options, the list's title row and the New channel footer give their space back (their actions are in ⋯)");
assert.ok(/grid-template-columns: minmax\(0, 1fr\) 44px;/.test(rule(p(".creator-chat-browse-tools"))) && /grid-column: 2;/.test(rule(p(".creator-chat-browse-tools > .phone-action-menu"))) && /grid-column: 1 \/ -1;/.test(rule(p(".creator-chat-browse-switcher"))), "The picker and ⋯ share the first row; the tabs take the full width below");
assert.ok(/clip: rect\(0 0 0 0\);/.test(rule(p(".creator-chat-field-label"))), "The picker's label stays for screen readers");
const picker = rule(p("#chat-workspace"));
assert.ok(/min-height: 44px;/.test(picker) && /font-size: 16px !important;/.test(picker) && /background-image: url\("data:image\/svg\+xml/.test(picker), "The creator picker is 44px, 16px (no iPhone zoom), with a chevron");
assert.ok(/min-height: 44px;/.test(rule(p(".creator-chat-browse-switcher .creator-chat-filters button"))) && /flex: 1 1 0;/.test(rule(p(".creator-chat-browse-switcher .creator-chat-filters button"))), "Channels and Private share the width at 44px");
assert.ok(/display: none;/.test(rule(p(".creator-chat-unread-filter"))) && /display: block;/.test(rule(p('.creator-chat-unread-filter[aria-pressed="true"]'))) && /min-height: 44px;/.test(rule(p('.creator-chat-unread-filter[aria-pressed="true"]'))), "Unread only shows only while it's on, as a 44px button that turns it off");
const row = rule(p(".creator-chat-channel-row"));
assert.ok(/min-height: 50px;/.test(row) && /font-size: 15px !important;/.test(row) && /font-weight: 700;/.test(rule(p(".creator-chat-channel-row:has(.creator-chat-unread-count)"))) && /background: #FFFFFF;/.test(rule(p(".creator-chat-unread-count"))), "Rows are 50px at 15px; unread ones are bold with a white count");
assert.ok(/width: 44px;/.test(rule(p(".creator-chat-browse-button"))) && /height: 44px;/.test(rule(p(".creator-chat-browse-button"))) && /min-height: 44px;/.test(rule(p(".creator-chat-members-toggle"))), "Back, Members and ⋯ are 44px");
assert.ok(/font-size: 13px;/.test(rule(p(".creator-chat-channel-area"))) && /text-overflow: ellipsis;/.test(rule(p(".creator-chat-channel-area"))), "The creator's name sits under the conversation in grey");
const actions = rule(p(".creator-chat-composer-bar .creator-chat-send"));
assert.ok(/width: 44px !important;/.test(actions) && /height: 44px !important;/.test(actions), "+ and send are 44px squares, leaving the field the rest of the row");
assert.ok(/font-size: 16px !important;/.test(rule(p(".creator-chat-composer-bar textarea"))) && /min-height: 44px;/.test(rule(p(".creator-chat-composer-bar textarea"))), "The message field is 16px so iPhones don't zoom");
assert.ok(/display: none;/.test(rule(p(".creator-chat-composer-footer > small:not(.creator-chat-limit)"))) && /display: none;/.test(rule(p(".creator-chat-composer-footer:not(:has(.creator-chat-limit))"))), "The @ hint row goes; the length warning near the limit stays");
pass("Phone styles: full width, one row for picker and ⋯, 50px rows, 44px controls, 16px fields, design greys");

console.log(`${passed} Chat phone groups passed.`);
