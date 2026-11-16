/** Single source for the Hub's US Central clock and Chat timestamps.
 * The display automatically switches CST/CDT with daylight-saving time. */
export const CENTRAL_TIME_ZONE = "America/Chicago";

export function formatCentralMessageTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
