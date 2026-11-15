/**
 * Lightweight in-process invalidation bus for active Chat conversations.
 * Only channel IDs are used internally; subscribers receive a content-free
 * "changed" signal and fetch messages through the normal authorization path.
 *
 * Railway Staging uses one Backend replica. With multiple replicas, events
 * do not travel across processes; the client's regular polling remains the
 * supported cross-replica fallback. Never use this as an access-control layer.
 */
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const MAX_LISTENERS_PER_CHANNEL = 150;

export function subscribeChatChanges(channelId: string, listener: Listener): (() => void) | null {
  let channelListeners = listeners.get(channelId);
  if (!channelListeners) {
    channelListeners = new Set<Listener>();
    listeners.set(channelId, channelListeners);
  }
  if (channelListeners.size >= MAX_LISTENERS_PER_CHANNEL) return null;
  channelListeners.add(listener);
  return () => {
    channelListeners!.delete(listener);
    if (!channelListeners!.size) listeners.delete(channelId);
  };
}

export function publishChatChange(channelId: string) {
  for (const listener of listeners.get(channelId) ?? []) {
    try { listener(); } catch { /* Never fail a committed message because a viewer disconnected. */ }
  }
}
