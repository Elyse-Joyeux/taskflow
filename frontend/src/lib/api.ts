const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getToken() {
  return typeof window === "undefined" ? null : localStorage.getItem("t");
}

export function getName() {
  return typeof window === "undefined" ? null : localStorage.getItem("name");
}

export function getWorkspaceId() {
  return typeof window === "undefined" ? null : localStorage.getItem("wid");
}

export function setWorkspaceId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("wid", id);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("t");
  localStorage.removeItem("name");
  localStorage.removeItem("uid");
  localStorage.removeItem("wid");
  // Clear the session cookie used by middleware
  document.cookie = "tf_session=; path=/; max-age=0; SameSite=Lax";
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const workspaceId = getWorkspaceId();
  if (workspaceId) headers.set("X-Workspace-Id", workspaceId);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Can’t reach Taskflow’s API at ${API_URL}. Make sure the backend is running and try again.`,
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`;
    throw new Error(message);
  }
  return data as T;
}
