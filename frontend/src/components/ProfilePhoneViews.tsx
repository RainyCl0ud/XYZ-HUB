import type { ReactNode } from "react";

/*
 * Employee profile on phones (24 Nov 2026): plain lists instead of cards
 * and wide tables. Facts are one label-and-value list; Strike and QA
 * history are one row per record that opens the record. Desktop keeps
 * its cards and tables.
 */

export type ProfilePhoneFact = {
  label: string;
  value: ReactNode;
};

export function ProfilePhoneFacts({ facts }: { facts: ProfilePhoneFact[] }) {
  return (
    <dl className="people-profile-phone-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** strong: Active / Open. muted: Expired / Resolved. dim: Voided. */
export type ProfilePhoneTone = "strong" | "muted" | "dim";

export type ProfilePhoneRecord = {
  id: string;
  title: string;
  meta: string;
  status: string;
  tone: ProfilePhoneTone;
};

export function ProfilePhoneRecords({
  heading,
  records,
  emptyText,
  onOpen,
}: {
  heading: string;
  records: ProfilePhoneRecord[];
  emptyText: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="people-profile-phone-records">
      <h4 className="people-profile-phone-label">{heading}</h4>

      {records.length === 0 ? (
        <p className="people-profile-phone-empty">{emptyText}</p>
      ) : (
        <ul className="people-profile-phone-list">
          {records.map((record) => (
            <li key={record.id}>
              <button
                type="button"
                className={`people-profile-phone-row${record.tone === "dim" ? " is-dimmed" : ""}`}
                onClick={() => onOpen(record.id)}
              >
                {/* The spaces keep words apart when a screen reader reads the row as one button. */}
                <span className="people-profile-phone-row-text">
                  <span className="people-profile-phone-row-title">{record.title}</span>{" "}
                  <span className="people-profile-phone-row-meta">{record.meta}</span>
                </span>{" "}
                <span className={`people-profile-phone-tag is-${record.tone}`}>{record.status}</span>
              </button>
            </li>
          ))}
        </ul>
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
