import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  approveJob,
  confirmPushResult,
  createJob,
  getJob,
  getCurrentUser,
  logout,
  normalizeJob,
  normalizeJobResult,
} from "./api";
import { ApiError, mapError } from "./errors";
import { setSessionCsrfToken } from "./auth";

beforeEach(() => setSessionCsrfToken("test-session-csrf"));

test("backend running status reflects whether repository analysis is available", () => {
  assert.equal(normalizeJob({ id: 7, status: "running" }).status, "analyzing");
  assert.equal(
    normalizeJob({ id: 7, status: "running", ai_result: "File located." })
      .status,
    "generating",
  );
  assert.equal(
    normalizeJob({ id: 7, status: "Generating Patch" }).status,
    "generating",
  );
});

test("job responses whitelist public fields and never return raw failure details", () => {
  const token = "oauth_test_secret";
  const result = normalizeJobResult({
    id: 7,
    status: "failed",
    access_token: token,
    workspace_path: "private/server/path",
    ai_result: `ERROR: Authentication failed for https://x-access-token:${token}@github.com/me/repo.git`,
  });
  assert.equal(result.error?.kind, "github-access-denied");
  assert.equal(result.job.ai_result, null);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal("access_token" in result.job, false);
  assert.equal("workspace_path" in result.job, false);
});

test("malformed job responses cannot accidentally become a live job", () => {
  for (const value of [
    null,
    {},
    { id: "", status: "queued" },
    { id: 1, status: "unexpected" },
    { id: 1, status: "toString" },
  ]) {
    assert.throws(() => normalizeJob(value), ApiError);
  }
});

test("empty completed diffs explain that no change was generated", () => {
  const result = normalizeJobResult({
    id: 7,
    status: "completed",
    diff: " \n",
  });
  assert.equal(result.job.status, "completed");
  assert.equal(result.error?.kind, "nothing-changed");
  assert.equal(
    normalizeJobResult({ id: 7, status: "completed", diff: "-old\n+new" })
      .error,
    null,
  );
});

test("friendly errors distinguish GitHub, repository, target file, and model failures", () => {
  assert.equal(
    mapError({ detail: "Not authenticated" }, 401).kind,
    "session-expired",
  );
  assert.equal(
    mapError({ detail: "remote: Repository not found." }).kind,
    "repository-not-found",
  );
  assert.equal(
    mapError({ ai_result: "ERROR: No relevant files found" }).kind,
    "file-not-found",
  );
  assert.equal(
    mapError({ detail: "Groq authentication failed" }, 401).kind,
    "service-unavailable",
  );
  assert.equal(
    mapError({ detail: "Job not found" }, 404, "poll").kind,
    "job-not-found",
  );
  assert.equal(mapError(new TypeError("Failed to fetch")).retryable, true);
});

test("an HTTP success alone never marks a push as successful", () => {
  assert.doesNotThrow(() =>
    confirmPushResult({ message: "Changes pushed successfully" }),
  );
  assert.doesNotThrow(() => confirmPushResult({ pushed: true }));
  assert.throws(
    () => confirmPushResult({ message: "Nothing to commit", success: true }),
    (error: unknown) =>
      error instanceof ApiError && error.friendly.kind === "nothing-changed",
  );
  assert.throws(
    () => confirmPushResult({ message: "Accepted" }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.friendly.title === "Could not confirm the push",
  );
});

test("create, poll, and approve use the backend contract without retaining credentials", async (context) => {
  const requests: Array<{ url: string; options: RequestInit | undefined }> = [];
  const responses = [
    {
      id: 42,
      status: "queued",
      repo_url: "https://github.com/me/project.git",
      access_token: "never-retain",
    },
    { id: 42, status: "completed", diff: "-old\n+new" },
    { message: "Changes pushed successfully", job_id: 42 },
  ];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string, options?: RequestInit) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  const controller = new AbortController();
  const result = await createJob(
    {
      repo_url: " https://github.com/me/project.git ",
      task: " Replace old with new. ",
    },
    controller.signal,
  );
  await getJob(result.job.id, controller.signal);
  await approveJob(result.job.id, controller.signal);

  assert.deepEqual(
    requests.map(({ url }) => url),
    ["/jobs/", "/jobs/42", "/jobs/42/approve"],
  );
  assert.equal(requests[0].options?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].options?.body)), {
    repo_url: "https://github.com/me/project.git",
    task: "Replace old with new.",
  });
  assert.equal(requests[2].options?.body, undefined);
  assert.equal(new Headers(requests[0].options?.headers).get("X-CSRF-Token"), "test-session-csrf");
  assert.equal(new Headers(requests[2].options?.headers).get("X-CSRF-Token"), "test-session-csrf");
  assert.equal(new Headers(requests[1].options?.headers).has("X-CSRF-Token"), false);
  assert.equal(requests.every(({ options }) => options?.credentials === "include"), true);
  assert.equal(JSON.stringify(result).includes("never-retain"), false);
  assert.equal(
    requests.every(({ options }) => options?.signal === controller.signal),
    true,
  );
});

test("HTTP error details are replaced with static safe messages", async (context) => {
  const secret = "oauth_do_not_display";
  context.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          detail: `Authentication failed for https://x-access-token:${secret}@github.com/me/repo.git`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
  );
  await assert.rejects(
    approveJob(7, new AbortController().signal),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.friendly.kind, "github-access-denied");
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("session identity contains only public fields and logout includes cookies", async (context) => {
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  context.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    requests.push({ url, options });
    return url === "/auth/session"
      ? new Response(JSON.stringify({ authenticated: true, configured: true, csrf_token: "session-csrf", user: { id: 100, user_id: 1, login: "octocat", avatar_url: null, access_token: "server-secret" } }))
      : new Response(null, { status: 204 });
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await getCurrentUser(signal), { id: 1, github_id: 100, username: "octocat", avatar_url: null });
  await logout(signal);
  assert.deepEqual(requests.map(({ url }) => url), ["/auth/session", "/auth/logout"]);
  assert.equal(requests[1].options?.method, "POST");
  assert.equal(new Headers(requests[1].options?.headers).get("X-CSRF-Token"), "session-csrf");
  assert.ok(requests.every(({ options }) => options?.credentials === "include"));
});

test("an unauthenticated session is a normal signed-out state", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 }));
  assert.equal(await getCurrentUser(new AbortController().signal), null);
});
