import type { Ref } from "react";

import { strikeStatusClass, strikeStatusLabel } from "../lib/strike-status";
import type { StrikeStatus } from "../lib/strike-status";
import { formatCentralDateTime, formatCentralShortDate } from "../lib/time";

/*
 * Strike Management on phones (24 Nov 2026): one row per strike instead of
 * the wide table, and the strike on its own screen with Void as a quiet link
 * at the bottom. Desktop keeps the table and the details window.
 */

export type StrikePhoneItem = {
  id: string;
  status: StrikeStatus;
  userNameSnapshot: string;
  reasonNameSnapshot: string;
  issuedAt: string;
};

export type StrikePhoneDetail = StrikePhoneItem & {
  userEmailSnapshot: string;
  reasonDescriptionSnapshot: string | null;
  details: string;
  evidenceUrl: string | null;
  issuedByNameSnapshot: string;
  expiresAt: string;
  ladderVersion: number;
  activeStrikeCountAfterIssue: number;
  standingLabelSnapshot: string;
  deductionPercentSnapshot: number;
  voidedAt: string | null;
  voidedByNameSnapshot: string | null;
  voidReason: string | null;
};

function StatusTag({ status }: { status: StrikeStatus }) {
  return <span className={`${strikeStatusClass(status)} strike-phone-tag`}>{strikeStatusLabel(status)}</span>;
}

export function StrikePhoneList<T extends StrikePhoneItem>({
  strikes,
  onOpen,
}: {
  strikes: T[];
  onOpen: (strike: T) => void;
}) {
  return (
    <ul className="strike-phone-list">
      {strikes.map((strike) => (
        <li key={strike.id}>
          <button
            type="button"
            className={`strike-phone-row${strike.status === "VOIDED" ? " strike-phone-row-voided" : ""}`}
            data-strike-id={strike.id}
            onClick={() => onOpen(strike)}
          >
            {/* The spaces keep words apart when a screen reader reads the row as one button. */}
            <span className="strike-phone-row-text">
              <span className="strike-phone-row-name">{strike.userNameSnapshot}</span>{" "}
              <span className="strike-phone-row-meta">
                {strike.reasonNameSnapshot} · {formatCentralShortDate(strike.issuedAt)}
              </span>
            </span>{" "}
            <StatusTag status={strike.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function otherStrikesLabel(count: number) {
  if (count === 0) return "No other strikes";
  return count === 1 ? "1 other strike" : `${count} other strikes`;
}

export function StrikePhoneScreen<T extends StrikePhoneItem>({
  strike,
  otherStrikes,
  backButtonRef,
  onBack,
  onOpenStrike,
  onEmployeeProfile,
  onVoid,
}: {
  strike: StrikePhoneDetail;
  /** The person's other strikes that this page can show, newest first. */
  otherStrikes: T[];
  backButtonRef?: Ref<HTMLButtonElement>;
  onBack: () => void;
  /** Opens one of the other strikes in place of this one. */
  onOpenStrike: (strike: T) => void;
  /** Left out when the person's account is gone or People can't be viewed. */
  onEmployeeProfile?: () => void;
  /** Left out for people who can't void, and for voided strikes. */
  onVoid?: () => void;
}) {
  const deduction =
    strike.deductionPercentSnapshot > 0 ? `${strike.deductionPercentSnapshot}% deduction` : "No deduction";

  return (
    <div className="strikes-overlay strike-phone-screen-backdrop" role="presentation">
      <div className="strike-phone-screen" role="dialog" aria-modal="true" aria-labelledby="strike-phone-screen-title">
        <div className="strike-phone-screen-bar">
          <button
            ref={backButtonRef}
            type="button"
            className="strike-phone-back"
            onClick={onBack}
            aria-label="Back to strikes"
          >
            <span className="strike-phone-back-arrow" aria-hidden="true" />
          </button>
          <span className="strike-phone-screen-kicker">Strike</span>
          <StatusTag status={strike.status} />
        </div>

        <div className="strike-phone-screen-body">
          <div>
            <h3 id="strike-phone-screen-title">{strike.userNameSnapshot}</h3>
            <p className="strike-phone-email">{strike.userEmailSnapshot}</p>
          </div>

          <dl className="strike-phone-facts">
            <div>
              <dt>Reason</dt>
              <dd>{strike.reasonNameSnapshot}</dd>
            </div>
            <div>
              <dt>Standing</dt>
              <dd>{strike.standingLabelSnapshot}</dd>
            </div>
            <div>
              <dt>Deduction</dt>
              <dd>{deduction}</dd>
            </div>
            <div>
              <dt>Strike</dt>
              <dd>#{strike.activeStrikeCountAfterIssue} at issue</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{formatCentralDateTime(strike.issuedAt)}</dd>
            </div>
            <div>
              <dt>Issued by</dt>
              <dd>{strike.issuedByNameSnapshot}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{formatCentralDateTime(strike.expiresAt)}</dd>
            </div>
            <div>
              <dt>Ladder</dt>
              <dd>v{strike.ladderVersion}</dd>
            </div>
          </dl>

          <section className="strike-phone-section">
            <h4>Details</h4>
            <p>{strike.details}</p>
          </section>

          {strike.reasonDescriptionSnapshot && (
            <section className="strike-phone-section">
              <h4>Reason at issue</h4>
              <p>{strike.reasonDescriptionSnapshot}</p>
            </section>
          )}

          {strike.evidenceUrl && (
            <section className="strike-phone-section">
              <h4>Evidence</h4>
              <a className="strike-phone-evidence" href={strike.evidenceUrl} target="_blank" rel="noreferrer">
                Open evidence link
              </a>
            </section>
          )}

          {strike.status === "VOIDED" && (
            <section className="strike-phone-section strike-phone-void">
              <h4>Voided</h4>
              <p>
                {strike.voidedAt ? formatCentralDateTime(strike.voidedAt) : "—"}
                {strike.voidedByNameSnapshot ? ` by ${strike.voidedByNameSnapshot}` : ""}
              </p>
              {strike.voidReason && <p>{strike.voidReason}</p>}
            </section>
          )}

          {/* The person's other strikes, so they can be read without leaving the page,
              then the way to their full strike history (named as on desktop). */}
          <section className="strike-phone-person" aria-labelledby="strike-phone-person-title">
            <h4 id="strike-phone-person-title">
              {strike.userNameSnapshot} · {otherStrikesLabel(otherStrikes.length)}
            </h4>

            {otherStrikes.length > 0 && (
              <ul className="strike-phone-person-list">
                {otherStrikes.map((other) => (
                  <li key={other.id}>
                    <button
                      type="button"
                      className={`strike-phone-person-row${other.status === "VOIDED" ? " strike-phone-person-row-voided" : ""}`}
                      data-other-strike-id={other.id}
                      onClick={() => onOpenStrike(other)}
                    >
                      <span className="strike-phone-row-text">
                        <span className="strike-phone-person-reason">{other.reasonNameSnapshot}</span>{" "}
                        <span className="strike-phone-row-meta">{formatCentralShortDate(other.issuedAt)}</span>
                      </span>{" "}
                      <StatusTag status={other.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {onEmployeeProfile && (
              <>
                <p className="strike-phone-employee-note" id="strike-phone-employee-note">
                  Their standing, deduction and full strike history are on their profile.
                </p>
                <button
                  type="button"
                  className="strike-phone-employee"
                  aria-describedby="strike-phone-employee-note"
                  onClick={onEmployeeProfile}
                >
                  View employee strikes
                </button>
              </>
            )}
          </section>

          {onVoid && (
            <button type="button" className="strike-phone-void-link" onClick={onVoid}>
              Void this strike
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
