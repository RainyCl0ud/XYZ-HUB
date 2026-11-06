/* Open-tab alerts only. No push subscription, fetch handler, offline cache,
 * transcript storage or external provider. All copy and navigation are fixed. */
const prefix = 'xyz-chat-alert:';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const validPreference = value => value && typeof value.since === 'string' && Number.isFinite(Date.parse(value.since)) && typeof value.generation === 'string' && value.generation.length > 7 && value.generation.length <= 100;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function ask(client, messages) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve({ ...event.data, clientId: client.id }); };
    client.postMessage({ type: 'xyz-chat-alert-presence', messages }, [channel.port2]);
  });
}
async function windows() { return self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }
async function handle(event) {
  const input = event.data;
  if (!event.source || !('url' in event.source) || new URL(event.source.url).origin !== self.location.origin) return;
  if (input?.type === 'xyz-chat-alert-clear') {
    const current = await self.registration.getNotifications();
    current.filter(n => n.tag.startsWith(prefix) && (!input.userId || n.data?.userId === input.userId)).forEach(n => n.close());
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
      data: { kind: 'xyz-chat-alert', userId: input.userId, conversationId },
    });
  }
}
self.addEventListener('message', event => {
  const work = handle(event).then(() => event.ports?.[0]?.postMessage({ ok: true }), () => event.ports?.[0]?.postMessage({ ok: false }));
  event.waitUntil(work);
});
self.addEventListener('notificationclick', event => {
  if (event.notification.data?.kind !== 'xyz-chat-alert') return;
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data;
    const open = await windows();
    const answers = (await Promise.all(open.map(client => ask(client, [])))).filter(Boolean);
    const same = answers.find(a => a.userId === data.userId);
    const target = validId(data.conversationId) && !['test', 'inbox'].includes(data.conversationId) && same ? '/chat?conversation=' + encodeURIComponent(data.conversationId) : '/chat';
    const client = same && open.find(c => c.id === same.clientId);
    if (client) { await client.navigate(target); await client.focus(); }
    else await self.clients.openWindow(target);
  })());
});
