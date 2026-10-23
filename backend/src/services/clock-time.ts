export const CLOCK_TIME_ZONE = "America/Chicago";
const calendar = new Intl.DateTimeFormat("en-US", { timeZone: CLOCK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
export function centralDayKey(instant: Date): string {
  const parts = calendar.formatToParts(instant);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function centralWeekKey(instant: Date): string {
  // Convert the instant with IANA timezone rules first. UTC arithmetic below is
  // calendar-only: it never assumes that a local day lasts exactly 24 hours.
  const date = new Date(`${centralDayKey(instant)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function elapsedSeconds(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}
