import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { clearSharedRequests, shareRequest } from "./requests";
import { getCsrfHeaders, getGitHubRepositories, getGitHubSession, setSessionCsrfToken } from "./auth";

beforeEach(() => { clearSharedRequests(); setSessionCsrfToken(null); });

test("concurrent subscribers share one request but cancellation stays independent", async () => {
  let finish!: (value: string) => void;
  let calls = 0;
  let transport!: AbortSignal;
  const operation = (signal: AbortSignal) => {
    calls += 1;
    transport = signal;
    return new Promise<string>(resolve => { finish = resolve; });
  };
  const first = new AbortController();
  const second = new AbortController();
  const request1 = shareRequest("GET:example", operation, first.signal);
  const request2 = shareRequest("GET:example", operation, second.signal);
  first.abort();
  await assert.rejects(request1, {name: "AbortError"});
  assert.equal(transport.aborted, false);
  finish("response");
  assert.equal(await request2, "response");
  assert.equal(calls, 1);
});

test("effect cleanup and immediate replacement keep one transport alive", async () => {
  let calls = 0;
  let finish!: (value: string) => void;
  const operation = () => {calls += 1; return new Promise<string>(resolve => {finish = resolve;});};
  const controller = new AbortController();
  const first = shareRequest("GET:strict-mode", operation, controller.signal);
  controller.abort();
  const second = shareRequest("GET:strict-mode", operation);
  await assert.rejects(first, {name: "AbortError"});
  finish("ok");
  assert.equal(await second, "ok");
  assert.equal(calls, 1);
});

test("settled responses are never cached and unused requests abort", async () => {
  let calls = 0;
  const operation = async () => ++calls;
  assert.equal(await shareRequest("GET:fresh", operation), 1);
  assert.equal(await shareRequest("GET:fresh", operation), 2);
  let transport!: AbortSignal;
  const controller = new AbortController();
  const request = shareRequest("GET:unused", signal => {
    transport = signal;
    return new Promise(() => undefined);
  }, controller.signal);
  controller.abort();
  await assert.rejects(request, {name: "AbortError"});
  assert.equal(transport.aborted, true);
});

test("session reset aborts stale reads and new accounts cannot reuse them", async context => {
  const signals: AbortSignal[] = [];
  const completions: Array<(value: Response) => void> = [];
  context.mock.method(globalThis, "fetch", (_url: string, options?: RequestInit) => {
    signals.push(options!.signal!);
    return new Promise<Response>(resolve => completions.push(resolve));
  });
  setSessionCsrfToken("first-account");
  const oldRequest = getGitHubRepositories();
  setSessionCsrfToken("second-account");
  const newRequest = getGitHubRepositories();
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  completions[0](new Response(JSON.stringify({repositories: [], has_more: false})));
  await assert.rejects(oldRequest, {name: "AbortError"});
  completions[1](new Response(JSON.stringify({repositories: [], has_more: false})));
  assert.deepEqual((await newRequest).repositories, []);
  assert.equal(getCsrfHeaders()["X-CSRF-Token"], "second-account");
});

test("concurrent session checks parse one response and both receive current identity", async context => {
  let finish!: (value: Response) => void;
  const fetchMock = context.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => {finish = resolve;}));
  const first = getGitHubSession();
  const second = getGitHubSession();
  finish(new Response(JSON.stringify({authenticated:true, csrf_token:"session", user:{id:1,login:"octocat"}})));
  const sessions = await Promise.all([first, second]);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(sessions[0].user?.username, "octocat");
  assert.equal(sessions[1].user?.username, "octocat");
});
