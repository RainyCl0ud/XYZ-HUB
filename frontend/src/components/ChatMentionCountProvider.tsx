import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasPortalPermission } from "../auth/portalAccess";
import { apiRequest } from "../lib/api";
import { ChatMentionCountContext } from "./ChatMentionCountContext";

export default function ChatMentionCountProvider({ children }: { children: ReactNode }) {
  const { user, access } = useAuth();
  const enabled = import.meta.env.VITE_BLOCK2_CHAT_ENABLED === "true" && !!user && hasPortalPermission(access, "chat.access");
  const scope = enabled && user && access ? [user.id, ...access.roles.map(r => r.id).sort(), ...access.permissions.slice().sort(), ...access.assignedModelIds.slice().sort()].join("|") : "";
  const [state, setState] = useState({ scope: "", count: 0 });
  useEffect(() => {
    if (!scope) return;
    let stopped = false; let pending: AbortController | null = null;
    const refresh = () => {
      pending?.abort(); const controller = new AbortController(); pending = controller;
      void apiRequest<{ totalUnreadMentions?: number }>("/api/chat/unread", { signal: controller.signal }).then(result => {
        if (!stopped && !controller.signal.aborted) setState({ scope, count: Number.isSafeInteger(result.totalUnreadMentions) ? Math.max(0, result.totalUnreadMentions!) : 0 });
      }).catch(() => { if (!stopped && !controller.signal.aborted) setState({ scope, count: 0 }); });
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const initial = window.setTimeout(refresh, 0), interval = window.setInterval(visible, 5000);
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    window.addEventListener("xyz-chat-unread-changed", refresh);
    return () => { stopped = true; pending?.abort(); clearTimeout(initial); clearInterval(interval); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); window.removeEventListener("xyz-chat-unread-changed", refresh); };
  }, [scope]);
  return <ChatMentionCountContext.Provider value={scope && state.scope === scope ? state.count : 0}>{children}</ChatMentionCountContext.Provider>;
}
