const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type ApiErrorResponse = {
  message?: string;
  errors?: Record<string, string[]>;
};

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;

    try {
      errorData = await response.json();
    } catch {
      // The server did not return JSON.
    }

    throw new Error(
      errorData?.message ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}