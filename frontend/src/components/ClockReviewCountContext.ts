import { createContext, useContext } from "react";

// Count of correction requests the current account is authorized to review.
// Unauthenticated or unauthorized consumers always receive zero.
export const ClockReviewCountContext = createContext(0);

export function useClockReviewCount(): number {
  return useContext(ClockReviewCountContext);
}
