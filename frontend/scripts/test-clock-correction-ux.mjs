import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
  root,
  configFile: false,
  envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  esbuild: { jsx: "automatic" },
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
let passed = 0;
function pass(description) { console.log(`PASS ${++passed}: ${description}`); }

try {
  const { RequestForm, DecisionForm } = await vite.ssrLoadModule("/src/components/ClockCorrections.tsx");
  const { ToastProvider } = await vite.ssrLoadModule("/src/components/ToastProvider.tsx");
  const render = element => renderToStaticMarkup(createElement(ToastProvider, null, element));
  const noop = () => {};

  const emptyRequest = render(createElement(RequestForm, { shift: null, onClose: noop, onSaved: noop }));
  assert.ok(emptyRequest.includes("Times use US Central (CDT/CST), not your device"));
  assert.ok(emptyRequest.includes("Current US Central time"));
  assert.ok(emptyRequest.includes("Request a missed shift"));
  pass("Correction forms distinguish device time from live US Central time.");

  const farFuture = {
    id: "future-shift", recordVersion: "v1",
    startedAt: "2099-11-10T16:00:00.000Z",
    endedAt: "2099-11-10T17:00:00.000Z", breaks: [],
  };
  const futureRequest = render(createElement(RequestForm, { shift: farFuture, onClose: noop, onSaved: noop }));
  assert.ok(futureRequest.includes("later than the current US Central time"));
  assert.ok(futureRequest.includes('aria-invalid="true"'));
  pass("Future timestamps are marked invalid next to the corresponding input.");

  const item = {
    id: "test-request", personName: "Sample Chatter",
    kind: "SHIFT_TIMES", status: "PENDING", reason: "Test correction",
    before: { startedAt: "2025-11-10T16:00:00.000Z", endedAt: "2025-11-10T20:00:00.000Z", breaks: [] },
    proposed: { startedAt: "2025-11-10T15:00:00.000Z", endedAt: "2025-11-10T20:00:00.000Z", breaks: [] },
    submittedAt: "2025-11-11T00:00:00.000Z", reviewerName: null, reviewNote: null,
    reviewedAt: null, stale: false, subjectAvailable: true, route: "Assigned Manager or Owner review",
  };
  const ownDecision = render(createElement(DecisionForm, {
    item, decision: "CANCELLED", own: true, onClose: noop, onSave: async () => {},
  }));
  assert.ok(ownDecision.includes("Your reason"));
  assert.ok(!ownDecision.includes("Sample Chatter"));
  pass("Personal cancellation confirmation never repeats the signed-in employee name.");

  const managerDecision = render(createElement(DecisionForm, {
    item, decision: "APPROVED", own: false, onClose: noop, onSave: async () => {},
  }));
  assert.ok(managerDecision.includes("Sample Chatter"));
  assert.ok(managerDecision.includes("Employee’s reason"));
  pass("Reviewer decisions retain employee identity and review context.");

  console.log(`${passed} Clock correction UX regression groups passed.`);
} finally {
  await vite.close();
}
