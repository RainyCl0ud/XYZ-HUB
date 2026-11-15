import assert from "node:assert/strict";
import { publishChatChange, subscribeChatChanges } from "../src/services/chat-live-events.js";

// The in-memory bus must not perform requests, query a database or disclose
// message contents; it only wakes the authorized HTTP read path.
const received: string[] = [];
const stopA = subscribeChatChanges("channel-a", () => received.push("a1"));
const stopA2 = subscribeChatChanges("channel-a", () => received.push("a2"));
const stopB = subscribeChatChanges("channel-b", () => received.push("b"));
assert.ok(stopA && stopA2 && stopB);
publishChatChange("channel-a");
assert.deepEqual(received, ["a1", "a2"]);
publishChatChange("channel-b");
assert.deepEqual(received, ["a1", "a2", "b"]);
console.log("PASS 1: Change signals are scoped to the subscribed conversation.");

stopA();
publishChatChange("channel-a");
assert.deepEqual(received, ["a1", "a2", "b", "a2"]);
stopA2(); stopB();
publishChatChange("channel-a");
assert.deepEqual(received, ["a1", "a2", "b", "a2"]);
console.log("PASS 2: Closing a connection unsubscribes without affecting other conversations.");

const many = Array.from({ length: 150 }, () => subscribeChatChanges("crowded", () => {}));
assert.ok(many.every(Boolean));
assert.equal(subscribeChatChanges("crowded", () => {}), null);
many[0]!();
const again = subscribeChatChanges("crowded", () => {});
assert.ok(again);
again!();
many.slice(1).forEach((off) => off?.());
console.log("PASS 3: Live subscriptions are capped and slots are released.");

let safe = 0;
const fail = subscribeChatChanges("safe", () => { throw new Error("Disconnected"); });
const healthy = subscribeChatChanges("safe", () => { safe++; });
assert.ok(fail && healthy);
assert.doesNotThrow(() => publishChatChange("safe"));
assert.equal(safe, 1);
fail(); healthy();
console.log("PASS 4: One disconnected subscriber cannot fail the write or another viewer.");
console.log("4 in-memory Chat realtime bus groups passed.");
