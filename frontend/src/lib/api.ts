export const API_BASE_URL =
  (
    import.meta.env
      .VITE_API_URL ??
    "http://localhost:3000"
  ).replace(
    /\/+$/,
    ""
  );

export const MODEL_CONTEXT_STORAGE_KEY =
  "xyz_active_model_id";

export const MODEL_CONTEXT_CHANGED_EVENT =
  "xyz-model-context-changed";

export const AUTH_EXPIRED_EVENT =
  "xyz-auth-expired";

export const PEOPLE_CHANGED_EVENT =
  "xyz-people-changed";

export const SIGNED_OUT_STORAGE_KEY =
  "xyz_signed_out_at";

export const DEFAULT_API_TIMEOUT_MS =
  12_000;

type ApiErrorResponse = {
  error?: string;
  message?: string;
  errors?: Record<
    string,
    string[]
  >;
};

export class ApiError extends Error {
  readonly status:
    number;

  readonly code:
    string | null;

  constructor(
    status:
      number,
    code:
      string | null,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "ApiError";

    this.status =
      status;

    this.code =
      code;
  }
}

export class ApiUnavailableError extends Error {
  readonly reason:
    | "timeout"
    | "network";

  constructor(
    reason:
      | "timeout"
      | "network",
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "ApiUnavailableError";

    this.reason =
      reason;
  }
}

type ApiRequestOptions =
  RequestInit & {
    timeoutMs?: number;
  };

export async function apiRequest<T>(
  path:
    string,
  options:
    ApiRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs =
      DEFAULT_API_TIMEOUT_MS,
    signal:
      callerSignal,
    ...fetchOptions
  } = options;

  const headers =
    new Headers(
      fetchOptions.headers
    );

  if (
    fetchOptions.body &&
    !headers.has(
      "Content-Type"
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  /*
   * Model context is centralized here so every
   * QA request consistently carries the current
   * model selection without individual pages
   * having to duplicate the logic.
   */
  if (
    typeof window !==
    "undefined"
  ) {
    const modelId =
      window.localStorage.getItem(
        MODEL_CONTEXT_STORAGE_KEY
      );

    if (
      modelId &&
      modelId !== "ALL" &&
      !headers.has(
        "X-XYZ-Model-ID"
      )
    ) {
      headers.set(
        "X-XYZ-Model-ID",
        modelId
      );
    }
  }

  const controller =
    new AbortController();
  let timedOut =
    false;

  const handleCallerAbort =
    () => {
      controller.abort(
        callerSignal?.reason
      );
    };

  if (
    callerSignal?.aborted
  ) {
    handleCallerAbort();
  } else {
    callerSignal?.addEventListener(
      "abort",
      handleCallerAbort,
      {
        once: true,
      }
    );
  }

  const requestTimeout =
    Math.max(
      1_000,
      timeoutMs
    );

  const timeoutId =
    globalThis.setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      requestTimeout
    );

  let response:
    Response;

  try {
    response =
      await fetch(
        `${API_BASE_URL}${path}`,
        {
          ...fetchOptions,
          headers,
          credentials:
            "include",
          signal:
            controller.signal,
        }
      );
  } catch (error) {
    if (timedOut) {
      throw new ApiUnavailableError(
        "timeout",
        "The XYZ Management API took too long to respond. Please try again."
      );
    }

    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new ApiUnavailableError(
        "network",
        "The request was interrupted before the XYZ Management API responded."
      );
    }

    throw new ApiUnavailableError(
      "network",
      "Unable to reach the XYZ Management API. Check the connection and try again."
    );
  } finally {
    globalThis.clearTimeout(
      timeoutId
    );

    callerSignal?.removeEventListener(
      "abort",
      handleCallerAbort
    );
  }

  if (
    !response.ok
  ) {
    let errorData:
      ApiErrorResponse | null =
      null;

    try {
      errorData =
        await response.json();
    } catch {
      // Non-JSON response.
    }

    /*
     * Any 401 means the browser no longer has a
     * usable authenticated session. Broadcast the
     * condition so AuthProvider clears cached user
     * state immediately instead of leaving a stale
     * protected screen visible until refresh.
     *
     * Public login/2FA endpoints can also return 401;
     * clearing an already-null auth state is harmless.
     */
    if (
      response.status ===
        401 &&
      typeof window !==
        "undefined"
    ) {
      window.dispatchEvent(
        new Event(
          AUTH_EXPIRED_EVENT
        )
      );
    }

    throw new ApiError(
      response.status,
      errorData?.error ??
        null,
      errorData?.message ??
        `Request failed with status ${response.status}`
    );
  }

  if (
    typeof window !==
      "undefined"
  ) {
    if (
      path ===
      "/api/auth/logout"
    ) {
      window.sessionStorage.setItem(
        SIGNED_OUT_STORAGE_KEY,
        String(
          Date.now()
        )
      );
    } else if (
      path ===
      "/api/auth/login"
    ) {
      window.sessionStorage.removeItem(
        SIGNED_OUT_STORAGE_KEY
      );
    }
  }

  return response.json() as
    Promise<T>;
}
