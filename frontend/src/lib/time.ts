export const CENTRAL_TIME_ZONE =
  "America/Chicago";

export function formatCentralDateTime(
  value:
    string |
    Date
) {
  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      month:
        "short",
      day:
        "numeric",
      year:
        "numeric",
      hour:
        "numeric",
      minute:
        "2-digit",
      timeZoneName:
        "short",
    }
  ).format(
    date
  );
}

const centralShortDate =
  new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      month:
        "short",
      day:
        "numeric",
    }
  );

/** "Nov 23" in Central time, for one-line rows on phones. */
export function formatCentralShortDate(
  value:
    string
) {
  const date =
    new Date(
      value
    );

  return Number.isNaN(
    date.getTime()
  )
    ? "—"
    : centralShortDate.format(
        date
      );
}
