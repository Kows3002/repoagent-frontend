import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getCsrfHeaders, getGitHubRepositories, getGitHubSession, hasSessionCsrfToken, sessionRequest, setSessionCsrfToken, signOutGitHub } from "./auth";
import { ApiError } from "./errors";

beforeEach(() => setSessionCsrfToken(null));

test("session responses retain only public identity and initialize in-memory CSRF", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    authenticated: true, configured: true, csrf_token: "csrf-for-session",
    user: { id: 123, login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/123", access_token: "never-return-this" },
    access_token: "never-return-this",
  })));
  const session = await getGitHubSession();
  assert.deepEqual(session.user, { id: 123, github_id: 123, username: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/123" });
  assert.equal(JSON.stringify(session).includes("never-return-this"), false);
  assert.equal(JSON.stringify(session).includes("csrf-for-session"), false);
  assert.equal(getCsrfHeaders()["X-CSRF-Token"], "csrf-for-session");
});

test("signed-out and unconfigured sessions clear anti-forgery state", async (context) => {
  setSessionCsrfToken("old-session");
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ authenticated: false, configured: false, user: null })));
  assert.deepEqual(await getGitHubSession(), { authenticated: false, configured: false, user: null });
  assert.equal(hasSessionCsrfToken(), false);
});

test("mutations require CSRF and logout sends it with session cookies", async (context) => {
  const calls: RequestInit[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    calls.push(options);
    return new Response(null, { status: 204 });
  });
  await assert.rejects(sessionRequest("/jobs/1/approve", { method: "POST" }), ApiError);
  assert.equal(calls.length, 0);
  setSessionCsrfToken("csrf-for-logout");
  await signOutGitHub();
  assert.equal(calls[0].credentials, "include");
  assert.equal(calls[0].method, "POST");
  assert.equal(new Headers(calls[0].headers).get("X-CSRF-Token"), "csrf-for-logout");
  assert.equal(hasSessionCsrfToken(), false);
});

test("repository pages preserve pagination and reject unsafe clone URLs", async (context) => {
  const urls: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ repositories: [
      { id: 1, full_name: "team/private-project", clone_url: "https://github.com/team/private-project.git", default_branch: "develop", private: true, language: "TypeScript", access_token: "never-return" },
      { id: 2, full_name: "team/unsafe", clone_url: "https://token@github.com/team/unsafe.git" },
    ], has_more: true, next_page: 3 }));
  });
  const page = await getGitHubRepositories(2);
  assert.deepEqual(urls, ["/auth/repositories?page=2"]);
  assert.equal(page.repositories.length, 1);
  assert.equal(page.repositories[0].private, true);
  assert.equal(page.repositories[0].default_branch, "develop");
  assert.equal(page.next_page, 3);
  assert.equal(JSON.stringify(page).includes("never-return"), false);
});

test("repository authentication failures clear CSRF and hide server details", async (context) => {
  setSessionCsrfToken("old-session");
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ detail: "expired secret-account-internal" }), { status: 401 }));
  await assert.rejects(getGitHubRepositories(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.friendly.kind, "session-expired");
    assert.equal(JSON.stringify(error).includes("secret-account-internal"), false);
    return true;
  });
  assert.equal(hasSessionCsrfToken(), false);
});

test("an aborted session response cannot replace a newer session's CSRF", async (context) => {
  let resolveRequest!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => { resolveRequest = resolve; });
  context.mock.method(globalThis, "fetch", () => pending);
  const controller = new AbortController();
  const request = getGitHubSession(controller.signal);
  controller.abort();
  setSessionCsrfToken("current-session");
  resolveRequest(new Response(JSON.stringify({ authenticated: true, configured: true, csrf_token: "obsolete-session", user: { id: 1, login: "old-user" } })));
  await assert.rejects(request, (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(getCsrfHeaders()["X-CSRF-Token"], "current-session");
});

test("a minimal successful signed-out session is normal and clears stale credentials", async (context) => {
  setSessionCsrfToken("stale-session");
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ authenticated: false })));
  assert.deepEqual(await getGitHubSession(), { authenticated: false, configured: true, user: null });
  assert.equal(hasSessionCsrfToken(), false);
});

test("signed-out sessions ignore user and CSRF fields that belong to another state", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    authenticated: false, configured: true, user: {id:123, login:"stale-user"}, csrf_token:"stale-token",
  })));
  assert.deepEqual(await getGitHubSession(), { authenticated: false, configured: true, user: null });
  assert.equal(hasSessionCsrfToken(), false);
});

test("unexpected successful session responses are not reported as network failures", async (context) => {
  const responses = [
    new Response(JSON.stringify({ configured: true })),
    new Response(JSON.stringify({ authenticated: true, configured: true, user: null })),
    new Response("<html>Wrong endpoint</html>", { status: 200 }),
  ];
  context.mock.method(globalThis, "fetch", async () => responses.shift()!);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(getGitHubSession(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.friendly.kind, "invalid-session");
      assert.notEqual(error.friendly.title, "Connection interrupted");
      return true;
    });
  }
});

test("network, timeout, and HTTP500 failures remain connection errors", async (context) => {
  const attempts: Array<Error | Response> = [
    new TypeError("Failed to fetch"),
    new DOMException("Request timed out", "TimeoutError"),
    new Response(JSON.stringify({ detail: "Internal server error" }), { status: 500 }),
  ];
  context.mock.method(globalThis, "fetch", async () => {
    const result = attempts.shift()!;
    if (result instanceof Error) throw result;
    return result;
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(getGitHubSession(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.friendly.title, "Connection interrupted");
      return true;
    });
  }
});
