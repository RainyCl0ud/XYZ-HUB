import { createHash } from "node:crypto";
import type { ClockBreak, ClockShift } from "@prisma/client";

export type ClockRecord = ClockShift & { breaks: ClockBreak[] };
export function clockSnapshot(shift: ClockRecord) {
  return {
    startedAt: shift.startedAt.toISOString(),
    endedAt: shift.endedAt?.toISOString() ?? null,
    breaks: [...shift.breaks].sort((a, b) => a.kind.localeCompare(b.kind)).map((b) => ({
      id: b.id, kind: b.kind, startedAt: b.startedAt.toISOString(),
      endedAt: b.endedAt?.toISOString() ?? null, endReason: b.endReason,
    })),
  };
}
export function clockRecordVersion(shift: ClockRecord) {
  return createHash("sha256").update(JSON.stringify(clockSnapshot(shift))).digest("hex");
}
