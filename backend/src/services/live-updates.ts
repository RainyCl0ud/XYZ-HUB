export type LiveUpdate =
  | {
      type: "people.changed";
      userId?: string;
    }
  | {
      type: "access.changed";
      userId?: string;
      roleId?: string;
    };

type LiveUpdateListener = (
  update: LiveUpdate
) => void;

const listeners =
  new Set<
    LiveUpdateListener
  >();

export function publishLiveUpdate(
  update:
    LiveUpdate
) {
  for (
    const listener
    of listeners
  ) {
    try {
      listener(
        update
      );
    } catch (
      error
    ) {
      console.error(
        "Live update listener failed:",
        error
      );
    }
  }
}

export function subscribeLiveUpdates(
  listener:
    LiveUpdateListener
) {
  listeners.add(
    listener
  );

  return () => {
    listeners.delete(
      listener
    );
  };
}
