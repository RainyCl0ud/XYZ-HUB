/**
 * Browser-side cursor position for the existing /api/clock/me history endpoint.
 * The server always returns up to 25 completed shifts for a single cursor.
 * Only the current page is rendered; older loaded rows can be cached separately
 * for a personal time-correction form without extending the visible table.
 */
export type HistoryPosition = Readonly<{
  cursor: string | undefined;
  trail: readonly string[];
}>;

export const FIRST_HISTORY_POSITION: HistoryPosition = {
  cursor: undefined,
  trail: [],
};

export function nextHistoryPosition(position: HistoryPosition, nextBefore: string | null): HistoryPosition {
  if (!nextBefore || nextBefore === position.cursor) return position;
  return {
    cursor: nextBefore,
    trail: [...position.trail, position.cursor ?? ""],
  };
}

export function previousHistoryPosition(position: HistoryPosition): HistoryPosition {
  if (!position.trail.length) return position;
  const previous = position.trail[position.trail.length - 1];
  return {
    cursor: previous || undefined,
    trail: position.trail.slice(0, -1),
  };
}

export function historyPageNumber(position: HistoryPosition): number {
  return position.trail.length + 1;
}
