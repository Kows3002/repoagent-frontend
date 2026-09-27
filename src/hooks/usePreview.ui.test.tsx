import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePreview } from "./usePreview";
import { startPreview } from "../lib/preview";
import { setSessionCsrfToken } from "../lib/auth";

const json = (value: unknown) => new Response(JSON.stringify(value));
beforeEach(() => setSessionCsrfToken("test-session"));
afterEach(() => {cleanup(); setSessionCsrfToken(null); vi.unstubAllGlobals();});

it("performs one preview check and one build start under StrictMode", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({status: "idle"})).mockResolvedValueOnce(json({status: "unsupported"}));
  vi.stubGlobal("fetch", fetchMock);
  const {result} = renderHook(() => usePreview(42, true), {wrapper: StrictMode});
  await waitFor(() => expect(result.current.preview.status).toBe("unsupported"));
  expect(fetchMock.mock.calls).toHaveLength(2);
  expect(fetchMock.mock.calls.map(([, options]) => options.method ?? "GET")).toEqual(["GET", "POST"]);
});

it("shares a pending build start and keeps it alive when one subscriber leaves", async () => {
  let finish!: (value: Response) => void;
  const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(resolve => {finish = resolve;}));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const first = startPreview(42, controller.signal);
  const second = startPreview(42, new AbortController().signal);
  controller.abort();
  await expect(first).rejects.toMatchObject({name: "AbortError"});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
  await act(async () => {finish(json({status:"building"}));});
  expect((await second).status).toBe("building");
});
