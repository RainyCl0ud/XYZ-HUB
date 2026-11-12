export type BrowserAlert = { id: string; conversationId: string };
export type AlertPreference = { since: string; generation: string };
export type AlertFeed = { enabled: boolean; userId: string; serverTime: string; limitedScope: boolean; messages: BrowserAlert[] };
export const ALERT_PREFERENCE_PREFIX = 'xyz_browser_alerts_v1:';
const ledgerKey = (userId: string) => `xyz_browser_alert_seen_v1:${userId}`;
export const preferenceKey = (userId: string) => ALERT_PREFERENCE_PREFIX + userId;

export function readAlertPreference(store: Storage, userId: string): AlertPreference | null {
  const text = store.getItem(preferenceKey(userId));
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return typeof value?.since === 'string' && Number.isFinite(Date.parse(value.since)) && typeof value?.generation === 'string' && value.generation.length > 7 ? { since: value.since, generation: value.generation } : null;
  } catch { return null; }
}
export function samePreference(a: AlertPreference | null, b: AlertPreference | null) {
  return !!a && !!b && a.since === b.since && a.generation === b.generation;
}
export function unseenAlerts(store: Storage, userId: string, messages: BrowserAlert[]) {
  const value = store.getItem(ledgerKey(userId));
  // A damaged ledger fails closed; it must not replay already displayed alerts.
  const seen: Record<string, number> = value ? JSON.parse(value) : {};
  if (!seen || typeof seen !== 'object' || Array.isArray(seen)) throw Error('Browser notification history is unavailable. Turn notifications off and on again.');
  return messages.filter(m => !Object.hasOwn(seen, m.id));
}
export function claimAlerts(store: Storage, userId: string, messages: BrowserAlert[], serverTime: string) {
  const now = Date.parse(serverTime);
  if (!Number.isFinite(now)) throw Error('Invalid notification time.');
  const saved = store.getItem(ledgerKey(userId));
  const seen: Record<string, number> = saved ? JSON.parse(saved) : {};
  if (!seen || typeof seen !== 'object' || Array.isArray(seen)) throw Error('Browser notification history is unavailable. Turn notifications off and on again.');
  const recent = Object.entries(seen).filter(([, at]) => typeof at === 'number' && at >= now - 10 * 60_000);
  for (const message of messages) recent.push([message.id, now]);
  // Claim before display: a browser crash cannot replay an uncertain OS alert.
  const encoded = JSON.stringify(Object.fromEntries(recent.slice(-1000)));
  store.setItem(ledgerKey(userId), encoded);
  if (store.getItem(ledgerKey(userId)) !== encoded) throw Error('Browser notification history could not be saved.');
}
export function resetAlertHistory(store: Storage, userId: string) { store.removeItem(ledgerKey(userId)); }

/** Caller holds the origin-wide Web Lock for the entire discovery/claim/display.
 * Revalidate both current server access and the local account/choice after awaits. */
export async function processBrowserAlertBatch(options: {
  store: Storage; userId: string; preference: AlertPreference;
  request: (path: string, ids?: string[]) => Promise<AlertFeed>;
  isCurrent: () => boolean;
  onFeed: (feed: AlertFeed) => void;
  prepareDelivery: () => Promise<(messages: BrowserAlert[]) => Promise<void>>;
}) {
  const { store, userId, preference, request, isCurrent } = options;
  const current = () => isCurrent() && samePreference(preference, readAlertPreference(store, userId));
  const matches = (feed: AlertFeed) => feed.enabled && feed.userId === userId;
  if (!current()) return;
  const feed = await request('/api/chat/browser-notifications?after=' + encodeURIComponent(preference.since));
  if (!current()) return;
  if (!matches(feed)) throw Error('Your Hub account changed. Refresh before enabling notifications again.');
  options.onFeed(feed);
  const messages = unseenAlerts(store, userId, feed.messages);
  if (!messages.length) return;
  const checked = await request('/api/chat/browser-notifications/check', messages.map(m => m.id));
  if (!current()) return;
  if (!matches(checked)) throw Error('Your Hub account changed. Refresh before enabling notifications again.');
  const deliver = await options.prepareDelivery();
  if (!current()) return;
  claimAlerts(store, userId, messages, checked.serverTime);
  const offered = new Set(messages.map(m => m.id));
  const eligible = checked.messages.filter(m => offered.has(m.id));
  if (eligible.length) await deliver(eligible);
}

let readingContext = { userId: '', conversationId: '', paused: true };
export function setAlertReadingContext(value: typeof readingContext) { readingContext = value; }
export function visibleAlertMessages(userId: string, messages: BrowserAlert[]) {
  if (readingContext.userId !== userId || readingContext.paused || document.visibilityState !== 'visible' || !document.hasFocus()) return [];
  const pane = document.querySelector<HTMLElement>('.creator-chat-messages');
  if (!pane) return [];
  const bounds = pane.getBoundingClientRect();
  const candidates = new Set(messages.filter(m => m.conversationId === readingContext.conversationId).map(m => m.id));
  return Array.from(pane.querySelectorAll<HTMLElement>('[data-chat-message-id]')).filter(node => {
    if (!candidates.has(node.dataset.chatMessageId!)) return false;
    const box = node.getBoundingClientRect();
    const left = Math.max(box.left, bounds.left, 0), right = Math.min(box.right, bounds.right, innerWidth);
    const top = Math.max(box.top, bounds.top, 0), bottom = Math.min(box.bottom, bounds.bottom, innerHeight);
    const front = right > left && bottom > top ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : null;
    return box.height > 0 && bottom - top >= Math.min(box.height * .8, 120) && !!front && node.contains(front);
  }).map(node => node.dataset.chatMessageId!);
}

export async function alertWorker() {
  const registration = await navigator.serviceWorker.register('/chat-browser-alerts-v1.js', { scope: '/', updateViaCache: 'none' });
  // A deployed fix may be installing alongside the old active worker. Wait for
  // the newer version so the first offer after refresh uses the fixed code.
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw Error('Notification setup did not finish. Please try again.');
  if (worker.state === 'activated') return worker;
  return new Promise<ServiceWorker>((resolve, reject) => {
    const timer = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(Error('Notification setup timed out. Please try again.')); }, 10_000);
    function changed() {
      if (worker!.state === 'activated' || worker!.state === 'redundant') {
        clearTimeout(timer); worker!.removeEventListener('statechange', changed);
        if (worker!.state === 'activated') resolve(worker!);
        else reject(Error('Notification setup was replaced. Please try again.'));
      }
    }
    worker.addEventListener('statechange', changed); changed();
  });
}
export function tellAlertWorker(worker: ServiceWorker, message: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error('Browser notifications did not respond. Try again.')); }, 5000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); if (event.data?.ok) resolve(); else reject(Error('Unable to display browser notifications. Check your browser settings.')); };
    try { worker.postMessage(message, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });
}
