import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "../lib/api";
import { refreshHubNotifications } from "../lib/hub-notifications";
import { useToast } from "../components/ToastProvider";

export type Status = "OFF" | "PREVIEW" | "NOT_CONFIGURED" | "SENDING" | "NEAR_LIMIT" | "PAUSED_HOUR" | "PAUSED_TODAY";
export type Usage = { usedToday: number; allowanceToday: number; dailyLimit: number; usedHour: number; allowanceHour: number };
export type Attention = { type: "reminder" | "announcement"; id: string; personName: string; at: string; detail: string; title: string | null };
export type Overview = { status: Status; usage: Usage | null; attention: Attention[]; attentionTotal: number };

// Problems lead with "!", per the XYZ web kit; normal states stay quiet.
export const STATUS: Record<Status, { problem: boolean; title: string; detail: string }> = {
  OFF: { problem: false, title: "Chat emails are off", detail: "Unread reminders and announcement emails are not being sent." },
  PREVIEW: { problem: false, title: "Preview mode", detail: "Unread reminders and announcement emails are recorded but not sent." },
  NOT_CONFIGURED: { problem: true, title: "Chat emails are on, but no sending budget is set", detail: "Nothing is sent until the daily budget and the sign-in reserve are configured." },
  SENDING: { problem: false, title: "Sending normally", detail: "Unread reminders and announcement emails are going out." },
  NEAR_LIMIT: { problem: true, title: "Daily email limit nearly reached", detail: "Chat emails stop soon so sign-in codes keep arriving." },
  PAUSED_HOUR: { problem: true, title: "Chat emails paused for up to an hour", detail: "This hour's budget is used. Sign-in codes are still sent." },
  PAUSED_TODAY: { problem: true, title: "Chat emails paused until the daily limit resets", detail: "Sign-in codes are still sent." },
};

export type EmailDeliveryState = ReturnType<typeof useEmailDelivery>;

/** Owner email delivery data, shared by the Audit page tab badge and panel. */
export function useEmailDelivery(enabled: boolean) {
  const toast = useToast();
  const request = useRef<AbortController | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [hidden, setHidden] = useState(!enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // A resolve failure stays visible; a later successful reload does not hide it.
  const [actionError, setActionError] = useState("");
  const resolving = useRef(false);
  const load = useCallback(async () => {
    if (!enabled) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    try {
      const result = await apiRequest<Overview>("/api/chat/email-delivery", { signal: controller.signal });
      if (!controller.signal.aborted) { setData(result); setError(""); setHidden(false); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      // Chat switched off (404) or no Owner access (403): no tab at all.
      if (cause instanceof ApiError && [403, 404].includes(cause.status)) setHidden(true);
      else setError("Email delivery status couldn’t be loaded. Try again in a moment.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(initial); request.current?.abort(); };
  }, [load]);
  const resolve = useCallback(async (item: Attention) => {
    if (resolving.current) return;
    resolving.current = true;
    setBusy(item.id); setActionError("");
    try {
      await apiRequest("/api/chat/email-delivery/resolve", { method: "POST", body: JSON.stringify({ type: item.type, id: item.id }) });
      toast.success(item.type === "reminder" ? `Reminders resumed for ${item.personName}.` : "Marked as handled.");
      refreshHubNotifications();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "That delivery couldn’t be updated.");
    } finally {
      // Reload either way (another Owner may already have handled it), and
      // keep the buttons disabled until the fresh list is on screen.
      await load();
      setBusy(null);
      resolving.current = false;
    }
  }, [load, toast]);
  const problem = !!data && STATUS[data.status].problem;
  return { data, hidden, loading, error: actionError || error, busy, load, resolve, problem, attentionTotal: data?.attentionTotal ?? 0 };
}
