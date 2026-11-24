import type { Ref } from "react";

import { formatCentralDateParts } from "../lib/time";

/*
 * Creator Management on phones (25 Nov 2026): one row per creator that
 * opens the creator on its own screen, with its numbers as tiles and
 * Rename and Deactivate (or Reactivate) as one row of buttons. Desktop
 * keeps its cards and table.
 */

export type CreatorPhoneItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  peopleCount: number;
  incidentCount: number;
  hasLinkedAccount: boolean;
  creatorAccount: { id: string; name: string; status: string; hasCreatorRole: boolean } | null;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "3 people · 5 incidents" */
function creatorCounts(creator: CreatorPhoneItem) {
  return `${plural(creator.peopleCount, "person", "people")} · ${plural(creator.incidentCount, "incident", "incidents")}`;
}

/** The creator's login account in one line, with what desktop says about it. */
function creatorAccountLine(creator: CreatorPhoneItem) {
  const account = creator.creatorAccount;

  if (!account) {
    return creator.hasLinkedAccount ? "Creator account connected" : "No creator account connected";
  }

  const notes = [
    account.status === "PENDING_SETUP" ? "pending setup" : null,
    account.status === "DEACTIVATED" ? "login deactivated" : null,
    account.hasCreatorRole ? null : "Creator role removed",
  ].filter(Boolean);

  return [`Account: ${account.name}`, ...notes].join(" · ");
}

function StatusTag({ active }: { active: boolean }) {
  return (
    <span className={`creator-phone-tag ${active ? "is-active" : "is-inactive"}`}>{active ? "Active" : "Inactive"}</span>
  );
}

export function CreatorPhoneList<T extends CreatorPhoneItem>({
  creators,
  onOpen,
}: {
  creators: T[];
  onOpen: (creator: T) => void;
}) {
  return (
    <ul className="creator-phone-list">
      {creators.map((creator) => (
        <li key={creator.id}>
          <button
            type="button"
            className={`creator-phone-row${creator.isActive ? "" : " is-inactive"}`}
            data-creator-id={creator.id}
            onClick={() => onOpen(creator)}
          >
            {/* The spaces keep words apart when a screen reader reads the row as one button. */}
            <span className="creator-phone-row-text">
              <span className="creator-phone-row-name">{creator.name}</span>{" "}
              <span className="creator-phone-row-meta">{creatorCounts(creator)}</span>{" "}
              <span className="creator-phone-row-meta">{creatorAccountLine(creator)}</span>
            </span>{" "}
            <StatusTag active={creator.isActive} />
            <span className="creator-phone-chevron" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function DateTile({ label, value }: { label: string; value: string }) {
  const parts = formatCentralDateParts(value);

  return (
    <div className="creator-phone-tile">
      <dt>{label}</dt>
      <dd>
        <span className="creator-phone-tile-value is-date">{parts?.date ?? "—"}</span>
        {parts && (
          <>
            {" "}
            <span className="creator-phone-tile-note">{parts.time}</span>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * One creator on its own screen. Rename and the status button each show
 * only when passed, i.e. with desktop's permissions.
 */
export function CreatorPhoneScreen({
  creator,
  covered,
  backButtonRef,
  onBack,
  onRename,
  onChangeStatus,
}: {
  creator: CreatorPhoneItem;
  /** A window (Rename, the status confirmation) is open over the screen. */
  covered: boolean;
  backButtonRef?: Ref<HTMLButtonElement>;
  onBack: () => void;
  onRename?: () => void;
  onChangeStatus?: () => void;
}) {
  return (
    <div className="creator-phone-screen-backdrop" role="presentation">
      <div
        className="creator-phone-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-phone-screen-title"
        inert={covered ? true : undefined}
      >
        <div className="creator-phone-screen-bar">
          <button
            ref={backButtonRef}
            type="button"
            className="creator-phone-back"
            onClick={onBack}
            aria-label="Back to creators"
          >
            <span className="creator-phone-back-arrow" aria-hidden="true" />
          </button>
          <span className="creator-phone-screen-kicker">Creator</span>
          <StatusTag active={creator.isActive} />
        </div>

        <div className="creator-phone-screen-body">
          <div>
            <h3 id="creator-phone-screen-title" className={creator.isActive ? undefined : "is-inactive"}>
              {creator.name}
            </h3>
            <p className="creator-phone-account">{creatorAccountLine(creator)}</p>
          </div>

          <dl className="creator-phone-tiles">
            <div className="creator-phone-tile">
              <dt>People</dt>
              <dd>
                <span className="creator-phone-tile-value">{creator.peopleCount}</span>
              </dd>
            </div>
            <div className="creator-phone-tile">
              <dt>Incidents</dt>
              <dd>
                <span className="creator-phone-tile-value">{creator.incidentCount}</span>
              </dd>
            </div>
            <DateTile label="Created" value={creator.createdAt} />
            <DateTile label="Updated" value={creator.updatedAt} />
          </dl>

          {(onRename || onChangeStatus) && (
            <div className="creator-phone-actions">
              {onRename && (
                <button type="button" className="creator-phone-action" data-creator-action="rename" onClick={onRename}>
                  Rename
                </button>
              )}
              {onChangeStatus && (
                <button
                  type="button"
                  className={`creator-phone-action${creator.isActive ? " is-danger" : ""}`}
                  data-creator-action="status"
                  onClick={onChangeStatus}
                >
                  {creator.isActive ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
