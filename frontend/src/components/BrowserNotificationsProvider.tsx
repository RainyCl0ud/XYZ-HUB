import { useToast } from "./ToastProvider";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest, ApiError } from '../lib/api';
import { BrowserNotificationsContext } from './BrowserNotificationsContext';
import { browserPushSubscription, loadPushSettings, pushDeviceKey, readPushDevice, releaseBackgroundPush } from '../lib/background-push';
import { ALERT_PREFERENCE_PREFIX, alertWorker, claimHubNotices, preferenceKey, readAlertPreference, resetAlertHistory, samePreference, processBrowserAlertBatch, tellAlertWorker, unclaimedHubNotices, visibleAlertMessages, type AlertFeed } from '../lib/browser-alerts';
import { DEVICE_NOTICE_KINDS, notificationHref, type HubNotification } from '../lib/hub-notifications';

const supported = () => typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'locks' in navigator && typeof MessageChannel !== 'undefined';
const changed = () => window.dispatchEvent(new Event('xyz-browser-alert-change'));
export default function BrowserNotificationsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { user } = useAuth(), id = user?.id ?? '';
  const identity = useRef(id);
  useLayoutEffect(() => { identity.current = id; return () => { identity.current = ''; }; }, [id]);
  useEffect(() => {
    const saved = readPushDevice();
    if (id && saved && saved.userId !== id) void releaseBackgroundPush(saved.userId).catch(() => {});
  }, [id]);
  const [available, setAvailable] = useState(false), [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [error, setError] = useState(''), [limitedScope, setLimitedScope] = useState(false);
  // Background push already carries the paid-break reminder; avoid a duplicate.
  const pushActive = useRef(false);
  const clear = useCallback((userId?: string) => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistration('/').then(reg => {
      if (reg?.active?.scriptURL === new URL('/chat-browser-alerts-v1.js', location.origin).href) reg.active.postMessage({ type: 'xyz-chat-alert-clear', userId });
    }).catch(() => {});
  }, []);
  const disable = useCallback(() => {
    let stored = true;
    try { localStorage.removeItem(preferenceKey(id)); resetAlertHistory(localStorage, id); setError(''); }
    catch { stored = false; setError('Browser storage is unavailable. Block notifications in your browser settings to stop them.'); }
    setEnabled(false); clear(id); changed();
    // One-click Off must also stop this browser's previously opted-in
    // background push subscription, not only foreground pop-ups.
    void releaseBackgroundPush(id).then(() => {
      if (stored && identity.current === id) toast.success("Browser notifications turned off.");
    }).catch(() => {
      setError("Notifications are off in this tab, but this browser could not stop background alerts. Block notifications for this site in your browser settings to stop them.");
    });
  }, [id, clear, toast]);
  useEffect(() => {
    let stopped = false, running = false, timer: ReturnType<typeof setTimeout>;
    let showedPushAvailability = false;
    const controller = new AbortController();
    const sync = () => {
      if (stopped) return;
      setPermission(supported() ? Notification.permission : 'unsupported');
      try { setEnabled(!!id && !!readAlertPreference(localStorage, id)); }
      catch { setEnabled(false); setError('Browser storage is unavailable. Notifications stay off.'); }
    };
    const storage = (event: StorageEvent) => {
      if (event.key?.startsWith(ALERT_PREFERENCE_PREFIX) || event.key === pushDeviceKey) { sync(); clear(id); void tick(); }
    };
    const presence = (event: MessageEvent) => {
      if (event.data?.type !== 'xyz-chat-alert-presence' || !event.ports[0]) return;
      let pref = null; try { pref = id ? readAlertPreference(localStorage, id) : null; } catch { /* fail closed */ }
      event.ports[0].postMessage({ userId: stopped ? '' : identity.current, enabled: !stopped && !!pref && supported() && Notification.permission === 'granted', generation: pref?.generation,
        focused: document.visibilityState === 'visible' && document.hasFocus(), visibleMessageIds: !stopped && id === identity.current ? visibleAlertMessages(id, event.data.messages ?? []) : [] });
    };
    const tick = async () => {
      if (running || stopped) return;
      clearTimeout(timer);
      running = true;
      try {
        if (!id || import.meta.env.VITE_BLOCK2_CHAT_ENABLED !== 'true') { setAvailable(false); setEnabled(false); clear(); return; }
        const pref = readAlertPreference(localStorage, id);
        if (!pref || !supported() || Notification.permission !== 'granted') {
          const status = await apiRequest<AlertFeed>('/api/chat/browser-notifications', { signal: controller.signal });
          if (!stopped && identity.current === id) { setAvailable(status.enabled && status.userId === id); setLimitedScope(status.limitedScope); }
          sync(); if (pref && supported() && Notification.permission !== 'granted') clear(id);
          return;
        }
        await navigator.locks.request('xyz-chat-browser-alerts-v1', { ifAvailable: true }, async lock => {
          if (!lock || stopped || !samePreference(pref, readAlertPreference(localStorage, id))) return;
          const device = readPushDevice();
          if (device?.userId === id && await browserPushSubscription() &&
              (await loadPushSettings(device.id, controller.signal)).active) {
            pushActive.current = true;
            if (!showedPushAvailability) {
              const status = await apiRequest<AlertFeed>('/api/chat/browser-notifications', { signal: controller.signal });
              if (!stopped && identity.current === id && status.userId === id) {
                setAvailable(status.enabled);
                setLimitedScope(status.limitedScope);
                showedPushAvailability = true;
              }
            }
            return;
          }
          showedPushAvailability = false;
          pushActive.current = false;
          await processBrowserAlertBatch({ store: localStorage, userId: id, preference: pref,
            request: (path, ids) => apiRequest<AlertFeed>(path, { ...(ids ? { method: 'POST', body: JSON.stringify({ after: pref.since, ids }) } : {}), signal: controller.signal }),
            isCurrent: () => !stopped && identity.current === id && Notification.permission === 'granted',
            onFeed: feed => { setAvailable(true); setLimitedScope(feed.limitedScope); sync(); },
            prepareDelivery: async () => { const worker = await alertWorker(); return messages => tellAlertWorker(worker, { type: 'xyz-chat-alert-offer', userId: id, preference: pref, messages }); },
          });
        });
        if (!stopped) setError('');
      } catch (e) {
        if (stopped) return;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) { setAvailable(false); clear(id); }
        else setError('Notifications are paused while the Hub reconnects. They will retry automatically.');
      } finally { running = false; if (!stopped) timer = setTimeout(() => void tick(), 10_000); }
    };
    const wake = () => { sync(); void tick(); };
    window.addEventListener('storage', storage); window.addEventListener('xyz-browser-alert-change', wake); window.addEventListener('online', wake); window.addEventListener('focus', wake);
    navigator.serviceWorker?.addEventListener('message', presence);
    timer = setTimeout(() => { setAvailable(false); sync(); setError(''); clear(); void tick(); }, 0);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); window.removeEventListener('storage', storage); window.removeEventListener('xyz-browser-alert-change', wake); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); navigator.serviceWorker?.removeEventListener('message', presence); };
  }, [id, clear]);
  const enable = useCallback(async () => {
    setBusy(true); setError('');
    try {
      if (!supported()) throw Error('This browser does not support these notifications.');
      const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setPermission(result);
      if (identity.current !== id) return;
      if (result !== 'granted') { setError(result === 'denied' ? 'Notifications are blocked. Allow them in this site’s browser settings, then try again.' : 'Notifications remain off. You can enable them when you are ready.'); return; }
      const status = await apiRequest<AlertFeed>('/api/chat/browser-notifications');
      if (identity.current !== id || status.userId !== id || !status.enabled) return;
      await alertWorker(); if (identity.current !== id) return;
      const pref = { since: status.serverTime, generation: crypto.randomUUID() };
      resetAlertHistory(localStorage, id); localStorage.setItem(preferenceKey(id), JSON.stringify(pref));
      if (!samePreference(pref, readAlertPreference(localStorage, id))) throw Error('Your notification choice could not be saved.');
      setEnabled(true); changed(); toast.success("Browser notifications turned on.");
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to enable browser notifications.'); }
    finally { setBusy(false); }
  }, [id, toast]);
  const test = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const pref = readAlertPreference(localStorage, id), status = await apiRequest<AlertFeed>('/api/chat/browser-notifications');
      if (!pref || !supported() || Notification.permission !== 'granted' || identity.current !== id || status.userId !== id || !status.enabled) throw Error('Enable browser notifications first.');
      const worker = await alertWorker();
      if (identity.current !== id || !samePreference(pref, readAlertPreference(localStorage, id))) return;
      await tellAlertWorker(worker, { type: 'xyz-chat-alert-offer', userId: id, preference: pref, messages: [], test: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to display the test notification.'); }
    finally { setBusy(false); }
  }, [id]);
  // Bell notices that may reach the device: attendance and correction kinds
  // only, never message text. One tab claims each notice before display.
  const offerHubNotices = useCallback(async (notices: HubNotification[]) => {
    if (!id || !notices.length || !supported() || Notification.permission !== 'granted') return;
    let pref; try { pref = readAlertPreference(localStorage, id); } catch { return; }
    if (!pref) return;
    // Only timely notices: a long-pending item never alerts again after the
    // claim ledger forgets it. Background push on this browser (any tab)
    // already delivers the paid-break reminder.
    const since = Math.max(Date.parse(pref.since), Date.now() - 24 * 3600_000);
    const pushHandlesReminders = pushActive.current || readPushDevice()?.userId === id;
    const candidates = notices.filter(n => !n.read && DEVICE_NOTICE_KINDS.has(n.kind) && Date.parse(n.occurredAt) >= since
      && !(pushHandlesReminders && n.kind === 'BREAK_REMINDER') && notificationHref(n.target)).slice(0, 10);
    if (!candidates.length) return;
    try {
      await navigator.locks.request('xyz-hub-device-notices-v1', { ifAvailable: true }, async lock => {
        if (!lock || identity.current !== id || !samePreference(pref, readAlertPreference(localStorage, id))) return;
        const fresh = new Set(unclaimedHubNotices(localStorage, id, candidates.map(n => n.key)));
        if (!fresh.size) return;
        const worker = await alertWorker();
        if (identity.current !== id || !samePreference(pref, readAlertPreference(localStorage, id))) return;
        claimHubNotices(localStorage, id, [...fresh]);
        await tellAlertWorker(worker, { type: 'xyz-hub-notice-offer', userId: id, preference: pref,
          notices: candidates.filter(n => fresh.has(n.key)).map(n => ({ key: n.key, kind: n.kind, path: notificationHref(n.target) })) });
      });
    } catch { /* Device alerts are best effort; the bell still lists the notice. */ }
  }, [id]);
  return <BrowserNotificationsContext.Provider value={{ available, supported: supported(), enabled, permission, busy, error, limitedScope, enable, disable, test, offerHubNotices }}>{children}</BrowserNotificationsContext.Provider>;
}
