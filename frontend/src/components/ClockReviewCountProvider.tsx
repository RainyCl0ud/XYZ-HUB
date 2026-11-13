import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasPortalPermission } from "../auth/portalAccess";
import { apiRequest } from "../lib/api";
import { ClockReviewCountContext } from "./ClockReviewCountContext";

type CountState = { accountScope: string; value: number };
type ReviewInboxCount = { reviewPendingCount: number };

const reviewPermissions = [
  "clock.corrections.assigned",
  "clock.corrections.ops",
  "clock.corrections.all",
] as const;

/**
 * One shared, permission-scoped source of correction review counts.
 * The sidebar and both Clock workspaces subscribe to this context so
 * their badges cannot disagree due to independent polling intervals.
 */
export default function ClockReviewCountProvider({ children }: { children: ReactNode }) {
  const { user, access } = useAuth();
  const enabled = import.meta.env.VITE_BLOCK2_CLOCK_ENABLED === "true"
    && Boolean(user?.id)
    && hasPortalPermission(access, "clock.self.view")
    && reviewPermissions.some(permission => hasPortalPermission(access, permission));

  // A count from an old login, permission grant, role, or creator assignment
  // must never appear during a subsequent session's initial fetch.
  const accountScope = user && access ? [
    user.id,
    [...access.roles].map(role => `${role.id}:${role.systemKey ?? ""}`).sort().join(","),
    [...access.permissions].sort().join(","),
    [...access.assignedModelIds].sort().join(","),
  ].join("|") : "";

  const [state, setState] = useState<CountState>({ accountScope: "", value: 0 });

  useEffect(() => {
    if (!enabled || !accountScope) return;

    let active = true;
    let pending: AbortController | null = null;

    const read = () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      void apiRequest<ReviewInboxCount>(
        "/api/clock/corrections?scope=review&filter=pending",
        { signal: controller.signal },
      ).then(result => {
        if (!active || controller.signal.aborted) return;
        const value = Number.isSafeInteger(result.reviewPendingCount)
          ? Math.max(0, result.reviewPendingCount) : 0;
        setState({ accountScope, value });
      }).catch(() => {
        // A failed or revoked request cannot leave an outdated badge visible.
        // Background polling failures are intentionally silent: the request
        // table already presents errors when the user opens the tab.
        if (active && !controller.signal.aborted) setState({ accountScope, value: 0 });
      });
    };

    const readIfVisible = () => {
      if (document.visibilityState === "visible") read();
    };

    const initial = window.setTimeout(read, 0);
    const interval = window.setInterval(readIfVisible, 15_000);
    window.addEventListener("focus", readIfVisible);
    document.addEventListener("visibilitychange", readIfVisible);
    window.addEventListener("xyz-clock-corrections-changed", read);

    return () => {
      active = false;
      pending?.abort();
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", readIfVisible);
      document.removeEventListener("visibilitychange", readIfVisible);
      window.removeEventListener("xyz-clock-corrections-changed", read);
    };
  }, [enabled, accountScope]);

  const count = enabled && accountScope && state.accountScope === accountScope
    ? state.value : 0;

  return <ClockReviewCountContext.Provider value={count}>
    {children}
  </ClockReviewCountContext.Provider>;
}
