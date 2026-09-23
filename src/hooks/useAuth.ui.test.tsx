import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";
import { getGitHubRepositories, hasSessionCsrfToken, setSessionCsrfToken } from "../lib/auth";

const session = { authenticated: true, configured: true, user: { id: 100, login: "octocat", avatar_url: null }, csrf_token: "test-session-csrf" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("GitHub session lifecycle", () => {
  beforeEach(() => { setSessionCsrfToken(null); window.history.replaceState({}, "", "/"); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setSessionCsrfToken(null); });

  it("loads public identity and signs out with cookies and CSRF", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({ authenticated: false }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useAuth>, unknown>>;
    await act(async () => { hook = renderHook(() => useAuth()); });
    expect(hook.result.current.user?.username).toBe("octocat");
    expect(hook.result.current.configured).toBe(true);
    expect(hook.result.current.csrfReady).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/auth/session");
    await act(async () => { await hook.result.current.signOut(); });
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.loggingOut).toBe(false);
    expect(hasSessionCsrfToken()).toBe(false);
    expect(fetchMock.mock.calls[1][0]).toBe("/auth/logout");
    const options = fetchMock.mock.calls[1][1] as RequestInit;
    expect(options.credentials).toBe("include");
    expect(new Headers(options.headers).get("X-CSRF-Token")).toBe("test-session-csrf");
    expect(storage).not.toHaveBeenCalled();
  });

  it("returns to signed-out state when repository access reports an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({ detail: "Not authenticated" }, 401)));
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useAuth>, unknown>>;
    await act(async () => { hook = renderHook(() => useAuth()); });
    await act(async () => { await expect(getGitHubRepositories()).rejects.toThrow(); });
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.csrfReady).toBe(false);
    expect(hook.result.current.error?.kind).toBe("session-expired");
  });

  it("exposes setup availability without inventing a signed-in account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ authenticated: false, configured: false, user: null })));
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useAuth>, unknown>>;
    await act(async () => { hook = renderHook(() => useAuth()); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.configured).toBe(false);
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.error).toBeNull();
  });

  it("maps callback errors to fixed messages and removes their query value", async () => {
    window.history.replaceState({}, "", "/?auth_error=raw-secret-from-server&tab=workspace");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ authenticated: false, configured: true, user: null })));
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useAuth>, unknown>>;
    await act(async () => { hook = renderHook(() => useAuth()); });
    expect(hook.result.current.error?.title).toBe("GitHub connection could not be completed");
    expect(JSON.stringify(hook.result.current.error)).not.toContain("raw-secret-from-server");
    expect(window.location.search).toBe("?tab=workspace");
  });
});
