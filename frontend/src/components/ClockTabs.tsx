import { Link } from "react-router-dom";
import { useClockReviewCount } from "./ClockReviewCountContext";

type Props = {
  mode: "owner" | "staff";
  activeTab: string;
  canReview: boolean;
};

/**
 * Review counts are action indicators, not a count of unread messages.
 * A pending personal request needs management's action, so My Requests
 * deliberately receives no notification badge.
 */
export default function ClockTabs({ mode, activeTab, canReview }: Props) {
  const pendingReviewCount = useClockReviewCount();
  const reviewCount = canReview ? pendingReviewCount : 0;

  return <nav className="clock-tabs" aria-label={mode === "owner" ? "Owner attendance sections" : "Clock and Hours sections"}>
    <Link to="/clock" aria-current={activeTab === "overview" ? "page" : undefined}>
      {mode === "owner" ? "Attendance overview" : "Overview"}
    </Link>
    {mode === "staff" && <Link to="/clock?tab=requests" aria-current={activeTab === "requests" ? "page" : undefined}>
      My requests
    </Link>}
    {canReview && <Link to="/clock?tab=review" aria-current={activeTab === "review" ? "page" : undefined}>
      Review requests
      {reviewCount > 0 && <span className="clock-tab-count"
        aria-label={`${reviewCount} pending correction ${reviewCount === 1 ? "request" : "requests"}`}>
        {reviewCount > 99 ? "99+" : reviewCount}
      </span>}
    </Link>}
    {mode === "staff" && <Link to="/clock?tab=history" aria-current={activeTab === "history" ? "page" : undefined}>
      Shift history
    </Link>}
  </nav>;
}
