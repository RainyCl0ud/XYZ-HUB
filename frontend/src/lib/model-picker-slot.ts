import { createContext } from "react";

/*
 * A page can give the top bar's creator picker a place inside the page.
 * Chatters does this on phones so the picker sits beside the search instead
 * of taking a row of its own under the top bar. The picker, its choices and
 * the saved choice still come from the top bar (AppLayout); only where it is
 * drawn changes. Pass the element as a ref, or null to give it back.
 */
export const ModelPickerSlotContext =
  createContext<(slot: HTMLElement | null) => void>(
    () => {}
  );
