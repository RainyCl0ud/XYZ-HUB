const API_BASE_URL =
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

export async function apiRequest<T>(
  path:
    string,
  options:
    RequestInit = {}
): Promise<T> {
  const headers =
    new Headers(
      options.headers
    );

  if (
    options.body &&
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

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers,
        credentials:
          "include",
      }
    );

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

  return response.json() as
    Promise<T>;
}
