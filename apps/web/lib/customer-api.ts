/** Refreshes browser binding before writes; no customer data enters URLs/storage. */
export async function customerRequest<T>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", data?: unknown): Promise<T> {
  const bootstrap = await fetch("/api/auth/session", { cache: "no-store" });
  const session = await bootstrap.json();
  if (!bootstrap.ok || typeof session.data?.csrfToken !== "string") throw new Error("SESSION_UNAVAILABLE");
  const response = await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": session.data.csrfToken }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(response.status === 401 ? "SESSION_EXPIRED" : "CUSTOMER_REQUEST_FAILED");
  return result.data as T;
}
