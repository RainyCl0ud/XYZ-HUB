export const CLOCK_PERMISSION_DEFINITIONS = [
  ["access", "Access Clock", "Open the attendance screen."],
  ["self.view", "View Own Hours", "Read only your own shifts and paid breaks."],
  ["self.track", "Record Own Attendance", "Clock yourself in and out and record your three paid breaks."],
  ["exempt", "Exempt from Clocking In", "Do not require or allow clocking in, including when other roles allow it. Default: Owner, Developer and Creator."],
  ["corrections.request", "Request Own Time Corrections", "Submit a reason and proposed times for your own shifts. Hours change only after approval."],
  ["corrections.assigned", "Review Assigned Staff Corrections", "Review Chatter/Trial/QC corrections sharing a current active creator assignment. No self-approval."],
  ["corrections.ops", "Review Ops-Routed Corrections", "Review Manager, Accountant, General Staff and unassigned-staff requests. Ops requests go to Owners."],
  ["corrections.all", "Oversee Attendance Corrections", "Review all correction requests, including Ops, except your own. Default: Owner."],
  ["overview.agency", "View Agency Attendance Overview", "See live attendance across eligible active staff. This is separate from correction approval and requires explicit permission."],
  ["overview.team", "View Assigned Team Attendance", "See lower-ranked staff on shared active creator assignments. Rechecks role rank and creator assignment on every request."],
  ["overview.chatters", "View Assigned Chatter Attendance", "See Chatters and Trial Chatters on shared active creator assignments, only when they are lower-ranked than the viewer."],
  ["alerts.team", "Review Assigned Staff Alerts", "Read attendance flags for staff sharing a current active creator assignment. Accountant and General Staff flags are reserved for Ops/Owners. Does not grant access to staff hours."],
  ["alerts.all", "Review All Staff Alerts", "Read attendance flags across the agency, including unassigned staff. Default: Owner and Ops. Does not grant access to staff hours."],
].map(([suffix, name, description]) => ({
  key: `clock.${suffix}`, name, description, pageKey: "clock", categoryKey: suffix.startsWith("corrections.") ? "corrections" : suffix.startsWith("alerts.") ? "alerts" : suffix.startsWith("overview.") ? "overview" : "personal", actionKey: suffix,
  requires: suffix === "access" ? [] : (suffix === "self.track" || suffix.startsWith("corrections.")) ? ["clock.access", "clock.self.view"] : ["clock.access"],
}));
const staff = ["clock.access", "clock.self.view", "clock.self.track", "clock.corrections.request"];
export const CLOCK_ROLE_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  OWNER: ["clock.access", "clock.self.view", "clock.exempt", "clock.alerts.all", "clock.corrections.all", "clock.overview.agency"],
  DEV: ["clock.access", "clock.self.view", "clock.exempt"],
  MODEL: ["clock.access", "clock.self.view", "clock.exempt"],
  OPS_MANAGER: [...staff, "clock.alerts.all", "clock.corrections.ops", "clock.overview.agency"],
  ACCOUNTANT: staff,
  GENERAL_STAFF: staff,
  MANAGER: [...staff, "clock.alerts.team", "clock.corrections.assigned", "clock.overview.team"],
  QC: [...staff, "clock.overview.chatters"],
  CHATTER: staff,
  TRIAL_CHATTER: staff,
};
