import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

type ToastType =
  | "success"
  | "error"
  | "warning"
  | "info";

type Toast = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
};

type ShowToastOptions = {
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
};

type ToastContextValue = {
  showToast: (
    options: ShowToastOptions
  ) => string;

  success: (
    message: string,
    title?: string
  ) => string;

  error: (
    message: string,
    title?: string
  ) => string;

  warning: (
    message: string,
    title?: string
  ) => string;

  info: (
    message: string,
    title?: string
  ) => string;

  dismissToast: (
    id: string
  ) => void;

  dismissAll: () => void;
};

type ToastProviderProps = {
  children: ReactNode;
};

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 5500;
const MAX_VISIBLE_TOASTS = 5;

const ToastContext =
  createContext<
    ToastContextValue | undefined
  >(undefined);

function createToastId() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getDefaultTitle(
  type: ToastType
) {
  switch (type) {
    case "success":
      return "Success";

    case "error":
      return "Something went wrong";

    case "warning":
      return "Attention";

    case "info":
      return "Information";

    default:
      return "";
  }
}

function getToastIcon(
  type: ToastType
) {
  switch (type) {
    case "success":
      return "✓";

    case "error":
      return "!";

    case "warning":
      return "!";

    case "info":
      return "i";

    default:
      return "";
  }
}

function ToastProvider({
  children,
}: ToastProviderProps) {
  const [toasts, setToasts] =
    useState<Toast[]>([]);

  const timersRef =
    useRef<
      Map<
        string,
        ReturnType<typeof setTimeout>
      >
    >(new Map());

  const dismissToast =
    useCallback((id: string) => {
      const timer =
        timersRef.current.get(id);

      if (timer) {
        clearTimeout(timer);

        timersRef.current.delete(
          id
        );
      }

      setToasts((current) =>
        current.filter(
          (toast) =>
            toast.id !== id
        )
      );
    }, []);

  const dismissAll =
    useCallback(() => {
      for (
        const timer of
        timersRef.current.values()
      ) {
        clearTimeout(timer);
      }

      timersRef.current.clear();

      setToasts([]);
    }, []);

  const showToast =
    useCallback(
      (
        options: ShowToastOptions
      ) => {
        const type =
          options.type ?? "info";

        const id =
          createToastId();

        const toast: Toast = {
          id,
          type,

          title:
            options.title ??
            getDefaultTitle(type),

          message:
            options.message,
        };

        /*
         * Keep the newest notifications visible.
         * Older notifications are removed if too
         * many are displayed at once.
         */
        setToasts((current) => {
          const next = [
            ...current,
            toast,
          ];

          if (
            next.length <=
            MAX_VISIBLE_TOASTS
          ) {
            return next;
          }

          const removed =
            next.slice(
              0,
              next.length -
                MAX_VISIBLE_TOASTS
            );

          for (
            const removedToast of
            removed
          ) {
            const timer =
              timersRef.current.get(
                removedToast.id
              );

            if (timer) {
              clearTimeout(timer);

              timersRef.current.delete(
                removedToast.id
              );
            }
          }

          return next.slice(
            -MAX_VISIBLE_TOASTS
          );
        });

        const duration =
          options.duration ??
          (type === "error"
            ? ERROR_DURATION
            : DEFAULT_DURATION);

        /*
         * duration <= 0 can be used later if we
         * ever need a notification that must
         * remain until manually dismissed.
         */
        if (duration > 0) {
          const timer =
            setTimeout(() => {
              setToasts(
                (current) =>
                  current.filter(
                    (toastItem) =>
                      toastItem.id !==
                      id
                  )
              );

              timersRef.current.delete(
                id
              );
            }, duration);

          timersRef.current.set(
            id,
            timer
          );
        }

        return id;
      },
      []
    );

  const success =
    useCallback(
      (
        message: string,
        title?: string
      ) =>
        showToast({
          type: "success",
          title,
          message,
        }),
      [showToast]
    );

  const error =
    useCallback(
      (
        message: string,
        title?: string
      ) =>
        showToast({
          type: "error",
          title,
          message,
        }),
      [showToast]
    );

  const warning =
    useCallback(
      (
        message: string,
        title?: string
      ) =>
        showToast({
          type: "warning",
          title,
          message,
        }),
      [showToast]
    );

  const info =
    useCallback(
      (
        message: string,
        title?: string
      ) =>
        showToast({
          type: "info",
          title,
          message,
        }),
      [showToast]
    );

  /*
   * Clear pending timers when the entire provider
   * unmounts. This prevents stale timeout callbacks.
   */
  useEffect(() => {
    const timers =
      timersRef.current;

    return () => {
      for (
        const timer of
        timers.values()
      ) {
        clearTimeout(timer);
      }

      timers.clear();
    };
  }, []);

  const contextValue =
    useMemo<ToastContextValue>(
      () => ({
        showToast,
        success,
        error,
        warning,
        info,
        dismissToast,
        dismissAll,
      }),
      [
        showToast,
        success,
        error,
        warning,
        info,
        dismissToast,
        dismissAll,
      ]
    );

  return (
    <ToastContext.Provider
      value={contextValue}
    >
      {children}

      <div
        className="toast-region"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map(
          (toast) => (
            <div
              key={toast.id}
              className={`toast toast-${toast.type}`}
              role={
                toast.type ===
                "error"
                  ? "alert"
                  : "status"
              }
            >
              <div
                className="toast-icon"
                aria-hidden="true"
              >
                {getToastIcon(
                  toast.type
                )}
              </div>

              <div className="toast-content">
                {toast.title && (
                  <strong className="toast-title">
                    {toast.title}
                  </strong>
                )}

                <p className="toast-message">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                className="toast-close"
                onClick={() =>
                  dismissToast(
                    toast.id
                  )
                }
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )
        )}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const context =
    useContext(ToastContext);

  if (!context) {
    throw new Error(
      "useToast must be used within a ToastProvider"
    );
  }

  return context;
}

export {
  ToastProvider,
  useToast,
};

export type {
  ToastType,
  ShowToastOptions,
};