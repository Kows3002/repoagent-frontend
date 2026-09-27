import { ApiError, friendlyError, mapError, type ErrorContext } from "./errors";
import type { GitHubRepository, GitHubSession, RepositoryAccess, RepositoryInstallation, RepositoryPage } from "./types";
import { isValidGitHubUrl } from "./validation";
import { resolveApiBaseUrl } from "./config";
import { clearSharedRequests, shareRequest } from "./requests";

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env);
export const SESSION_EXPIRED_EVENT = "repoagent:session-expired";
let sessionCsrfToken: string | null = null;
let sessionVersion = 0;

// This is an anti-forgery value, never a GitHub access token. Keep it in memory.
export function setSessionCsrfToken(value: string | null): void {
  if (value !== sessionCsrfToken || value === null) {
    sessionVersion += 1;
    clearSharedRequests();
  }
  sessionCsrfToken = value;
}

export function getCsrfHeaders(): Record<string, string> {
  if (!sessionCsrfToken) throw new ApiError(friendlyError("authentication-required"));
  return { "X-CSRF-Token": sessionCsrfToken };
}

export function hasSessionCsrfToken(): boolean {
  return Boolean(sessionCsrfToken);
}

function expireSession() {
  setSessionCsrfToken(null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export async function sessionRequest(
  path: string,
  options: RequestInit = {},
  context: ErrorContext = "auth",
): Promise<unknown> {
  if ((options.method ?? "GET").toUpperCase() === "GET") {
    const headerKey = JSON.stringify([...new Headers(options.headers).entries()].sort());
    return shareRequest(`GET:${API_BASE_URL}${path}:${headerKey}`, signal => performRequest(path, {...options, signal}, context), options.signal);
  }
  return performRequest(path, options, context);
}

async function performRequest(
  path: string,
  options: RequestInit,
  context: ErrorContext,
): Promise<unknown> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes((options.method ?? "GET").toUpperCase())) {
    for (const [key, value] of Object.entries(getCsrfHeaders())) headers.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(mapError(error, undefined, context));
  }
  if (options.signal?.aborted) throw new DOMException("Request canceled", "AbortError");
  if (response.status === 204 && response.ok) return null;
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (options.signal?.aborted) throw new DOMException("Request canceled", "AbortError");
    if (response.ok && path === "/auth/session") {
      throw new ApiError(friendlyError("invalid-session"));
    }
    if (response.status === 401) expireSession();
    throw new ApiError(mapError(null, response.ok ? 503 : response.status, context));
  }
  if (options.signal?.aborted) throw new DOMException("Request canceled", "AbortError");
  if (!response.ok) {
    const error = mapError(data, response.status, context);
    if (response.status === 401 || error.kind === "authentication-required" || error.kind === "session-expired") expireSession();
    throw new ApiError(error);
  }
  return data;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

// Only GitHub installation pages may be opened from server-provided metadata.
function installationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash) return null;
    if (!/^\/(?:apps\/[a-z\d-]+\/installations\/new|settings\/installations(?:\/\d+)?|organizations\/[a-z\d-]+\/settings\/installations(?:\/\d+)?)\/?$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

function repositoryAccess(value: unknown): RepositoryAccess | null {
  const data = object(value);
  if (typeof data.configured !== "boolean") return null;
  const installations: RepositoryInstallation[] = [];
  for (const item of Array.isArray(data.installations) ? data.installations : []) {
    const installation = object(item);
    const manageUrl = installationUrl(installation.manage_url);
    if (typeof installation.id !== "number" || !Number.isSafeInteger(installation.id) || installation.id <= 0 || typeof installation.account !== "string" || !installation.account || !manageUrl || !["selected", "all"].includes(String(installation.repository_selection))) continue;
    installations.push({ id: installation.id, account: installation.account, repository_selection: installation.repository_selection as "selected" | "all", manage_url: manageUrl });
  }
  return {
    configured: data.configured,
    installation_url: installationUrl(data.installation_url),
    manage_url: installationUrl(data.manage_url) ?? "https://github.com/settings/installations",
    installations,
  };
}

export async function getGitHubSession(signal?: AbortSignal): Promise<GitHubSession> {
  const version = sessionVersion;
  const data = object(await sessionRequest("/auth/session", { signal }));
  if (signal?.aborted) throw new DOMException("Request canceled", "AbortError");
  const expectedToken = data.authenticated === true ? data.csrf_token : null;
  if (version !== sessionVersion && expectedToken !== sessionCsrfToken) {
    throw new DOMException("Session changed", "AbortError");
  }
  if (typeof data.authenticated !== "boolean") {
    throw new ApiError(friendlyError("invalid-session"));
  }
  // Older session endpoints omit this optional availability hint. A successful
  // signed-out response still permits login unless the server disables it.
  const configured = data.configured !== false;
  const access = repositoryAccess(data.repository_access);
  if (data.authenticated === false) {
    setSessionCsrfToken(null);
    return { authenticated: false, configured, user: null, ...(access ? { repository_access: access } : {}) };
  }
  const user = object(data.user);
  if (typeof user.id !== "number" || !Number.isFinite(user.id) || typeof user.login !== "string" || !user.login || typeof data.csrf_token !== "string" || !data.csrf_token) {
    throw new ApiError(friendlyError("invalid-session"));
  }
  setSessionCsrfToken(data.csrf_token);
  return {
    authenticated: true,
    configured,
    ...(access ? { repository_access: access } : {}),
    user: {
      id: typeof user.user_id === "number" ? user.user_id : user.id,
      github_id: typeof user.github_id === "number" ? user.github_id : user.id,
      username: user.login,
      avatar_url: typeof user.avatar_url === "string" && user.avatar_url.startsWith("https://") ? user.avatar_url : null,
    },
  };
}

export async function signOutGitHub(signal?: AbortSignal): Promise<void> {
  await sessionRequest("/auth/logout", { method: "POST", signal });
  if (signal?.aborted) throw new DOMException("Request canceled", "AbortError");
  setSessionCsrfToken(null);
}

export async function getGitHubRepositories(page: number | string = 1, signal?: AbortSignal): Promise<RepositoryPage> {
  const query = typeof page === "string" ? `cursor=${encodeURIComponent(page)}` : `page=${page}`;
  const data = object(await sessionRequest(`/auth/repositories?${query}`, { signal }, "repositories"));
  if (!Array.isArray(data.repositories)) throw new ApiError(friendlyError("service-unavailable"));
  const access = repositoryAccess(data.access);
  const repositories: GitHubRepository[] = [];
  // An older API lists every OAuth repository. Require the new access contract
  // before showing results; repository authorization is enforced by the backend.
  for (const value of access?.configured ? data.repositories : []) {
    const repository = object(value);
    if ((typeof repository.id !== "number" && typeof repository.id !== "string") || typeof repository.full_name !== "string" || typeof repository.clone_url !== "string" || !isValidGitHubUrl(repository.clone_url)) continue;
    repositories.push({
      id: repository.id,
      full_name: repository.full_name,
      clone_url: repository.clone_url,
      default_branch: typeof repository.default_branch === "string" ? repository.default_branch : "main",
      private: repository.private === true,
      description: typeof repository.description === "string" ? repository.description : null,
      language: typeof repository.language === "string" ? repository.language : null,
    });
  }
  const hasMore = access?.configured === true && data.has_more === true;
  const nextCursor = hasMore && typeof data.next_cursor === "string" && data.next_cursor.length > 0 && data.next_cursor.length <= 2048 ? data.next_cursor : null;
  return {
    repositories,
    has_more: hasMore,
    next_page: hasMore && !nextCursor && typeof page === "number" && typeof data.next_page === "number" && Number.isInteger(data.next_page) && data.next_page > page ? data.next_page : null,
    next_cursor: nextCursor,
    access,
  };
}
