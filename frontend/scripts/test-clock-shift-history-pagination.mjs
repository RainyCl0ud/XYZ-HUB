import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const pass = title => console.log(`PASS ${++passed}: ${title}`);
const makeShift = index => ({
  id: `history-${index}`,
  recordVersion: `v-${index}`,
  correctionCount: index === 0 ? 1 : 0,
  personName: "Test Employee",
  startedAt: new Date(Date.UTC(2025, 10, 1) - index * 86_400_000).toISOString(),
  endedAt: new Date(Date.UTC(2025, 10, 1) - index * 86_400_000 + 3600_000).toISOString(),
  startDay: "2025-10-31",
  startWeek: "2025-10-27",
  workedSeconds: 3600,
  paidBreakSeconds: index === 0 ? 600 : 0,
  breaks: index === 0 ? [{
    id: "paid-break-0", kind: "SHORT_ONE", label: "Short break 1",
    startedAt: "2025-11-01T00:10:00.000Z",
    endedAt: "2025-11-01T00:20:00.000Z",
    endReason: "MANUAL", elapsedSeconds: 600,
    allowanceSeconds: 900, limitSeconds: 1800,
  }] : [],
});

try {
  const { default: ClockShiftHistory } = await vite.ssrLoadModule("/src/components/ClockShiftHistory.tsx");
  const { ToastProvider } = await vite.ssrLoadModule("/src/components/ToastProvider.tsx");
  const {
    FIRST_HISTORY_POSITION, nextHistoryPosition, previousHistoryPosition, historyPageNumber,
  } = await vite.ssrLoadModule("/src/lib/clock-history-pagination.ts");

  const initial = {
    history: Array.from({ length: 25 }, (_, i) => makeShift(i)),
    hasMore: true,
    nextBefore: "history-24",
    historyVersion: "0:none",
  };
  const render = page => renderToStaticMarkup(
    createElement(ToastProvider, null, createElement(ClockShiftHistory, {
      firstPage: page, disabled: false,
      onOlderPageLoaded: () => {},
      onHistoryChanged: async () => {},
    })),
  );

  const html = render(initial);
  assert.ok(html.includes("Your completed shifts"));
  assert.equal((html.match(/<tr/g) ?? []).length, 26);
  assert.ok(html.includes("Page 1"));
  assert.ok(html.includes("Next"));
  assert.ok(html.includes("Previous"));
  assert.ok(!html.includes("Load earlier shifts"));
  pass("History renders exactly the server-provided 25 records, not an ever-growing list.");

  assert.ok(html.includes("Approved correction applied"));
  assert.ok(html.includes("Short break 1"));
  assert.ok(html.includes("BREAK DETAILS"));
  assert.ok(html.includes("Paid breaks") || html.includes("PAID BREAKS"));
  pass("Shift correction markers, paid break history and complete table columns remain visible.");

  const noHistory = render({ ...initial, history: [], hasMore: false, nextBefore: null });
  assert.ok(noHistory.includes("No completed shifts yet"));
  assert.ok(noHistory.includes("Page 1"));
  assert.ok(noHistory.includes("disabled=\"\""));
  pass("Empty history shows an accessible empty state without enabling pagination.");

  const p1 = nextHistoryPosition(FIRST_HISTORY_POSITION, "history-24");
  const p2 = nextHistoryPosition(p1, "history-49");
  assert.equal(historyPageNumber(p1), 2);
  assert.equal(historyPageNumber(p2), 3);
  assert.equal(p1.cursor, "history-24");
  assert.deepEqual(p2.trail, ["", "history-24"]);
  assert.equal(historyPageNumber(FIRST_HISTORY_POSITION), 1);
  pass("Next navigation advances with immutable, ordered history cursors.");

  const backwards = previousHistoryPosition(p2);
  assert.equal(backwards.cursor, "history-24");
  const firstAgain = previousHistoryPosition(backwards);
  assert.equal(firstAgain.cursor, undefined);
  assert.equal(historyPageNumber(firstAgain), 1);
  assert.deepEqual(firstAgain.trail, []);
  assert.equal(nextHistoryPosition(p2, null), p2);
  assert.equal(previousHistoryPosition(FIRST_HISTORY_POSITION), FIRST_HISTORY_POSITION);
  pass("Previous navigation returns to the latest page and guards boundary conditions.");

  const componentSource = await readFile(resolve(root, "src/components/ClockShiftHistory.tsx"), "utf8");
  const parentSource = await readFile(resolve(root, "src/pages/ClockPage.tsx"), "utf8");
  assert.ok(componentSource.includes('encodeURIComponent(cursor)'));
  assert.ok(componentSource.includes('response.historyVersion !== firstPage.historyVersion'));
  assert.ok(componentSource.includes("cause instanceof ApiError && cause.status === 400"));
  assert.ok(componentSource.includes("controller.abort()"));
  assert.ok(componentSource.includes("Loading shift history page"));
  assert.ok(parentSource.includes("key={data.historyVersion}"));
  pass("Older-page fetches are scoped, abortable and reset on changes or invalid cursors.");

  assert.ok(parentSource.includes("onOlderPageLoaded={cacheOlderHistory}"));
  assert.ok(parentSource.includes("historyCache?.version === data.historyVersion"));
  assert.ok(parentSource.includes("onHistoryChanged={syncHistoryAfterChange}"));
  assert.ok(!parentSource.includes("Load earlier shifts"));
  assert.ok(!parentSource.includes("accept(result, true)"));
  pass("Older shifts remain available to the correction picker without extending the visible table.");

  console.log(`${passed} Shift History pagination regression groups passed.`);
} finally {
  await vite.close();
}
