/* Open-tab and background alerts. No fetch handler, offline cache or
 * transcript storage. Notification links stay within the Hub. */
const prefix = 'xyz-chat-alert:';
const pushPrefix = 'xyz-hub-push:';
const noticePrefix = 'xyz-hub-notice:';
// Bell notices that may reach the device. Fixed wording, never names or text.
const noticeCopy = {
  BREAK_REMINDER: ['XYZ Hub · Paid break reminder', 'Your paid break is past its planned length. Open Clock & Hours to check it.'],
  BREAK_LIMIT: ['XYZ Hub · Attendance alert', 'A paid break ended automatically. Open the Hub for details.'],
  OPEN_SHIFT: ['XYZ Hub · Attendance alert', 'A shift has been open for 14 hours. Open the Hub for details.'],
  CORRECTION_REVIEW: ['XYZ Hub · Correction to review', 'A clock correction is waiting for your review.'],
  CORRECTION_DECIDED: ['XYZ Hub · Correction reviewed', 'Your clock correction has been reviewed.'],
};
const validNoticeKey = value => typeof value === 'string' && /^(alert|correction-review|correction-decided):[A-Za-z0-9_-]{1,100}$/.test(value);
const validNoticePath = value => value === '/clock' || (typeof value === 'string' && /^\/clock\/requests\/[A-Za-z0-9_-]{1,100}$/.test(value));
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const validPreference = value => value && typeof value.since === 'string' && Number.isFinite(Date.parse(value.since)) && typeof value.generation === 'string' && value.generation.length > 7 && value.generation.length <= 100;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function ask(client, messages) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve({ ...event.data, clientId: client.id }); };
    try { client.postMessage({ type: 'xyz-chat-alert-presence', messages }, [channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); resolve(null); }
  });
}
async function windows() { return self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }
async function handle(event) {
  const input = event.data;
  if (!event.source || !('url' in event.source) || new URL(event.source.url).origin !== self.location.origin) return;
  if (input?.type === 'xyz-chat-alert-clear') {
    const current = await self.registration.getNotifications();
    current.filter(n => n.tag.startsWith(pushPrefix) || ((n.tag.startsWith(prefix) || n.tag.startsWith(noticePrefix)) && (!input.userId || n.data?.userId === input.userId))).forEach(n => n.close());
    return;
  }
  if (input?.type === 'xyz-hub-notice-offer') {
    if (!validId(input.userId) || !validPreference(input.preference) || !Array.isArray(input.notices) || !input.notices.length || input.notices.length > 10 ||
        input.notices.some(n => !validNoticeKey(n?.key) || !Object.hasOwn(noticeCopy, n.kind) || !validNoticePath(n.path))) throw Error('Invalid notice.');
    const open = await windows();
    const answers = (await Promise.all(open.map(client => ask(client, [])))).filter(Boolean);
    const sender = answers.find(a => a.clientId === event.source.id);
    if (!sender || sender.userId !== input.userId || !sender.enabled || sender.generation !== input.preference.generation) return;
    // A focused Hub tab already shows the notice in its bell and toast.
    if (answers.some(a => a.focused)) return;
    for (const notice of input.notices) {
      const [title, body] = noticeCopy[notice.kind];
      await self.registration.showNotification(title, { body, tag: noticePrefix + input.userId + ':' + notice.key,
        data: { kind: 'xyz-hub-notice', userId: input.userId, path: notice.path } });
    }
    return;
  }
  if (input?.type !== 'xyz-chat-alert-offer' || !validId(input.userId) || !validPreference(input.preference) || !Array.isArray(input.messages) || input.messages.length > 50 || input.messages.some(m => !validId(m.id) || !validId(m.conversationId))) throw Error('Invalid alert.');
  const open = await windows();
  const answers = (await Promise.all(open.map(client => ask(client, input.messages)))).filter(Boolean);
  const sender = answers.find(a => a.clientId === event.source.id);
  if (!sender || sender.userId !== input.userId || !sender.enabled || sender.generation !== input.preference.generation) return;
  // A recently switched foreground account must not receive the former user's alert.
  if (answers.some(a => a.focused && a.userId !== input.userId)) return;
  const visible = new Set(answers.filter(a => a.userId === input.userId).flatMap(a => a.visibleMessageIds ?? []));
  let groups = new Set(input.messages.filter(m => !visible.has(m.id)).map(m => m.conversationId));
  // One batch produces at most one pop-up, even with many active conversations.
  if (groups.size > 1) groups = new Set(['inbox']);
  if (input.test) groups = new Set(['test']);
  for (const conversationId of groups) {
    await self.registration.showNotification(input.test ? 'XYZ Hub · test notification' : 'XYZ Hub · new message', {
      body: input.test ? 'Browser notifications are working in this browser.' : 'You have a new unread message. Open the Hub to read it.',
      // Replacing a conversation's existing notification must alert again for
      // genuinely new messages (or an explicit test). The page's shared ID
      // ledger still suppresses retries and duplicate offers across tabs.
      tag: prefix + input.userId + ':' + conversationId, renotify: true,
      data: { kind: 'xyz-chat-alert', userId: input.userId, conversationId, clientId: event.source.id },
    });
  }
}
self.addEventListener('message', event => {
  const work = handle(event).then(() => event.ports?.[0]?.postMessage({ ok: true }), () => event.ports?.[0]?.postMessage({ ok: false }));
  event.waitUntil(work);
});
self.addEventListener('push', event => {
  let input;
  try { input = event.data?.json(); } catch { return; }
  if (!validId(input?.userId) || typeof input.clock !== 'boolean' || !Array.isArray(input.messages) || input.messages.length > 5 ||
      input.messages.some(m => !validId(m?.id) || !validId(m.conversationId) || typeof m.area !== 'string' || m.area.length > 64 ||
        typeof m.channel !== 'string' || m.channel.length > 64 || !Number.isSafeInteger(m.count) || m.count < 1)) return;
  event.waitUntil((async () => {
    const open = await windows();
    const answers = (await Promise.all(open.map(client => ask(client, input.messages)))).filter(Boolean);
    if (answers.some(a => a.focused && a.userId !== input.userId)) return;
    const visible = new Set(answers.filter(a => a.userId === input.userId).flatMap(a => a.visibleMessageIds ?? []));
    for (const message of input.messages) {
      if (visible.has(message.id)) continue;
      await self.registration.showNotification('XYZ Hub · ' + message.area, {
        body: message.channel + ' · ' + message.count + ' unread',
        tag: pushPrefix + input.userId + ':' + message.conversationId, renotify: true,
        data: { kind: 'xyz-hub-push', userId: input.userId, conversationId: message.conversationId },
      });
    }
    if (input.clock) {
      await self.registration.showNotification('XYZ Hub · Paid break reminder', {
        body: 'Your paid break is past its planned length. Open Clock & Hours to check it.',
        tag: pushPrefix + input.userId + ':clock', renotify: true,
        data: { kind: 'xyz-hub-push', userId: input.userId, clock: true },
      });
    }
  })());
});
self.addEventListener('notificationclick', event => {
  if (event.notification.data?.kind === 'xyz-hub-notice') {
    const data = event.notification.data;
    event.notification.close();
    event.waitUntil((async () => {
      const open = await windows();
      const path = validNoticePath(data.path) ? data.path : '/clock';
      const existing = open[0];
      try {
        const client = existing && await existing.focus();
        if (client) {
          // Only the same signed-in person is taken to the notice's page.
          const active = await ask(client, []);
          if (await client.navigate(active?.userId === data.userId ? path : '/')) return;
        }
      } catch { /* The tab closed. */ }
      await self.clients.openWindow(existing ? '/' : path);
    })());
    return;
  }
  if (event.notification.data?.kind === 'xyz-hub-push') {
    const data = event.notification.data;
    event.notification.close();
    event.waitUntil((async () => {
      const open = await windows();
      const entry = data.clock ? '/clock' : '/chat';
      const target = !data.clock && validId(data.conversationId)
        ? entry + '?conversation=' + encodeURIComponent(data.conversationId) : entry;
      const existing = open.find(client => new URL(client.url).pathname === entry) ?? open[0];
      try {
        const client = existing && await existing.focus();
        if (client) {
          const active = await ask(client, []);
          if (await client.navigate(active?.userId === data.userId ? target : entry)) return;
        }
      } catch { /* The tab closed. */ }
      // The conversation route rechecks access for the current sign-in.
      await self.clients.openWindow(existing ? entry : target);
    })());
    return;
  }
  if (event.notification.data?.kind !== 'xyz-chat-alert') return;
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data;
    const open = await windows();
    // Focus during the click, before a background-page handshake or navigation.
    // Navigation can replace a WindowClient, making the old focus handle stale.
    // The source ID is only a window hint: identity is checked again below.
    const candidate = open.find(c => c.id === data.clientId) ?? open[0];
    let client;
    try { client = candidate && await candidate.focus(); } catch { /* Closed/discarded tab: use the safe entry below. */ }
    if (!client) {
      try { client = await self.clients.openWindow('/chat'); } catch { return; }
    }
    if (!client) return;
    const answer = await ask(client, []);
    const target = answer?.userId === data.userId && validId(data.conversationId) && !['test', 'inbox'].includes(data.conversationId)
      ? '/chat?conversation=' + encodeURIComponent(data.conversationId) : '/chat';
    try {
      if (await client.navigate(target)) return;
    } catch { /* The tab may have closed again after focus. */ }
    // Do not reuse the old conversation when identity/navigation is uncertain.
    try { await self.clients.openWindow('/chat'); } catch { /* Browser/OS may refuse window activation. */ }
  })());
});
