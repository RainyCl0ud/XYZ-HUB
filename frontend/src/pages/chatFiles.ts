import { apiRequest } from "../lib/api";
import type { ChatMessage } from "./ChatMessageTools";

export function sendChatFile(channelId: string, file: File, nonce: string, signal: AbortSignal, voice = false) {
  return apiRequest<{ message: ChatMessage }>(`/api/chat/channels/${encodeURIComponent(channelId)}/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-XYZ-File-Name": encodeURIComponent(file.name),
      "X-XYZ-File-Size": String(file.size),
      "X-XYZ-Chat-Nonce": nonce,
      ...(voice ? { "X-XYZ-Voice-Message": "true" } : {}),
    },
    body: file,
    signal,
    timeoutMs: 310_000,
  });
}
