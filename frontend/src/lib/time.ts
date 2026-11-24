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

const centralShortDateWithYear =
  new Intl.DateTimeFormat(
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
    }
  );

const centralYear =
  new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      year:
        "numeric",
    }
  );

/**
 * "Nov 23" in Central time, for one-line rows on phones. Dates from another
 * year keep it ("Nov 23, 2025"), so history across years stays clear.
 */
export function formatCentralShortDate(
  value:
    string,
  now:
    Date =
    new Date()
) {
  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return centralYear.format(
    date
  ) ===
    centralYear.format(
      now
    )
    ? centralShortDate.format(
        date
      )
    : centralShortDateWithYear.format(
        date
      );
}
