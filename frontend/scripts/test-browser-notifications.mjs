import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({ root, configFile: false, envDir: false, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
let count = 0; const pass = name => console.log(`PASS ${++count}: ${name}`);
try {
  const lib = await vite.ssrLoadModule('/src/lib/browser-alerts.ts');
  class Store { data = new Map(); getItem(key) { return this.data.get(key) ?? null; } setItem(key, value) { this.data.set(key, value); } removeItem(key) { this.data.delete(key); } }
  const store = new Store(), preference = { since: '2026-11-07T00:00:00.000Z', generation: 'fictional-generation' };
  const messages = [{ id: 'message1', conversationId: 'channel1' }, { id: 'message2', conversationId: 'channel2' }];
  const response = values => ({ enabled: true, userId: 'staff', serverTime: '2026-11-07T00:00:01.000Z', limitedScope: false, messages: values });
  const save = () => store.setItem(lib.preferenceKey('staff'), JSON.stringify(preference)); save();
  assert.deepEqual(lib.readAlertPreference(store, 'staff'), preference); assert.equal(lib.readAlertPreference(store, 'owner'), null);
  lib.claimAlerts(store, 'staff', messages, response([]).serverTime); assert.equal(lib.unseenAlerts(store, 'staff', messages).length, 0); assert.equal(lib.unseenAlerts(store, 'owner', messages).length, 2);
  lib.resetAlertHistory(store, 'staff'); assert.equal(lib.unseenAlerts(store, 'staff', messages).length, 2);
  pass('Per-account preference and durable message claims survive another reader; reset is scoped to the current account');
  const base = () => ({ store, userId: 'staff', preference, request: async (_path, ids) => response(ids ? messages.filter(m => ids.includes(m.id)) : messages), isCurrent: () => true, onFeed() {}, prepareDelivery: async () => async () => {} });
  let deliveries = 0, delivered = [];
  const batch = { ...base(), prepareDelivery: async () => async m => { deliveries++; delivered = m; } };
  // Model two tabs acquiring the same origin Web Lock sequentially, as browsers do.
  await lib.processBrowserAlertBatch(batch); await lib.processBrowserAlertBatch(batch);
  assert.equal(deliveries, 1); assert.deepEqual(delivered, messages);
  pass('Two tab lock owners produce one delivery; a new tab/refresh does not replay claimed messages');
  lib.resetAlertHistory(store, 'staff'); deliveries = 0;
  await lib.processBrowserAlertBatch({ ...batch, request: async (_p, ids) => response(ids ? [messages[1]] : messages) });
  assert.equal(deliveries, 1); assert.deepEqual(delivered, [messages[1]]);
  assert.equal(lib.unseenAlerts(store, 'staff', messages).length, 0);
  pass('Messages read or restricted between discovery and recheck are not delivered or replayed');
  lib.resetAlertHistory(store, 'staff'); deliveries = 0; let active = true;
  await lib.processBrowserAlertBatch({ ...batch, isCurrent: () => active, request: async () => { active = false; return response(messages); } });
  assert.equal(deliveries, 0); assert.equal(lib.unseenAlerts(store, 'staff', messages).length, 2);
  await lib.processBrowserAlertBatch({ ...batch, prepareDelivery: async () => { store.removeItem(lib.preferenceKey('staff')); return async () => { deliveries++; }; } });
  assert.equal(deliveries, 0); save();
  await assert.rejects(() => lib.processBrowserAlertBatch({ ...batch, request: async () => ({ ...response(messages), userId: 'different-account' }) }), /account changed/);
  assert.equal(deliveries, 0);
  pass('Account change, permission revocation or a different session cancels delivery after asynchronous work');
  let attempts = 0;
  await assert.rejects(() => lib.processBrowserAlertBatch({ ...batch, request: async () => { throw Error('offline'); } }), /offline/);
  assert.equal(lib.unseenAlerts(store, 'staff', messages).length, 2);
  await assert.rejects(() => lib.processBrowserAlertBatch({ ...batch, prepareDelivery: async () => async () => { attempts++; throw Error('uncertain OS result'); } }), /uncertain/);
  await lib.processBrowserAlertBatch(batch); assert.equal(attempts, 1); assert.equal(deliveries, 0);
  pass('Network failure retries safely; an uncertain OS delivery is claimed once and never replayed');
  const broken = { getItem() { throw Error('blocked storage'); } };
  await assert.rejects(() => lib.processBrowserAlertBatch({ ...base(), store: broken }), /blocked storage/);
  store.setItem('xyz_browser_alert_seen_v1:staff', '[]'); assert.throws(() => lib.unseenAlerts(store, 'staff', messages)); assert.throws(() => lib.claimAlerts(store, 'staff', messages, response([]).serverTime));
  lib.resetAlertHistory(store, 'staff');
  pass('Unavailable or corrupted storage fails closed rather than flooding repeated notifications');

  const priorDocument = globalThis.document, priorWidth = globalThis.innerWidth, priorHeight = globalThis.innerHeight;
  try {
    let paused = false, covered = false, top = 20;
    const front = {}, node = { dataset: { chatMessageId: 'message1' }, getBoundingClientRect: () => ({ left: 20, right: 280, top, bottom: top + 40, height: 40 }), contains: value => value === front };
    const pane = { getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 400 }), querySelectorAll: () => [node] };
    globalThis.document = { visibilityState: 'visible', hasFocus: () => !paused, querySelector: () => pane, elementFromPoint: () => covered ? {} : front };
    globalThis.innerWidth = 390; globalThis.innerHeight = 844;
    lib.setAlertReadingContext({ userId: 'staff', conversationId: 'channel1', paused: false });
    assert.deepEqual(lib.visibleAlertMessages('staff', messages), ['message1']);
    covered = true; assert.deepEqual(lib.visibleAlertMessages('staff', messages), []);
    covered = false; top = 500; assert.deepEqual(lib.visibleAlertMessages('staff', messages), []);
    top = 20; paused = true; assert.deepEqual(lib.visibleAlertMessages('staff', messages), []);
    paused = false; assert.deepEqual(lib.visibleAlertMessages('owner', messages), []);
    lib.setAlertReadingContext({ userId: 'staff', conversationId: 'channel1', paused: true }); assert.deepEqual(lib.visibleAlertMessages('staff', messages), []);
  } finally { globalThis.document = priorDocument; globalThis.innerWidth = priorWidth; globalThis.innerHeight = priorHeight; lib.setAlertReadingContext({ userId: '', conversationId: '', paused: true }); }
  pass('Reading suppression uses actual visible uncovered message geometry, focus and account; scrolled-away/modal content is not treated as read');

  const handlers = new Map(), shown = [], navigated = [], focused = [], opened = [];
  let windows = [], currentNotifications = [];
  class Channel { constructor() { this.port1 = { onmessage: null, close() {} }; this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) }; } }
  const worker = { location: { origin: 'https://hub.example' }, clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async url => opened.push(url) }, skipWaiting: async () => {}, registration: { showNotification: async (title, options) => shown.push({ title, options }), getNotifications: async () => currentNotifications }, addEventListener: (name, fn) => handlers.set(name, fn) };
  const source = await readFile(resolve(root, 'public/chat-browser-alerts-v1.js'), 'utf8');
  vm.runInNewContext(source, { self: worker, MessageChannel: Channel, URL, setTimeout, clearTimeout, Date, Set, Promise });
  assert.equal(handlers.has('fetch'), false); assert.equal(handlers.has('push'), false);
  const client = (id, answer) => ({ id, url: 'https://hub.example/chat', postMessage: (_m, ports) => ports[0].postMessage(answer), navigate: async url => navigated.push(url), focus: async () => focused.push(id) });
  const senderAnswer = { userId: 'staff', enabled: true, generation: preference.generation, focused: false, visibleMessageIds: [] };
  const sender = client('sender', senderAnswer);
  const offer = async (data = {}, source = sender) => { let work, reply; handlers.get('message')({ source, data: { type: 'xyz-chat-alert-offer', userId: 'staff', preference, messages: [messages[0]], ...data }, ports: [{ postMessage: r => { reply = r; } }], waitUntil: p => { work = p; } }); await work; return reply; };
  windows = [sender, client('foreground', { ...senderAnswer, focused: true, visibleMessageIds: ['message1'] })];
  await offer(); assert.equal(shown.length, 0);
  windows = [sender, client('switched', { ...senderAnswer, userId: 'owner', focused: true })]; await offer(); assert.equal(shown.length, 0);
  windows = [sender]; await offer({ preference: { ...preference, generation: 'stale-generation' } }); assert.equal(shown.length, 0);
  pass('Worker suppresses messages visible in another tab, stale choices and alerts for a former foreground account');
  await offer(); assert.equal(shown.length, 1); assert.equal(shown[0].options.data.conversationId, 'channel1');
  assert.ok(!JSON.stringify(shown[0]).includes('SECRET')); assert.ok(!shown[0].options.body.includes('staff'));
  await offer({ messages }); assert.equal(shown.length, 2); assert.equal(shown[1].options.data.conversationId, 'inbox');
  await offer({ messages: [], test: true }); assert.equal(shown.length, 3); assert.ok(shown[2].title.includes('test notification'));
  pass('One content-free pop-up per batch; several conversations combine into one inbox alert; explicit test is labelled');
  const click = async data => { let work; handlers.get('notificationclick')({ notification: { data, close() {} }, waitUntil: p => { work = p; } }); await work; };
  await click(shown[0].options.data); assert.deepEqual(navigated, ['/chat?conversation=channel1']); assert.deepEqual(focused, ['sender']);
  windows = [client('other', { ...senderAnswer, userId: 'owner' })]; await click(shown[0].options.data); assert.deepEqual(opened, ['/chat']);
  windows = []; await click(shown[0].options.data); assert.deepEqual(opened, ['/chat', '/chat']);
  pass('Clicks focus the matching account/conversation; switched accounts and closed windows receive only the safe Hub entry');
  let closed = 0;
  currentNotifications = [{ tag: 'xyz-chat-alert:staff:channel1', data: { userId: 'staff' }, close() { closed++; } }, { tag: 'unrelated', data: { userId: 'staff' }, close() { throw Error('unrelated notification closed'); } }];
  await offer({ type: 'xyz-chat-alert-clear', userId: 'staff' }); assert.equal(closed, 1);
  const bad = await offer({ messages: [{ id: 'x', conversationId: 'https://attacker.example' }] }); assert.equal(bad.ok, false);
  pass('Sign-out/disable clears only Hub notifications; malformed targets cannot become external click destinations');

  const { BrowserNotificationsContext } = await vite.ssrLoadModule('/src/components/BrowserNotificationsContext.ts');
  const { default: Dialog } = await vite.ssrLoadModule('/src/pages/ChatBrowserNotifications.tsx');
  const render = extra => renderToStaticMarkup(createElement(BrowserNotificationsContext.Provider, { value: { available: true, supported: true, enabled: false, permission: 'default', busy: false, error: '', limitedScope: false, enable: async () => {}, disable() {}, test: async () => {}, ...extra } }, createElement(Dialog, { onClose() {} })));
  const off = render({}), denied = render({ permission: 'denied' }), unsupported = render({ supported: false }), enabled = render({ enabled: true, permission: 'granted', limitedScope: true });
  for (const text of ['Enable notifications', 'closed-browser notifications are not included yet', 'no message text or names', 'without replaying old unread messages']) assert.ok(off.includes(text));
  assert.ok(denied.includes('Blocked in your browser settings') && denied.includes('disabled=""'));
  assert.ok(unsupported.includes('Not supported in this browser') && unsupported.includes('disabled=""'));
  for (const text of ['Turn off', 'Show test notification', 'added by name']) assert.ok(enabled.includes(text));
  pass('Actual settings component clearly explains opt-in/open-tab limits and renders denied, unsupported, enabled and limited-role states');
  console.log(`${count} browser notification client/worker groups passed. Platform APIs simulated; no native permission granted or OS alert claimed.`);
} finally { await vite.close(); }
