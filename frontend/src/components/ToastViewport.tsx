import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Stay interactive above native modal dialogs as well as ordinary pages. */
export default function ToastViewport({ children, active }: { children: ReactNode; active: boolean }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const region = useRef<HTMLDivElement>(null);
  const supportsPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
  useEffect(() => {
    const sync = () => {
      const modals = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter(dialog => dialog.matches(":modal"));
      setHost(modals.at(-1) ?? document.body);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = region.current;
    if (!element || !supportsPopover || !element.isConnected) return;
    // Reopen so a new notification is above any newly opened modal/popover.
    if (element.matches(":popover-open")) element.hidePopover();
    if (active) element.showPopover();
  }, [active, children, host, supportsPopover]);
  const viewport = <div ref={region} className="toast-region" popover={supportsPopover ? "manual" : undefined}
    aria-live="polite" aria-relevant="additions">{children}</div>;
  return host ? createPortal(viewport, host) : viewport;
}
