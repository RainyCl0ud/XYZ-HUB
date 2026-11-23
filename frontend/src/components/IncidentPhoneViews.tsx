import type { ReactNode, Ref } from "react";

import {
  incidentStatusClass,
  incidentStatusLabel,
} from "../lib/incident-status";
import type { IncidentStatus } from "../lib/incident-status";
import { formatCentralDateTime } from "../lib/time";

/*
 * Incidents on phones (24 Nov 2026): one tappable row per incident instead
 * of the wide table, and the details on their own screen. Desktop keeps the
 * table and the details window.
 */

export type IncidentPhoneItem = {
  id: string;
  status: IncidentStatus;
  ruleTitleSnapshot: string;
  severityNameSnapshot: string | null;
  occurredAt: string;
  agencyModel: { name: string } | null;
  chatter: { name: string };
};

export type IncidentPhoneDetailItem = IncidentPhoneItem & {
  ruleDefinitionSnapshot: string;
  weightNameSnapshot: string | null;
  details: string;
  ruleVersion: { versionNumber: number };
};

const modelName = (incident: IncidentPhoneItem) => incident.agencyModel?.name ?? "Legacy / unassigned";

export function IncidentPhoneList<T extends IncidentPhoneItem>({
  incidents,
  onOpen,
}: {
  incidents: T[];
  onOpen: (incident: T) => void;
}) {
  return (
    <ul className="incident-phone-list">
      {incidents.map((incident) => (
        <li key={incident.id}>
          <button
            type="button"
            className={`incident-phone-row${incident.status === "VOIDED" ? " incident-phone-row-voided" : ""}`}
            data-incident-id={incident.id}
            onClick={() => onOpen(incident)}
          >
            {/* The spaces keep words apart when a screen reader reads the row as one button. */}
            <span className="incident-phone-row-top">
              <span className="incident-phone-row-name">{incident.chatter.name}</span>{" "}
              <span className={incidentStatusClass(incident.status)}>{incidentStatusLabel(incident.status)}</span>
            </span>{" "}
            <span className="incident-phone-row-rule">{incident.ruleTitleSnapshot}</span>{" "}
            <span className="incident-phone-row-meta">
              {[modelName(incident), incident.severityNameSnapshot, formatCentralDateTime(incident.occurredAt)].filter(Boolean).join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const TITLE_ID = "incident-phone-detail-title";

export function IncidentPhoneDetail({
  backButtonRef,
  incident,
  loading,
  onBack,
  onOpenQaProfile,
  evidence,
  children,
}: {
  /** The page focuses Back when the screen opens. */
  backButtonRef?: Ref<HTMLButtonElement>;
  incident: IncidentPhoneDetailItem | null;
  loading: boolean;
  onBack: () => void;
  onOpenQaProfile: () => void;
  /** The evidence link, or null when the log has none. */
  evidence: ReactNode;
  /** Resolution or void notes, then the actions. */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="incident-phone-detail-bar">
        <button ref={backButtonRef} type="button" className="incident-phone-back" onClick={onBack} disabled={loading} aria-label="Back to incidents">
          <span className="incident-phone-back-arrow" aria-hidden="true" />
        </button>
        {/* The screen is named by the rule title; "Incident" stands in while loading. */}
        <span className="incident-phone-detail-kicker" id={loading || !incident ? TITLE_ID : undefined}>Incident</span>
        {incident && !loading && (
          <span className={incidentStatusClass(incident.status)}>{incidentStatusLabel(incident.status)}</span>
        )}
      </div>

      {loading || !incident ? (
        <div className="empty-state">
          <strong>Loading incident...</strong>
        </div>
      ) : (
        <div className="incident-phone-detail">
          <h3 id={TITLE_ID}>{incident.ruleTitleSnapshot}</h3>

          <div className="incident-phone-detail-chatter">
            <span>{incident.chatter.name}</span>
            <button type="button" className="incident-phone-link" onClick={onOpenQaProfile} aria-label={`QA profile for ${incident.chatter.name}`}>
              QA profile
            </button>
          </div>

          <dl className="incident-phone-facts">
            <div>
              <dt>Model</dt>
              <dd>{modelName(incident)}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>{incident.severityNameSnapshot ?? "None"}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{incident.weightNameSnapshot ?? "None"}</dd>
            </div>
            <div>
              <dt>Occurred</dt>
              <dd>{formatCentralDateTime(incident.occurredAt)}</dd>
            </div>
          </dl>

          <section className="incident-phone-section">
            <h4>Details</h4>
            <p>{incident.details}</p>
          </section>

          <section className="incident-phone-section">
            <h4>Rule (v{incident.ruleVersion.versionNumber})</h4>
            <p>{incident.ruleDefinitionSnapshot}</p>
          </section>

          <section className="incident-phone-section">
            <h4>Evidence</h4>
            {evidence ?? <p>No link added</p>}
          </section>

          {children}
        </div>
      )}
    </>
  );
}
