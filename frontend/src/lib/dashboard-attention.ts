// Helpers for the Dashboard's "On the clock now" card. The data is the
// scoped roster from /api/clock/overview: Owners see the agency, managers
// their assigned team and QC their assigned chatters.

export type BreakKind = "SHORT_ONE" | "SHORT_TWO" | "MEAL";

export type AttendanceOverview = {
  serverNow: string;
  counts: {
    clockedInStaff: number;
    notClockedInStaff: number;
    staffOnBreak: number;
    // Missing until the backend that counts long shifts is deployed.
    longShifts?: number;
  };
  activeShifts: {
    id: string;
    personName: string;
    teamName: string;
    startedAt: string;
    elapsedSeconds: number;
    activeBreak: { kind: BreakKind; startedAt: string } | null;
  }[];
};

export type ShiftRow = AttendanceOverview["activeShifts"][number] & {
  breakSeconds: number;
  isLong: boolean;
};

// Same 14-hour point at which the clock flags a shift as still open.
export const LONG_SHIFT_SECONDS = 14 * 3600;

const BREAK_LABELS: Record<BreakKind, string> = {
  SHORT_ONE: "Short break 1",
  SHORT_TWO: "Short break 2",
  MEAL: "Meal break",
};

export function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 1) return "under 1 min";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

const rank = (row: ShiftRow) => (row.isLong ? 0 : row.activeBreak ? 1 : 2);

/**
 * Long shifts first (longest first), then breaks (longest first), then
 * everyone else in the overview's own order (newest shift first).
 */
export function attentionOrder(overview: AttendanceOverview): ShiftRow[] {
  const serverNow = Date.parse(overview.serverNow);
  return overview.activeShifts
    .map((shift, index) => ({
      index,
      row: {
        ...shift,
        breakSeconds: shift.activeBreak
          ? Math.max(0, (serverNow - Date.parse(shift.activeBreak.startedAt)) / 1000)
          : 0,
        isLong: shift.elapsedSeconds >= LONG_SHIFT_SECONDS,
      },
    }))
    .sort((first, second) => rank(first.row) - rank(second.row)
      || (rank(first.row) === 0 ? second.row.elapsedSeconds - first.row.elapsedSeconds
        : rank(first.row) === 1 ? second.row.breakSeconds - first.row.breakSeconds
          : first.index - second.index))
    .map((entry) => entry.row);
}

/** The words shown on the right of a row; status is never colour alone. */
export function describeShift(row: ShiftRow) {
  return {
    state: row.activeBreak
      ? `${BREAK_LABELS[row.activeBreak.kind] ?? "Break"} · ${formatDuration(row.breakSeconds)}`
      : `On shift · ${formatDuration(row.elapsedSeconds)}`,
    tag: row.isLong ? "Long shift" : row.activeBreak ? "Break" : null,
  };
}
