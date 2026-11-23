// Incident status names and tag classes, shared by the Incidents table and
// the phone rows and details.

export type IncidentStatus = "OPEN" | "RESOLVED" | "VOIDED";

export function incidentStatusLabel(status: IncidentStatus) {
  if (status === "OPEN") return "Open";
  if (status === "RESOLVED") return "Resolved";
  return "Voided";
}

export function incidentStatusClass(status: IncidentStatus) {
  if (status === "OPEN") return "incident-status open";
  if (status === "RESOLVED") return "incident-status resolved";
  return "incident-status voided";
}
