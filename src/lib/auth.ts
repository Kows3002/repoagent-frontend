import { ApiError, friendlyError, mapError, type ErrorContext } from "./errors";
import type { GitHubRepository, GitHubSession, RepositoryPage } from "./types";
import { isValidGitHubUrl } from "./validation";
import { resolveApiBaseUrl } from "./config";

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env);
export const SESSION_EXPIRED_EVENT = "repoagent:session-expired";
let sessionCsrfToken: string | null = null;

// This is an anti-forgery value, never a GitHub access token. Keep it in memory.
export function setSessionCsrfToken(value: string | null): void {
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
  sessionCsrfToken = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export async function sessionRequest(
  path: string,
  options: RequestInit = {},
  context: ErrorContext = "auth",
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
  if (response.status === 401) expireSession();
  if (response.status === 204 && response.ok) return null;
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (options.signal?.aborted) throw new DOMException("Request canceled", "AbortError");
    throw new ApiError(mapError(null, response.ok ? 503 : response.status, context));
  }
  if (!response.ok) {
    const error = mapError(data, response.status, context);
    if ((error.kind === "authentication-required" || error.kind === "session-expired") && response.status !== 401) expireSession();
    throw new ApiError(error);
  }
  return data;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function getGitHubSession(signal?: AbortSignal): Promise<GitHubSession> {
  const data = object(await sessionRequest("/auth/session", { signal }));
  if (signal?.aborted) throw new DOMException("Request canceled", "AbortError");
  if (typeof data.authenticated !== "boolean" || typeof data.configured !== "boolean") {
    throw new ApiError(friendlyError("service-unavailable"));
  }
  if (!data.authenticated) {
    sessionCsrfToken = null;
    return { authenticated: false, configured: data.configured, user: null };
  }
  const user = object(data.user);
  if (typeof user.id !== "number" || !Number.isFinite(user.id) || typeof user.login !== "string" || !user.login || typeof data.csrf_token !== "string" || !data.csrf_token) {
    throw new ApiError(friendlyError("service-unavailable"));
  }
  sessionCsrfToken = data.csrf_token;
  return {
    authenticated: true,
    configured: data.configured,
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
  sessionCsrfToken = null;
}

export async function getGitHubRepositories(page = 1, signal?: AbortSignal): Promise<RepositoryPage> {
  const data = object(await sessionRequest(`/auth/repositories?page=${page}`, { signal }, "repositories"));
  if (!Array.isArray(data.repositories)) throw new ApiError(friendlyError("service-unavailable"));
  const repositories: GitHubRepository[] = [];
  for (const value of data.repositories) {
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
  const hasMore = data.has_more === true;
  return {
    repositories,
    has_more: hasMore,
    next_page: hasMore ? (typeof data.next_page === "number" && Number.isInteger(data.next_page) && data.next_page > page ? data.next_page : page + 1) : null,
  };
}
