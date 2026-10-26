import { CENTRAL_TIME_ZONE } from "./time.js";

const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: CENTRAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function centralInputValue(instant: string): string {
  const parts = calendar.formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}
export function centralTimeCandidates(wall: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall);
  if (!match) return [];
  const [, yy, mm, dd, hh, min, ss = "00"] = match;
  const normalized = `${yy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  const naive = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 19) !== normalized) return [];
  // Learn offsets from IANA rules around the requested date, not the device's
  // timezone or a fixed CDT/CST schedule. A fold produces two valid instants;
  // a spring-forward gap produces none and must never be silently normalized.
  const offsets = new Set([-36, -12, 0, 12, 36].map((hours) => {
    const sample = naive + hours * 3600_000;
    return Date.parse(`${centralInputValue(new Date(sample).toISOString())}Z`) - sample;
  }));
  return [...offsets].map((offset) => new Date(naive - offset).toISOString())
    .filter((instant) => centralInputValue(instant) === normalized).sort();
}
export function formatCorrectionTime(instant: string | null) {
  return instant ? new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(instant)) : "Still open";
}
