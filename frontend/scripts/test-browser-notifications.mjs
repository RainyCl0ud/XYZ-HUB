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

  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    const listeners = new Set(), oldWorker = { state: 'activated' };
    const nextWorker = { state: 'installing', addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn) };
    let registration = { active: oldWorker, installing: nextWorker };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { register: async () => registration } } });
    const ready = lib.alertWorker(); await Promise.resolve();
    assert.equal(listeners.size, 1, 'Wait for the installing fix rather than returning the old active worker.');
    nextWorker.state = 'activated'; [...listeners].forEach(fn => fn()); assert.equal(await ready, nextWorker); assert.equal(listeners.size, 0);
    registration = { active: oldWorker }; assert.equal(await lib.alertWorker(), oldWorker);
    nextWorker.state = 'installing'; registration = { active: oldWorker, installing: nextWorker };
    const failed = assert.rejects(lib.alertWorker(), /replaced/); await Promise.resolve(); nextWorker.state = 'redundant'; [...listeners].forEach(fn => fn()); await failed; assert.equal(listeners.size, 0);
  } finally { if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else Reflect.deleteProperty(globalThis, 'navigator'); }
  pass('Worker upgrades wait for the new code before the first alert; replaced updates fail promptly and remove listeners');

  const handlers = new Map(), shown = [], navigated = [], focused = [], opened = [];
  const notificationCentre = new Map(), popups = [];
  let windows = [], currentNotifications = [];
  class Channel { constructor() { this.port1 = { onmessage: null, close() {} }; this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) }; } }
  const worker = { location: { origin: 'https://hub.example' }, clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async url => { opened.push(url); return null; } }, skipWaiting: async () => {}, registration: { showNotification: async (title, options) => {
    shown.push({ title, options });
    // Simulate the platform contract: a same-tag replacement is quiet unless
    // renotify is requested. Counting API calls alone misses this regression.
    if (!notificationCentre.has(options.tag) || options.renotify) popups.push({ title, options });
    notificationCentre.set(options.tag, { title, options });
  }, getNotifications: async () => currentNotifications }, addEventListener: (name, fn) => handlers.set(name, fn) };
  const source = await readFile(resolve(root, 'public/chat-browser-alerts-v1.js'), 'utf8');
  vm.runInNewContext(source, { self: worker, MessageChannel: Channel, URL, setTimeout, clearTimeout, Date, Set, Promise });
  assert.equal(handlers.has('fetch'), false, 'The service worker must not intercept app/network fetches.');
  assert.equal(handlers.has('push'), true, 'Background push and paid-break reminders must remain supported.');
  const clickOrder = [];
  const client = (id, answer, options = {}) => {
    let replaced = false;
    return { id, url: 'https://hub.example/chat', postMessage: (_m, ports) => {
      if (options.closed) throw Error('Client closed');
      if (!options.unresponsive) ports[0].postMessage(answer);
    }, navigate: async url => {
      clickOrder.push('navigate:' + id); navigated.push(url); replaced = true;
      if (options.navigationFails) throw Error('Navigation failed');
      return options.navigationNull ? null : client(id + '-replacement', answer);
    }, focus: async () => {
      clickOrder.push('focus:' + id);
      // A navigation can replace the WindowClient. An obsolete handle cannot
      // be relied on to focus the new page, unlike the former permissive mock.
      if (replaced || options.focusFails) throw Error('Window unavailable');
      focused.push(id); return client(id, answer, options);
    } };
  };
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
  assert.deepEqual(clickOrder.slice(0, 2), ['focus:sender', 'navigate:sender']);
  windows = [client('other', { ...senderAnswer, userId: 'owner' })]; await click(shown[0].options.data); assert.equal(navigated.at(-1), '/chat'); assert.equal(opened.length, 0);
  windows = []; await click(shown[0].options.data); assert.deepEqual(opened, ['/chat']);
  pass('Clicks focus before navigation replaces the tab; switched accounts and closed windows receive only the safe Hub entry');
  windows = [client('other', { ...senderAnswer, userId: 'owner' }), client('sender', senderAnswer)];
  await click(shown[0].options.data); assert.equal(focused.at(-1), 'sender'); assert.equal(navigated.at(-1), '/chat?conversation=channel1');
  windows = [client('unresponsive', senderAnswer, { unresponsive: true })];
  const pendingClick = click(shown[0].options.data);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(focused.at(-1), 'unresponsive', 'Bring the browser forward without waiting for a background tab to reply.');
  await pendingClick; assert.equal(navigated.at(-1), '/chat');
  windows = [client('closed', senderAnswer, { closed: true })]; await click(shown[0].options.data); assert.equal(navigated.at(-1), '/chat');
  pass('Source-window hint selects the receiving tab; sleeping or closed-page handshakes cannot prevent focusing or expose an old conversation');
  for (const options of [{ focusFails: true }, { navigationFails: true }, { navigationNull: true }]) {
    const before = opened.length;
    windows = [client('unavailable', senderAnswer, options)]; await click(shown[0].options.data);
    assert.equal(opened.length, before + 1); assert.equal(opened.at(-1), '/chat');
  }
  windows = [client('malformed-target', senderAnswer)];
  await click({ ...shown[0].options.data, conversationId: 'https://attacker.example' }); assert.equal(navigated.at(-1), '/chat');
  await click(shown[2].options.data); assert.equal(navigated.at(-1), '/chat');
  pass('Focus failure, rejected/null navigation, test alerts and invalid targets use bounded same-origin Hub fallbacks');
  let closed = 0;
  currentNotifications = [{ tag: 'xyz-chat-alert:staff:channel1', data: { userId: 'staff' }, close() { closed++; } }, { tag: 'unrelated', data: { userId: 'staff' }, close() { throw Error('unrelated notification closed'); } }];
  await offer({ type: 'xyz-chat-alert-clear', userId: 'staff' }); assert.equal(closed, 1);
  const bad = await offer({ messages: [{ id: 'x', conversationId: 'https://attacker.example' }] }); assert.equal(bad.ok, false);
  pass('Sign-out/disable clears only Hub notifications; malformed targets cannot become external click destinations');

  windows = [sender]; notificationCentre.clear(); popups.length = 0;
  lib.resetAlertHistory(store, 'staff'); save();
  const second = { id: 'later-message', conversationId: 'channel1' };
  let incoming = [messages[0]];
  const repeatBatch = { ...base(), request: async (_path, ids) => response(incoming.filter(m => !ids || ids.includes(m.id))),
    prepareDelivery: async () => async eligible => { assert.equal((await offer({ messages: eligible })).ok, true); } };
  await lib.processBrowserAlertBatch(repeatBatch); assert.equal(popups.length, 1);
  // Leave the original notification in the notification centre, then send again.
  incoming = [messages[0], second]; await lib.processBrowserAlertBatch(repeatBatch);
  assert.equal(popups.length, 2, 'A later unread message must alert again even when the earlier notification still exists.');
  assert.equal(notificationCentre.size, 1, 'Replace the conversation notification instead of filling the notification centre.');
  await lib.processBrowserAlertBatch(repeatBatch); await lib.processBrowserAlertBatch(repeatBatch);
  assert.equal(popups.length, 2, 'Polling, another tab and refresh must not replay either message.');
  const visible = { id: 'visible-later-message', conversationId: 'channel1' };
  windows = [sender, client('reader', { ...senderAnswer, focused: true, visibleMessageIds: [visible.id] })];
  incoming.push(visible); await lib.processBrowserAlertBatch(repeatBatch); assert.equal(popups.length, 2);
  pass('Successive new messages alert again while replacing the previous same-channel notification; retries and visible messages remain quiet');
  windows = [sender]; notificationCentre.clear(); popups.length = 0;
  await offer({ messages: [], test: true }); await offer({ messages: [], test: true });
  assert.equal(popups.length, 2, 'Every explicit test-button click must request a fresh alert.');
  assert.equal(notificationCentre.size, 1);
  pass('The test notification button alerts on repeated clicks even when its previous notification remains in the centre');

  // Background push was added after the original open-tab-only test. Verify
  // delivery and routing without exposing an old account's conversation.
  const push = async (payload, malformedJson = false) => {
    let work;
    handlers.get('push')({
      data: { json: () => { if (malformedJson) throw Error('invalid JSON'); return payload; } },
      waitUntil: promise => { work = promise; },
    });
    if (work) await work;
  };
  const pushMessage = { id: 'background-message', conversationId: 'channel1', area: 'Creator area', channel: 'General', count: 2 };
  const validPush = { userId: 'staff', clock: false, messages: [pushMessage] };
  const priorPushNotifications = shown.length;
  windows = [sender];
  await push(validPush, true);
  await push({ ...validPush, messages: [{ ...pushMessage, conversationId: 'https://external.example' }] });
  await push({ ...validPush, messages: [{ ...pushMessage, count: 0 }] });
  assert.equal(shown.length, priorPushNotifications, 'Invalid or unparseable push payloads must not display notifications.');
  windows = [client('other-account', { ...senderAnswer, userId: 'owner', focused: true })];
  await push(validPush);
  assert.equal(shown.length, priorPushNotifications, 'A foreground different account must suppress former-account push alerts.');
  windows = [sender, client('foreground-reader', { ...senderAnswer, focused: true, visibleMessageIds: [pushMessage.id] })];
  await push(validPush);
  assert.equal(shown.length, priorPushNotifications, 'Messages visible in a focused tab must not generate push alerts.');
  windows = [sender];
  await push({ ...validPush, clock: true });
  assert.equal(shown.length, priorPushNotifications + 2, 'A new channel alert and paid-break reminder should both be delivered.');
  const chatPush = shown[priorPushNotifications], clockPush = shown[priorPushNotifications + 1];
  assert.equal(chatPush.options.data.kind, 'xyz-hub-push');
  assert.equal(chatPush.options.data.conversationId, 'channel1');
  assert.equal(chatPush.options.tag, 'xyz-hub-push:staff:channel1');
  assert.equal(chatPush.options.renotify, true);
  assert.ok(chatPush.options.body.includes('2 unread'));
  assert.ok(!JSON.stringify(chatPush).includes(pushMessage.id), 'Notification content must not contain message IDs or contents.');
  assert.equal(clockPush.options.data.clock, true);
  assert.equal(clockPush.options.tag, 'xyz-hub-push:staff:clock');
  await click(chatPush.options.data);
  assert.equal(navigated.at(-1), '/chat?conversation=channel1');
  await click(clockPush.options.data);
  assert.equal(navigated.at(-1), '/clock');
  windows = [client('other-account', { ...senderAnswer, userId: 'owner' })];
  await click(chatPush.options.data);
  assert.equal(navigated.at(-1), '/chat', 'A switched account may only reach the safe Chat entry.');
  pass('Background push validates payloads, suppresses wrong-account/visible alerts and safely routes chat and Clock reminders');

  const { BrowserNotificationsContext } = await vite.ssrLoadModule('/src/components/BrowserNotificationsContext.ts');
  const { AuthProvider } = await vite.ssrLoadModule('/src/auth/AuthContext.tsx');
  const { default: Dialog } = await vite.ssrLoadModule('/src/pages/ChatBrowserNotifications.tsx');
  // BackgroundPushSettings now uses useAuth; render within the same provider as the real app.
  const render = extra => renderToStaticMarkup(createElement(AuthProvider, null,
    createElement(BrowserNotificationsContext.Provider, { value: { available: true, supported: true, enabled: false, permission: 'default', busy: false, error: '', limitedScope: false, enable: async () => {}, disable() {}, test: async () => {}, ...extra } }, createElement(Dialog, { onClose() {} }))));
  const off = render({}), denied = render({ permission: 'denied' }), unsupported = render({ supported: false }), enabled = render({ enabled: true, permission: 'granted', limitedScope: true });
  for (const text of ['Enable notifications', 'Browser notifications']) assert.ok(off.includes(text));
  assert.ok(denied.includes('Blocked in your browser settings') && denied.includes('disabled=""'));
  assert.ok(unsupported.includes('Not supported in this browser') && unsupported.includes('disabled=""'));
  for (const text of ['Turn off', 'Show test notification']) assert.ok(enabled.includes(text));
  pass('Notification settings keep explicit opt-in, enabled, denied, unsupported and safe-action states without excessive helper text');
  console.log(`${count} browser notification client/worker groups passed. Platform APIs simulated; no native permission granted or OS alert claimed.`);
} finally { await vite.close(); }
