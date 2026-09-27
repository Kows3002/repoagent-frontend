import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useHistory } from "./useHistory";
import { setSessionCsrfToken } from "../lib/auth";

const json = (value: unknown) => new Response(JSON.stringify(value));
const job = {id: 1, status: "completed", diff: "-old\n+new", created_at: null, pushed_at: 1700000000, commit_message: "Saved message"};
beforeEach(() => setSessionCsrfToken("account-one"));
afterEach(() => {cleanup(); setSessionCsrfToken(null); vi.unstubAllGlobals();});

it("fetches history once in StrictMode and loads activity only when opened", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => json(url === "/jobs" ? [job] : []));
  vi.stubGlobal("fetch", fetchMock);
  const {result, rerender} = renderHook(({account, activity}) => useHistory(account, activity), {
    initialProps: {account: 1 as number | undefined, activity: false}, wrapper: StrictMode,
  });
  await waitFor(() => expect(result.current.jobs).toHaveLength(1));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/jobs"]);
  const refresh = result.current.refresh;
  rerender({account: 1, activity: false});
  expect(result.current.refresh).toBe(refresh);
  rerender({account: 1, activity: true});
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/jobs", "/auth/activity"]);
  await act(async () => {await Promise.all([result.current.refresh(), result.current.refresh()]);});
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/jobs", "/auth/activity", "/jobs", "/auth/activity"]);
  rerender({account: undefined, activity: true});
  expect(result.current.jobs).toEqual([]);
  expect(result.current.activity).toEqual([]);
});

it("ignores late history from a previous account", async () => {
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => {finish = resolve;}))
    .mockResolvedValueOnce(json([{...job, id: 2}]));
  vi.stubGlobal("fetch", fetchMock);
  const {result, rerender} = renderHook(({account}) => useHistory(account), {initialProps: {account: 1}});
  act(() => {setSessionCsrfToken("account-two"); rerender({account: 2});});
  await waitFor(() => expect(result.current.jobs[0]?.id).toBe(2));
  await act(async () => {finish(json([job]));});
  expect(result.current.jobs[0]?.id).toBe(2);
  expect(result.current.loading).toBe(false);
});

it("never fetches persisted account data before sign-in", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const {result} = renderHook(() => useHistory(undefined, true));
  await act(async () => {await result.current.refresh();});
  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
});
