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
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

try {
  const { default: OwnerClockPage } = await vite.ssrLoadModule("/src/pages/OwnerClockPage.tsx");
  const { ToastProvider } = await vite.ssrLoadModule("/src/components/ToastProvider.tsx");
  const render = entry => renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [entry] },
      createElement(ToastProvider, null, createElement(OwnerClockPage))
    ),
  );

  const overview = render("/clock");
  assert.ok(overview.includes("AGENCY ATTENDANCE"));
  assert.ok(overview.includes("Attendance overview"));
  assert.ok(overview.includes("Review requests"));
  assert.ok(!overview.includes("My requests"));
  assert.ok(!overview.includes("Shift history"));
  assert.ok(!overview.includes("Clock in"));
  assert.ok(!overview.includes("Clock out"));
  pass("Owner sees agency attendance and review only, without individual shift actions or history.");

  const review = render("/clock?tab=review");
  assert.ok(review.includes("Review requests"));
  assert.ok(review.includes("Requests you are currently authorized to review."));
  assert.ok(!review.includes("Request correction"));
  assert.ok(!review.includes("Request missed shift"));
  assert.ok(!review.includes("My requests"));
  pass("Review tab keeps the authorized request queue without an Owner self-request form.");

  const invalidTab = render("/clock?tab=history");
  assert.ok(invalidTab.includes("Agency overview"));
  assert.ok(!invalidTab.includes("Your completed shifts"));
  pass("Old personal-history deep links safely return to the Owner overview.");

  const route = await readFile(resolve(root, "src/pages/ClockWorkspaceRoute.tsx"), "utf8");
  assert.ok(route.includes('role.systemKey === "OWNER"'));
  assert.ok(route.includes("<OwnerClockPage />"));
  assert.ok(route.includes("<ClockPage />"));
  pass("Workspace dispatch is explicitly based on the authenticated OWNER system role.");

  console.log(`${passed} Owner workspace regression groups passed.`);
} finally {
  await vite.close();
}
