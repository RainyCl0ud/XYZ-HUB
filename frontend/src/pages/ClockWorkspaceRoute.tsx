import { useAuth } from "../auth/AuthContext";
import ClockPage from "./ClockPage";
import OwnerClockPage from "./OwnerClockPage";

/**
 * Resolve the attendance workspace from the authenticated user's live,
 * non-archived system roles. Owners have an agency overview rather than
 * individual timekeeping controls, personal requests or shift history.
 *
 * The Owner reporting endpoint independently enforces the same role on
 * every request; changing the client route cannot grant agency access.
 */
export default function ClockWorkspaceRoute() {
  const { access } = useAuth();
  const isOwner = access?.roles.some(role => role.systemKey === "OWNER") ?? false;

  return isOwner ? <OwnerClockPage /> : <ClockPage />;
}
