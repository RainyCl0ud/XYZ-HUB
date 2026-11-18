import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { QuarantineControl } from "./ChatQuarantineDialog";

/** Same viewport-anchored, portaled action menu used by message More actions. */
export default function ChatMemberActions({ target, onQuarantine }: {
  target: QuarantineControl;
  onQuarantine: (target: QuarantineControl) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    popup.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (open) { setOpen(false); return; }
    const box = event.currentTarget.getBoundingClientRect();
    const width = Math.min(232, window.innerWidth - 16);
    const height = 58;
    const below = window.innerHeight - box.bottom;
    const above = box.top;
    const placeBelow = below >= height + 8 || below >= above;
    const top = placeBelow
      ? Math.min(box.bottom + 6, window.innerHeight - height - 8)
      : Math.max(8, box.top - height - 6);
    setPosition({
      position: "fixed",
      top: Math.max(8, top),
      left: Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(44, (placeBelow ? below : above) - 12),
    });
    setOpen(true);
  }

  return <>
    <button ref={trigger} type="button" className="creator-chat-member-manage creator-chat-more-button"
      onClick={toggle} aria-label={`More actions for ${target.personName}`}
      title="More actions" aria-expanded={open} aria-controls={popupId}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
      </svg>
    </button>
    {open && createPortal(
      <div ref={popup} id={popupId} className="creator-chat-action-popover creator-chat-member-action-popover"
        role="group" aria-label={`Actions for ${target.personName}`} style={position}>
        <button type="button" onClick={() => { setOpen(false); onQuarantine(target); }}>
          {target.active ? "Review / lift quarantine" : "Quarantine member…"}
        </button>
      </div>, document.body)}
  </>;
}
