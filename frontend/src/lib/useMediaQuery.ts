import { useCallback, useSyncExternalStore } from "react";

/** The Hub's phone layout applies at this width and below (as in the CSS). */
export const PHONE_QUERY = "(max-width: 720px)";

/** Whether a CSS media query currently matches; updates when it changes. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
