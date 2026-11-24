// Strike status names and tag classes, shared by the Strikes table and the
// phone rows and strike screen.

export type StrikeStatus = "ACTIVE" | "EXPIRED" | "VOIDED";

export function strikeStatusLabel(status: StrikeStatus) {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "EXPIRED":
      return "Expired";
    case "VOIDED":
      return "Voided";
    default:
      return status;
  }
}

export function strikeStatusClass(status: StrikeStatus) {
  return `strike-status strike-status-${status.toLowerCase()}`;
}
