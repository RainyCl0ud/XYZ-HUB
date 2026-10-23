import { Prisma } from "@prisma/client";
import { CLOCK_PERMISSION_DEFINITIONS } from "../permissions/clock-permissions.js";

export class ClockError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const BREAKS = {
  SHORT_ONE: { label: "Short break 1", allowanceSeconds: 900, limitSeconds: 1800 },
  SHORT_TWO: { label: "Short break 2", allowanceSeconds: 900, limitSeconds: 1800 },
  MEAL: { label: "Meal break", allowanceSeconds: 1800, limitSeconds: 3600 },
} as const;
export const clockViewerInclude = {
  roleMemberships: { where: { role: { archivedAt: null } }, include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
  modelAssignments: { where: { model: { isActive: true } }, select: { modelId: true } },
} satisfies Prisma.UserInclude;
export type ClockViewer = Prisma.UserGetPayload<{ include: typeof clockViewerInclude }>;
export function clockAllowed(viewer: ClockViewer, key: string): boolean {
  const permissions = new Set(viewer.roleMemberships.flatMap((r) => r.role.rolePermissions.map((p) => p.permission.key)));
  const check = (value: string): boolean => permissions.has(value) && (CLOCK_PERMISSION_DEFINITIONS.find((p) => p.key === value)?.requires ?? []).every(check);
  return check(key);
}
export async function clockDatabaseNow(tx: Prisma.TransactionClient) {
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('second', clock_timestamp()) AS "now"`;
  return clock.now;
}
