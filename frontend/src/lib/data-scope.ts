/** People-facing name for a role's data scope (a stored setting such as
 * SELF_AND_TEAM). Shared by the Dashboard and the People pages. */
export function formatDataScope(value: string) {
  if (value === "ALL") return "All data";
  if (value === "SELF_AND_TEAM") return "Self + subordinates";
  if (value === "SELF") return "Self only";
  return value.toLowerCase().replaceAll("_", " ");
}
