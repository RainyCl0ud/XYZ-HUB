import type { ReactNode } from "react";

/*
 * Employee profile on phones (25 Nov 2026 redesign): numbers as boxed
 * tiles, two across, like desktop's cards; Strike and QA history as a
 * three-column table whose rows open the record. Desktop keeps its cards
 * and tables.
 */

export type ProfilePhoneTile = {
  label: string;
  value: ReactNode;
  /** A second, grey line, e.g. the time under a date. */
  note?: ReactNode;
};

/** large: short values (counts, standing). compact: dates. */
export function ProfilePhoneTiles({
  tiles,
  size = "large",
}: {
  tiles: ProfilePhoneTile[];
  size?: "large" | "compact";
}) {
  return (
    <dl className={`people-profile-phone-tiles is-${size}`}>
      {tiles.map((tile) => (
        <div key={tile.label} className="people-profile-phone-tile">
          <dt>{tile.label}</dt>
          <dd>
            <span className="people-profile-phone-tile-value">{tile.value}</span>
            {tile.note && (
              <>
                {" "}
                <span className="people-profile-phone-tile-note">{tile.note}</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A section's heading, with an optional count or action on the right. */
export function ProfilePhoneSectionHead({
  id,
  title,
  aside,
}: {
  id?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="people-profile-phone-section-head">
      <h4 id={id}>{title}</h4>
      {aside}
    </div>
  );
}

/** strong: Active / Open. muted: Expired / Resolved. dim: Voided. */
export type ProfilePhoneTone = "strong" | "muted" | "dim";

export type ProfilePhoneTableRow = {
  id: string;
  title: string;
  /** The grey second line under the title. */
  meta: string;
  date: string;
  status: string;
  tone: ProfilePhoneTone;
};

function recordCount(total: number) {
  return total === 1 ? "1 record" : `${total} records`;
}

/**
 * History as a table: the first column (with a grey second line), a date
 * and a status. Each row is one button that opens the record.
 */
export function ProfilePhoneTable({
  title,
  total,
  columns,
  rows,
  emptyText,
  onOpen,
}: {
  title: string;
  total: number;
  columns: [string, string, string];
  rows: ProfilePhoneTableRow[];
  emptyText: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="people-profile-phone-section">
      <ProfilePhoneSectionHead
        title={title}
        aside={<span className="people-profile-phone-count">{recordCount(total)}</span>}
      />

      {rows.length === 0 ? (
        <p className="people-profile-phone-empty">{emptyText}</p>
      ) : (
        <div className="people-profile-phone-table">
          {/* The rows' buttons already read in this order. */}
          <div className="people-profile-phone-table-head" aria-hidden="true">
            <span>{columns[0]}</span>
            <span>{columns[1]}</span>
            <span>{columns[2]}</span>
          </div>

          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`people-profile-phone-table-row${row.tone === "dim" ? " is-dimmed" : ""}`}
                  data-record-id={row.id}
                  onClick={() => onOpen(row.id)}
                >
                  {/* The spaces keep words apart when a screen reader reads the row as one button. */}
                  <span className="people-profile-phone-table-main">
                    <span className="people-profile-phone-table-title">{row.title}</span>{" "}
                    <span className="people-profile-phone-table-meta">{row.meta}</span>
                  </span>{" "}
                  <span className="people-profile-phone-table-date">{row.date}</span>{" "}
                  <span className={`people-profile-phone-tag is-${row.tone}`}>{row.status}</span>
                  <span className="people-profile-phone-chevron" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Previous / Next, shown only when there is more than one page. */
export function ProfilePhonePager({
  label,
  page,
  pageCount,
  disabled,
  onPrevious,
  onNext,
}: {
  label: string;
  page: number;
  pageCount: number;
  disabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="people-profile-phone-pager" role="group" aria-label={label}>
      <button type="button" className="secondary-button" disabled={disabled || page <= 1} onClick={onPrevious}>
        Previous
      </button>
      <span>
        Page {page} of {pageCount}
      </span>
      <button type="button" className="secondary-button" disabled={disabled || page >= pageCount} onClick={onNext}>
        Next
      </button>
    </div>
  );
}
