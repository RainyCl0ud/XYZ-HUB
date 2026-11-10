import { apiRequest } from "./api";

export const pushDeviceKey = "xyz_hub_push_device_v1";
type Device = { id: string; userId: string };
type PushSettings = { publicKey: string | null; active: boolean };

export function readPushDevice() {
  try {
    const data: Device | null = JSON.parse(localStorage.getItem(pushDeviceKey) ?? "null");
    return data && typeof data.id === "string" && typeof data.userId === "string" ? data : null;
  } catch {
    return null;
  }
}

export function loadPushSettings(deviceId?: string, signal?: AbortSignal) {
  const path = deviceId ? `/api/chat/background-push?device=${encodeURIComponent(deviceId)}` : "/api/chat/background-push";
  return apiRequest<PushSettings>(path, { signal });
}

export async function browserPushSubscription() {
  const registration = await navigator.serviceWorker?.getRegistration("/");
  return registration?.pushManager?.getSubscription();
}

export async function releaseBackgroundPush(userId: string) {
  const device = readPushDevice();
  if (device?.userId !== userId) return;
  const subscription = await browserPushSubscription();
  if (readPushDevice()?.id !== device.id) return;
  await subscription?.unsubscribe();
  if (readPushDevice()?.id !== device.id) return;
  localStorage.removeItem(pushDeviceKey);
  backgroundPushChanged();
}

export function backgroundPushChanged() {
  window.dispatchEvent(new Event("xyz-browser-alert-change"));
}
