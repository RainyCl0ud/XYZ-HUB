import { formatCorrectionTime } from "./clock-correction-time";

export type CorrectionBreakKind = "SHORT_ONE" | "SHORT_TWO" | "MEAL";
export const correctionBreakLabels: Record<CorrectionBreakKind, string> = { SHORT_ONE: "Short break 1", SHORT_TWO: "Short break 2", MEAL: "Meal break" };
type Times = { startedAt: string; endedAt: string | null };
export type CorrectionSnapshot = Times & { breaks: (Times & { kind: CorrectionBreakKind })[] };
type CorrectionChange = {
  key: string;
  label: string;
  recorded: string;
  requested: string;
};

function sameCorrectionInstant(recorded: string | null, proposed: string | null): boolean {
  if (recorded === proposed) return true;
  if (!recorded || !proposed) return false;
  const oldTime = Date.parse(recorded);
  const newTime = Date.parse(proposed);
  return Number.isFinite(oldTime) && Number.isFinite(newTime) && oldTime === newTime;
}

export function getRequestedChanges(before: CorrectionSnapshot | null, proposed: CorrectionSnapshot): CorrectionChange[] {
  const changes: CorrectionChange[] = [];
  const appendIfChanged = (
    key: string,
    label: string,
    recorded: string | null,
    requested: string | null,
  ) => {
    if (before && sameCorrectionInstant(recorded, requested)) return;
    changes.push({
      key,
      label,
      recorded: recorded ? formatCorrectionTime(recorded) : "Not recorded",
      requested: requested ? formatCorrectionTime(requested) : "Not provided",
    });
  };

  appendIfChanged("shift-start", "Clock in", before?.startedAt ?? null, proposed.startedAt);
  appendIfChanged("shift-end", "Clock out", before?.endedAt ?? null, proposed.endedAt);

  for (const pause of proposed.breaks) {
    const recordedPause = before?.breaks.find((item) => item.kind === pause.kind);
    appendIfChanged(
      `${pause.kind}-start`,
      `${correctionBreakLabels[pause.kind]} — start`,
      recordedPause?.startedAt ?? null,
      pause.startedAt,
    );
    appendIfChanged(
      `${pause.kind}-end`,
      `${correctionBreakLabels[pause.kind]} — end`,
      recordedPause?.endedAt ?? null,
      pause.endedAt,
    );
  }

  return changes;
}

