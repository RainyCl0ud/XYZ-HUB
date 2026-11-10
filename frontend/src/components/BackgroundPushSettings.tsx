import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";
import { backgroundPushChanged, browserPushSubscription, loadPushSettings, pushDeviceKey, readPushDevice } from "../lib/background-push";
import { alertWorker } from "../lib/browser-alerts";

export default function BackgroundPushSettings() {
  const { user } = useAuth();
  return user ? <DeviceSettings key={user.id} userId={user.id} /> : null;
}

function DeviceSettings({ userId }: { userId: string }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const identity = useRef<AbortController | null>(null);
  const supported = window.isSecureContext && "PushManager" in window && "Notification" in window && "serviceWorker" in navigator;

  useEffect(() => {
    const controller = new AbortController();
    identity.current = controller;
    const saved = readPushDevice();
    async function load() {
      const settings = await loadPushSettings(saved?.userId === userId ? saved.id : undefined, controller.signal);
      const subscription = supported && await browserPushSubscription();
      if (!controller.signal.aborted) {
        setPublicKey(settings.publicKey);
        setActive(settings.active && !!subscription);
      }
    }
    void load().catch(() => {});
    return () => controller.abort();
  }, [userId, supported]);

  async function toggle() {
    const signal = identity.current?.signal;
    if (busy || !signal || signal.aborted || !publicKey) return;
    setBusy(true);
    setError("");
    try {
      if (active) {
        const saved = readPushDevice();
        if (saved?.userId === userId) {
          const subscription = await browserPushSubscription();
          await apiRequest(`/api/chat/background-push/${encodeURIComponent(saved.id)}`, { method: "DELETE", signal });
          await subscription?.unsubscribe();
          localStorage.removeItem(pushDeviceKey);
          backgroundPushChanged();
          setActive(false);
        }
        return;
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in this site’s browser settings and try again.");
      if (signal.aborted) return;
      await alertWorker();
      const registration = await navigator.serviceWorker.ready;
      const previous = await registration.pushManager.getSubscription();
      if (signal.aborted) return;
      await previous?.unsubscribe();
      const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const key = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer });
      try {
        const { endpoint, keys } = subscription.toJSON();
        const device = await apiRequest<{ id: string }>("/api/chat/background-push", {
          method: "PUT", body: JSON.stringify({ userId, endpoint, keys }), signal,
        });
        if (signal.aborted) throw new Error("Open notification settings again.");
        localStorage.setItem(pushDeviceKey, JSON.stringify({ ...device, userId }));
        setActive(true);
        backgroundPushChanged();
      } catch (reason) {
        await subscription.unsubscribe().catch(() => false);
        throw reason;
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to update background notifications.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  if (!publicKey) return null;
  return <section aria-label="Background notifications">
    <h3>Background notifications</h3>
    <p>Get chat alerts and paid break reminders when the Hub tab is closed on supported devices. Chat alerts show the creator area, channel and unread count. Message text and files stay in the Hub.</p>
    <p role="status">{active ? "Enabled for this browser sign-in." : supported ? "Off for this browser sign-in." : "This browser does not support background notifications."}</p>
    {error && <p className="creator-chat-error" role="alert">{error}</p>}
    <button type="button" disabled={busy || !supported} onClick={() => void toggle()}>
      {busy ? "Saving…" : active ? "Turn off background notifications" : "Enable background notifications"}
    </button>
  </section>;
}
