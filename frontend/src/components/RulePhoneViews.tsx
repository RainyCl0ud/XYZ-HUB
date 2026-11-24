import { useEffect, useRef } from "react";
import type { Ref } from "react";

/*
 * Rules on phones (24 Nov 2026): a quiet list with one "⋯" menu beside the
 * search, one row per rule, and a rule screen with Edit in its top bar and
 * Archive as a link at the bottom. Desktop keeps the table.
 */

export type RulePhoneVersion = {
  versionNumber: number;
  title: string;
  definition: string;
  severityNameSnapshot: string | null;
  weightNameSnapshot: string | null;
  weightValueSnapshot: number | null;
};

export type RulePhoneItem = {
  id: string;
  currentVersion: RulePhoneVersion | null;
};

const ruleTitle = (rule: RulePhoneItem) => rule.currentVersion?.title ?? "Untitled Rule";

function rulePhoneMeta(rule: RulePhoneItem) {
  const version = rule.currentVersion;
  return [`v${version?.versionNumber ?? 0}`, version?.severityNameSnapshot, version?.weightNameSnapshot]
    .filter(Boolean)
    .join(" · ");
}

function weightText(version: RulePhoneVersion | null) {
  if (!version?.weightNameSnapshot) return "None";
  return version.weightValueSnapshot === null
    ? version.weightNameSnapshot
    : `${version.weightNameSnapshot} (${version.weightValueSnapshot})`;
}

export function RulePhoneList<T extends RulePhoneItem>({
  rules,
  onOpen,
}: {
  rules: T[];
  onOpen: (rule: T) => void;
}) {
  return (
    <ul className="rule-phone-list">
      {rules.map((rule) => (
        <li key={rule.id}>
          <button
            type="button"
            className="rule-phone-row"
            data-rule-id={rule.id}
            onClick={() => onOpen(rule)}
          >
            {/* The space keeps words apart when a screen reader reads the row as one button. */}
            <span className="rule-phone-row-text">
              <span className="rule-phone-row-title">{ruleTitle(rule)}</span>{" "}
              <span className="rule-phone-row-meta">{rulePhoneMeta(rule)}</span>
            </span>
            <span className="rule-phone-row-chevron" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export type RulePhoneMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
};

/*
 * A small disclosure: the "⋯" button shows a short list of actions right
 * under it. Escape, a tap elsewhere or choosing an action closes it.
 */
export function RulePhoneMenu({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: RulePhoneMenuItem[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onOpenChange]);

  return (
    <div className="rule-phone-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="rule-phone-menu-button"
        aria-label="More rule actions"
        aria-expanded={open}
        aria-controls={open ? "rule-phone-menu-panel" : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span className="rule-phone-menu-dots" aria-hidden="true">⋯</span>
      </button>

      {open && (
        <div id="rule-phone-menu-panel" className="rule-phone-menu-panel">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="rule-phone-menu-item"
              onClick={() => {
                onOpenChange(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RulePhoneScreen({
  rule,
  backButtonRef,
  onBack,
  onEdit,
  onHistory,
  onArchive,
  historyBusy,
  archiveBusy,
}: {
  rule: RulePhoneItem;
  backButtonRef?: Ref<HTMLButtonElement>;
  onBack: () => void;
  /** Left out for people who can only view rules. */
  onEdit?: () => void;
  onHistory: () => void;
  /** Left out for people who can only view rules. */
  onArchive?: () => void;
  historyBusy: boolean;
  archiveBusy: boolean;
}) {
  const version = rule.currentVersion;

  return (
    <div className="modal-backdrop rule-phone-screen-backdrop">
      <div
        className="rule-phone-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-phone-screen-title"
      >
        <div className="rule-phone-screen-bar">
          <button
            ref={backButtonRef}
            type="button"
            className="rule-phone-back"
            onClick={onBack}
            aria-label="Back to rules"
          >
            <span className="rule-phone-back-arrow" aria-hidden="true" />
          </button>
          <span className="rule-phone-screen-kicker">Rule</span>
          {onEdit && (
            <button type="button" className="rule-phone-bar-action" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>

        <div className="rule-phone-screen-body">
          <h3 id="rule-phone-screen-title">{ruleTitle(rule)}</h3>
          <p className="rule-phone-definition">{version?.definition ?? "No definition available."}</p>

          <dl className="rule-phone-facts">
            <div>
              <dt>Severity</dt>
              <dd>{version?.severityNameSnapshot ?? "None"}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{weightText(version)}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>v{version?.versionNumber ?? 0}</dd>
            </div>
          </dl>

          <button type="button" className="rule-phone-history" onClick={onHistory} disabled={historyBusy}>
            <span>{historyBusy ? "Loading history…" : "Version history"}</span>
            <span className="rule-phone-row-chevron" aria-hidden="true" />
          </button>

          {onArchive && (
            <button type="button" className="rule-phone-archive" onClick={onArchive} disabled={archiveBusy}>
              {archiveBusy ? "Archiving…" : "Archive this rule"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
