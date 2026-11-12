import { useEffect, type RefObject } from "react";
import { apiRequest } from "../lib/api";

/** Focused, visible messages must remain in view for 700ms. Background polls,
 * hidden tabs and covered transcripts never acknowledge messages. */
export function useChatReadTracking(pane: RefObject<HTMLDivElement | null>, channelId: string,
  unreadIds: string[], paused: boolean, onRead: (ids: string[]) => void, onError: (error: unknown) => void) {
  useEffect(() => {
    const root = pane.current;
    if (!root || !channelId || paused || !unreadIds.length) return;
    const wanted = new Set(unreadIds), pending = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const controller = new AbortController();
    let stopped = false, busy = false;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-chat-message-id]")).filter((el) => wanted.has(el.dataset.chatMessageId!));
    const isVisible = (el: HTMLElement) => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return false;
      const box = el.getBoundingClientRect(), bounds = root.getBoundingClientRect();
      const top = Math.max(box.top, bounds.top, 0), bottom = Math.min(box.bottom, bounds.bottom, window.innerHeight);
      const left = Math.max(box.left, bounds.left, 0), right = Math.min(box.right, bounds.right, window.innerWidth);
      if (box.height <= 0 || bottom - top < Math.min(box.height * .8, 120) || right <= left) return false;
      // A global navigation drawer or another app dialog can cover Chat without
      // changing its geometry or IntersectionObserver state.
      const front = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return !!front && el.contains(front);
    };
    const flush = async () => {
      if (stopped || busy || !pending.size) return;
      const ids = [...pending].filter((id) => nodes.some((node) => node.dataset.chatMessageId === id && isVisible(node))).slice(0, 100);
      pending.clear();
      if (!ids.length) return;
      busy = true;
      try {
        await apiRequest(`/api/chat/channels/${channelId}/read`, { method: "PUT", body: JSON.stringify({ messageIds: ids }), signal: controller.signal });
        if (!stopped) { ids.forEach((id) => wanted.delete(id)); onRead(ids); }
      } catch (e) { if (!stopped) onError(e); }
      finally { busy = false; if (!stopped && pending.size) batchTimer = setTimeout(() => void flush(), 300); }
    };
    const scan = () => {
      for (const node of nodes) {
        const id = node.dataset.chatMessageId!;
        if (!wanted.has(id)) continue;
        if (!isVisible(node)) { clearTimeout(timers.get(id)); timers.delete(id); pending.delete(id); }
        else if (!timers.has(id)) timers.set(id, setTimeout(() => {
          if (!stopped && isVisible(node)) { pending.add(id); clearTimeout(batchTimer); batchTimer = setTimeout(() => void flush(), 150); }
        }, 700));
      }
    };
    const observer = new IntersectionObserver(scan, { root, threshold: [0, .25, .5, .8, 1] });
    nodes.forEach((node) => observer.observe(node));
    window.addEventListener("focus", scan); window.addEventListener("blur", scan);
    window.addEventListener("resize", scan); window.addEventListener("scroll", scan, true);
    document.addEventListener("visibilitychange", scan); scan();
    return () => {
      stopped = true; controller.abort(); observer.disconnect(); timers.forEach(clearTimeout); clearTimeout(batchTimer);
      window.removeEventListener("focus", scan); window.removeEventListener("blur", scan);
      window.removeEventListener("resize", scan); window.removeEventListener("scroll", scan, true);
      document.removeEventListener("visibilitychange", scan);
    };
  }, [pane, channelId, unreadIds, paused, onRead, onError]);
}
