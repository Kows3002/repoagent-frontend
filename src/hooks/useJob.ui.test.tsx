import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJob } from "./useJob";
import { setSessionCsrfToken } from "../lib/auth";

const input = {
  repo_url: "https://github.com/example/project.git",
  task: "Replace the title in src/App.tsx.",
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("useJob lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); setSessionCsrfToken("test-csrf"); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setSessionCsrfToken(null);
  });

  it("polls through backend stages, stops at completion, and pushes only on explicit approval", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 1, status: "queued" }))
      .mockResolvedValueOnce(json({ id: 1, status: "running" }))
      .mockResolvedValueOnce(
        json({
          id: 1,
          status: "running",
          ai_result: "Located the requested file.",
        }),
      )
      .mockResolvedValueOnce(
        json({ id: 1, status: "completed", diff: "-old\n+new" }),
      )
      .mockResolvedValueOnce(json({ message: "Changes pushed successfully" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJob());

    await act(async () => {
      await result.current.submit(input);
    });
    expect(result.current.job?.status).toBe("queued");
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.job?.status).toBe("analyzing");
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.job?.status).toBe("generating");
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.phase).toBe("completed");
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.isPushed).toBe(false);

    await act(async () => {
      await result.current.approve();
    });
    expect(fetchMock.mock.calls[4][0]).toBe("/jobs/1/approve");
    expect(result.current.isPushed).toBe(true);
    await act(async () => {
      await result.current.approve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not overlap slow polls and aborts the active request on unmount", async () => {
    let resolvePoll!: (response: Response) => void;
    const pendingPoll = new Promise<Response>((resolve) => {
      resolvePoll = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 1, status: "queued" }))
      .mockReturnValueOnce(pendingPoll);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useJob());
    await act(async () => {
      await result.current.submit(input);
    });
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const signal = (fetchMock.mock.calls[1][1] as RequestInit).signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolvePoll(json({ id: 1, status: "completed", diff: "-old\n+new" }));
    });
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a late response from a canceled job after reset", async () => {
    let resolveOld!: (response: Response) => void;
    const pendingRequest = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(pendingRequest)
      .mockResolvedValueOnce(json({ id: 2, status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJob());
    let firstRequest!: Promise<boolean>;
    act(() => {
      firstRequest = result.current.submit(input);
    });
    act(() => result.current.reset());
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(
      true,
    );
    await act(async () => {
      await result.current.submit(input);
    });
    await act(async () => {
      resolveOld(json({ id: 1, status: "completed", diff: "-old\n+new" }));
      await firstRequest;
    });
    expect(result.current.job?.id).toBe(2);
    expect(result.current.phase).toBe("active");
  });

  it("recovers from a transient polling error without resubmitting the job", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 1, status: "queued" }))
      .mockRejectedValueOnce(new TypeError("Network disconnected"))
      .mockResolvedValueOnce(
        json({ id: 1, status: "completed", diff: "-old\n+new" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJob());
    await act(async () => {
      await result.current.submit(input);
    });
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.error?.kind).toBe("service-unavailable");
    expect(result.current.phase).toBe("active");
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBe("completed");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/jobs/",
      "/jobs/1",
      "/jobs/1",
    ]);
  });

  it("does not attempt a push when there is no generated diff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 1, status: "completed", diff: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJob());
    await act(async () => {
      await result.current.submit(input);
    });
    expect(result.current.error?.kind).toBe("nothing-changed");
    await act(async () => {
      await result.current.approve();
    });
    expect(result.current.approvalError?.kind).toBe("nothing-changed");
    expect(result.current.isPushed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("releases the form after a permanent polling failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 1, status: "queued" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Job not found" }), {
          status: 404,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJob());
    await act(async () => {
      await result.current.submit(input);
    });
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(result.current.error?.kind).toBe("job-not-found");
    expect(result.current.phase).toBe("failed");
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("stores the actual committed message and clears it for a new job and logout", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({id: 1, status: "completed", diff: "-old\n+new"}))
      .mockResolvedValueOnce(json({message: "Changes pushed successfully", commit_message: "Actual committed title"}))
      .mockResolvedValueOnce(json({id: 2, status: "completed", diff: "-old\n+new"}))
      .mockResolvedValueOnce(json({message: "Changes pushed successfully", commit_message: "Second job title"}));
    vi.stubGlobal("fetch", fetchMock);
    const {result} = renderHook(() => useJob());

    await act(async () => { await result.current.submit(input); });
    await act(async () => { await result.current.approve("Requested title"); });
    expect(result.current.approvedCommitMessage).toBe("Actual committed title");
    expect(result.current.isPushed).toBe(true);

    await act(async () => { await result.current.submit(input); });
    expect(result.current.approvedCommitMessage).toBeNull();
    expect(result.current.isPushed).toBe(false);
    await act(async () => { await result.current.approve("Second job title"); });
    expect(result.current.approvedCommitMessage).toBe("Second job title");

    act(() => result.current.reset());
    expect(result.current.approvedCommitMessage).toBeNull();
    expect(result.current.isPushed).toBe(false);
    expect(result.current.job).toBeNull();
  });

  it("ignores a late approval response after the account is reset", async () => {
    let resolvePush!: (response: Response) => void;
    const pendingPush = new Promise<Response>((resolve) => { resolvePush = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({id: 1, status: "completed", diff: "-old\n+new"}))
      .mockReturnValueOnce(pendingPush);
    vi.stubGlobal("fetch", fetchMock);
    const {result} = renderHook(() => useJob());
    await act(async () => { await result.current.submit(input); });
    let approval!: Promise<void>;
    act(() => { approval = result.current.approve("First account title"); });

    act(() => result.current.reset());
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(true);
    await act(async () => {
      resolvePush(json({message: "Changes pushed successfully", commit_message: "First account title"}));
      await approval;
    });

    expect(result.current.approvedCommitMessage).toBeNull();
    expect(result.current.isPushed).toBe(false);
    expect(result.current.job).toBeNull();
  });

});
