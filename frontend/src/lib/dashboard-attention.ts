// Helpers for the Dashboard's "Needs attention" and "On the clock now"
// cards. Attendance is the scoped roster from /api/clock/overview: Owners
// see the agency, managers their assigned team and QC their assigned
// chatters.
import { ApiError } from "./api";
import { CENTRAL_TIME_ZONE } from "./time";

export type BreakKind = "SHORT_ONE" | "SHORT_TWO" | "MEAL";

type ActiveShift = {
  id: string;
  personName: string;
  teamName: string;
  startedAt: string;
  elapsedSeconds: number;
  activeBreak: { kind: BreakKind; startedAt: string } | null;
};

export type AttendanceOverview = {
  serverNow: string;
  counts: {
    clockedInStaff: number;
    notClockedInStaff: number;
    staffOnBreak: number;
    // Missing until the backend that counts long shifts is deployed.
    longShifts?: number;
  };
  // The first page of the roster, newest shift first.
  activeShifts: ActiveShift[];
  // Long shifts and breaks wherever they fall in the roster (newer backend).
  attentionShifts?: ActiveShift[];
};

export type AttendanceState =
  | { status: "loading" }
  // stale: the last refresh failed, so this snapshot is out of date.
  | { status: "ready"; data: AttendanceOverview; stale: boolean }
  | { status: "error" }
  | { status: "unavailable" };

export type ShiftRow = ActiveShift & {
  breakSeconds: number;
  isLong: boolean;
};

export type AttentionRow = {
  key: string;
  label: string;
  helper: string;
  // null while loading or when the source couldn't load.
  count: number | null;
  href: string | null;
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

/** "1:14 PM CST", for "Showing attendance from …". */
export function formatSnapshotTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

const rank = (row: ShiftRow) => (row.isLong ? 0 : row.activeBreak ? 1 : 2);

/**
 * Long shifts first (longest first), then breaks (longest first), then
 * everyone else in the overview's own order (newest shift first).
 */
export function attentionOrder(overview: AttendanceOverview): ShiftRow[] {
  const serverNow = Date.parse(overview.serverNow);
  const shifts = [...new Map([...(overview.attentionShifts ?? []), ...overview.activeShifts].map((shift) => [shift.id, shift])).values()];
  return shifts
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

/**
 * After a failed attendance request: no access (403) or Clock off (404)
 * hides the card; otherwise a loaded snapshot is kept but marked out of
 * date, and a first load shows an error.
 */
export function failedAttendanceState(previous: AttendanceState, error: unknown): AttendanceState {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return { status: "unavailable" };
  return previous.status === "ready" ? { ...previous, stale: true } : { status: "error" };
}

/** The Needs attention rows this account may see, in display order. */
export function buildAttentionRows(input: {
  canReviewCorrections: boolean;
  reviewCount: number;
  // The account may see attendance and the card isn't hidden.
  showAttendance: boolean;
  attendance: AttendanceOverview | null;
  attendanceHref: string | null;
  canViewQa: boolean;
  // null while the QA summary loads or if it failed.
  openIncidents: number | null;
}): AttentionRow[] {
  const rows: AttentionRow[] = [];
  if (input.canReviewCorrections) {
    rows.push({ key: "corrections", label: "Corrections to review", helper: "Waiting for your approval", count: input.reviewCount, href: "/clock?tab=review" });
  }
  // Hidden only when a snapshot comes from a backend that doesn't count
  // long shifts yet; "—" while attendance loads or fails.
  if (input.showAttendance && (input.attendance === null || input.attendance.counts.longShifts !== undefined)) {
    rows.push({ key: "long-shifts", label: "Long shifts", helper: "Clocked in 14 hours or more", count: input.attendance?.counts.longShifts ?? null, href: input.attendanceHref });
  }
  if (input.canViewQa) {
    rows.push({ key: "incidents", label: "Open QA incidents", helper: "Across your creators", count: input.openIncidents, href: "/incidents" });
  }
  return rows;
}
