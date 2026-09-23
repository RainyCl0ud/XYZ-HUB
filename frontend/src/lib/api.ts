const API_BASE_URL =
  (
    import.meta.env
      .VITE_API_URL ??
    "http://localhost:3000"
  ).replace(
    /\/+$/,
    ""
  );

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

  /*
   * Only add JSON Content-Type when there
   * is actually a request body.
   *
   * This avoids unnecessary CORS preflight
   * requests for simple GET requests.
   */
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

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,

        headers,

        /*
         * Required so the browser sends and
         * receives the HttpOnly xyz_session
         * cookie across the frontend/API
         * origins.
         */
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