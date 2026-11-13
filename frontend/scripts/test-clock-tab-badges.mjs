import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
  root,
  configFile: false,
  envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  esbuild: { jsx: "automatic" },
  define: { "import.meta.env.VITE_BLOCK2_CLOCK_ENABLED": JSON.stringify("true") },
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
let passed = 0;
function pass(title) { console.log(`PASS ${++passed}: ${title}`); }

try {
  const { default: ClockTabs } = await vite.ssrLoadModule("/src/components/ClockTabs.tsx");
  const { default: SidebarNavigation } = await vite.ssrLoadModule("/src/components/SidebarNavigation.tsx");
  const { ClockReviewCountContext } = await vite.ssrLoadModule("/src/components/ClockReviewCountContext.ts");

  const reviewer = {
    permissions: ["clock.access", "clock.self.view", "clock.corrections.all"],
    roles: [{ systemKey: "OWNER" }],
    canSeeAllModels: true,
  };
  const staff = {
    permissions: ["clock.access", "clock.self.view", "clock.self.track"],
    roles: [{ systemKey: "CHATTER" }],
    canSeeAllModels: false,
  };
  const render = (value, access, mode = "staff", canReview = true, activeTab = "overview") =>
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/clock"] },
      createElement(ClockReviewCountContext.Provider, { value },
        createElement("div", null,
          createElement(ClockTabs, { mode, canReview, activeTab }),
          createElement(SidebarNavigation, { access }),
        ),
      ),
    ));

  const withPending = render(5, reviewer);
  assert.ok(withPending.includes('class="clock-tab-count"'));
  assert.ok(withPending.includes('class="hub-nav-action-count"'));
  assert.ok(withPending.includes("5 pending correction requests"));
  assert.ok(withPending.includes("Open 5 pending correction requests"));
  assert.equal((withPending.match(/clock-tab-count/g) ?? []).length, 1);
  pass("Sidebar and Review Requests tab display the same authorized pending count.");

  const owner = render(5, reviewer, "owner");
  assert.ok(owner.includes("Attendance overview"));
  assert.ok(owner.includes("Review requests"));
  assert.ok(!owner.includes("My requests"));
  assert.ok(!owner.includes("Shift history"));
  assert.ok(owner.includes('class="clock-tab-count"'));
  pass("Owner retains only Attendance Overview and Review Requests, with the count on Review.");

  const empty = render(0, reviewer);
  assert.ok(!empty.includes('class="clock-tab-count"'));
  assert.ok(!empty.includes('class="hub-nav-action-count"'));
  pass("Zero pending requests do not create decorative notification badges.");

  const restricted = render(5, staff, "staff", false);
  assert.ok(!restricted.includes("Review requests"));
  assert.ok(!restricted.includes('class="clock-tab-count"'));
  assert.ok(!restricted.includes('class="hub-nav-action-count"'));
  pass("Unauthorized staff see neither the review tab nor a stale notification count.");

  const capped = render(145, reviewer, "staff", true, "review");
  assert.ok(capped.includes("99+"));
  assert.ok(capped.includes("145 pending correction requests"));
  assert.ok(capped.includes("Open 145 pending correction requests"));
  assert.ok(capped.includes('aria-current="page"'));
  pass("Large review counts are visually capped without losing accessible exact totals.");

  // The provider fetches once for all subscribers and invalidates requests
  // across accounts, permission changes, focus changes, and local approvals.
  const provider = await readFile(resolve(root, "src/components/ClockReviewCountProvider.tsx"), "utf8");
  const sidebar = await readFile(resolve(root, "src/components/SidebarNavigation.tsx"), "utf8");
  for (const required of [
    "useAuth()",
    "accountScope",
    "controller.signal.aborted",
    'window.addEventListener("xyz-clock-corrections-changed", read)',
    "assignedModelIds",
    "role.systemKey",
    '"/api/clock/corrections?scope=review&filter=pending"',
  ]) assert.ok(provider.includes(required), `Missing count provider safety guard: ${required}`);
  assert.ok(!sidebar.includes('"/api/clock/corrections?scope=review&filter=pending"'));
  pass("A single shared provider owns review polling, account-scoped invalidation and event refresh.");

  console.log(`${passed} Clock navigation badge regression groups passed.`);
} finally {
  await vite.close();
}
