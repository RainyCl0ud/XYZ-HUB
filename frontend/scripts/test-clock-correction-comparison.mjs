import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({
  root,
  configFile: false,
  envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
let count = 0;
function pass(label) { console.log(`PASS ${++count}: ${label}`); }

try {
  const { Comparison } = await vite.ssrLoadModule('/src/components/ClockCorrections.tsx');
  const { getRequestedChanges } = await vite.ssrLoadModule('/src/lib/clock-correction-comparison.ts');
  const shift = () => ({
    startedAt: '2026-11-10T14:00:00.000Z',
    endedAt: '2026-11-10T22:00:00.000Z',
    breaks: [
      { kind: 'SHORT_ONE', startedAt: '2026-11-10T16:00:00.000Z', endedAt: '2026-11-10T16:15:00.000Z' },
      { kind: 'MEAL', startedAt: '2026-11-10T18:00:00.000Z', endedAt: '2026-11-10T18:30:00.000Z' },
      { kind: 'SHORT_TWO', startedAt: '2026-11-10T20:00:00.000Z', endedAt: '2026-11-10T20:15:00.000Z' },
    ],
  });
  const render = (before, proposed) => renderToStaticMarkup(createElement(Comparison, { before, proposed }));

  {
    const before = shift();
    const proposed = { ...before, endedAt: '2026-11-10T22:30:00.000Z' };
    const changes = getRequestedChanges(before, proposed);
    assert.deepEqual(changes.map(change => change.key), ['shift-end']);
    const html = render(before, proposed);
    assert.ok(html.includes('Clock out'));
    assert.ok(!html.includes('Clock in'));
    assert.ok(!html.includes('Short break'));
    assert.ok(!html.includes('Meal break'));
    assert.equal((html.match(/class="correction-change-row"/g) ?? []).length, 1);
    pass('Clock-out-only requests omit the unchanged clock-in and every unchanged paid break.');
  }
  {
    const before = shift();
    const proposed = { ...before, breaks: before.breaks.map(pause => (
      pause.kind === 'MEAL' ? { ...pause, endedAt: '2026-11-10T18:45:00.000Z' } : pause
    )) };
    assert.deepEqual(getRequestedChanges(before, proposed).map(change => change.key), ['MEAL-end']);
    const html = render(before, proposed);
    assert.ok(html.includes('Meal break'));
    assert.ok(!html.includes('Short break'));
    assert.ok(!html.includes('Clock in'));
    assert.ok(!html.includes('Clock out'));
    pass('Changing only the meal end shows one changed field and hides all other times.');
  }
  {
    const before = { ...shift(), breaks: [shift().breaks[0]] };
    const addedMeal = { kind: 'MEAL', startedAt: '2026-11-10T18:00:00.000Z', endedAt: '2026-11-10T18:30:00.000Z' };
    const proposed = { ...before, breaks: [...before.breaks, addedMeal] };
    const changes = getRequestedChanges(before, proposed);
    assert.deepEqual(changes.map(change => change.key), ['MEAL-start', 'MEAL-end']);
    assert.ok(changes.every(change => change.recorded === 'Not recorded'));
    assert.ok(!render(before, proposed).includes('Short break'));
    pass('A newly reported paid break shows its start/end without exposing unchanged breaks.');
  }
  {
    const before = shift();
    const proposed = { ...shift(), startedAt: '2026-11-10T08:00:00-06:00', endedAt: '2026-11-10T16:00:00-06:00' };
    assert.deepEqual(getRequestedChanges(before, proposed), []);
    assert.ok(render(before, proposed).includes('No time changes requested.'));
    pass('Equivalent UTC/CST instants do not register as false corrections.');
  }
  {
    const before = shift();
    const proposed = { ...before, startedAt: '2026-11-10T13:30:00.000Z' };
    assert.deepEqual(getRequestedChanges(before, proposed).map(change => change.key), ['shift-start']);
    pass('Clock-in-only requests show the changed clock-in field and nothing else.');
  }
  {
    const before = { ...shift(), endedAt: null };
    const proposed = { ...before, endedAt: '2026-11-10T22:00:00.000Z' };
    const changes = getRequestedChanges(before, proposed);
    assert.deepEqual(changes.map(change => change.key), ['shift-end']);
    assert.equal(changes[0].recorded, 'Not recorded');
    pass('A correction to an open shift shows only its newly requested clock-out.');
  }
  {
    const proposed = shift();
    const changes = getRequestedChanges(null, proposed);
    assert.equal(changes.length, 8);
    assert.ok(changes.every(change => change.recorded === 'Not recorded'));
    const html = render(null, proposed);
    assert.ok(html.includes('New shift'));
    assert.ok(html.includes('Short break 1'));
    assert.ok(html.includes('Meal break'));
    pass('A missed shift displays all newly requested times, including any new breaks.');
  }
  console.log(`${count} requested-change comparison regression groups passed. Approval data and audit records are not modified by this view.`);
} finally {
  await vite.close();
}
