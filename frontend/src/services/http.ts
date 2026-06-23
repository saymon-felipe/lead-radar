const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
let authToken = "";

export function setApiToken(token: string) {
  authToken = token;
}

export function clearApiToken() {
  authToken = "";
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("content-type") && options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message ?? "Falha na requisiÃ§Ã£o");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv")) {
    return (await response.text()) as T;
  }

  return response.json() as Promise<T>;
}
