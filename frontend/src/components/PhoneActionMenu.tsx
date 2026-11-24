import { useEffect, useRef } from "react";

import "./PhoneActionMenu.css";

/*
 * The small "⋯" menu that phone layouts put beside their search (Rules,
 * Strikes). A disclosure: the button shows a short list of actions right
 * under it. A tap elsewhere, tabbing out, Escape (with focus inside) or
 * choosing an action closes it.
 */

export type PhoneActionMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
};

export function PhoneActionMenu({
  label,
  panelId,
  open,
  onOpenChange,
  items,
}: {
  /** Names the button for screen readers, e.g. "More rule actions". */
  label: string;
  panelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PhoneActionMenuItem[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    // Escape only acts while focus is in the menu, so it never clears the
    // search or moves focus from somewhere else.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !wrapRef.current?.contains(document.activeElement)) return;
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
    <div
      className="phone-action-menu"
      ref={wrapRef}
      // Tabbing out of the menu closes it. A tap (no new focus target) is
      // left to the outside-tap check, so Safari taps on an item still land.
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !event.currentTarget.contains(next)) onOpenChange(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="phone-action-menu-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span className="phone-action-menu-dots" aria-hidden="true">⋯</span>
      </button>

      {open && (
        <div id={panelId} className="phone-action-menu-panel">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="phone-action-menu-item"
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
