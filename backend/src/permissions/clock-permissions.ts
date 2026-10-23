export const CLOCK_PERMISSION_DEFINITIONS = [
  ["access", "Access Clock", "Open the attendance screen."],
  ["self.view", "View Own Hours", "Read only your own shifts and paid breaks."],
  ["self.track", "Record Own Attendance", "Clock yourself in and out and record your three paid breaks."],
  ["exempt", "Exempt from Clocking In", "Do not require or allow clocking in, including when other roles allow it. Default: Owner, Developer and Creator."],
].map(([suffix, name, description]) => ({
  key: `clock.${suffix}`, name, description, pageKey: "clock", categoryKey: "personal", actionKey: suffix,
  requires: suffix === "access" ? [] : suffix === "self.track" ? ["clock.access", "clock.self.view"] : ["clock.access"],
}));
const staff = ["clock.access", "clock.self.view", "clock.self.track"];
export const CLOCK_ROLE_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  OWNER: ["clock.access", "clock.self.view", "clock.exempt"],
  DEV: ["clock.access", "clock.self.view", "clock.exempt"],
  MODEL: ["clock.access", "clock.self.view", "clock.exempt"],
  OPS_MANAGER: staff,
  ACCOUNTANT: staff,
  GENERAL_STAFF: staff,
  MANAGER: staff,
  QC: staff,
  CHATTER: staff,
  TRIAL_CHATTER: staff,
};
