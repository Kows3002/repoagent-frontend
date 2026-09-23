import { useCallback, useEffect, useRef, useState } from "react";
import { approveJob, createJob, getJob } from "../lib/api";
import { DEFAULT_COMMIT_MESSAGE } from "../lib/commit";
import { friendlyError, isAbortError, mapError } from "../lib/errors";
import type {
  FriendlyError,
  Job,
  JobInput,
  JobPhase,
  JobResult,
} from "../lib/types";

const POLL_INTERVAL_MS = 2_500;

export function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [phase, setPhase] = useState<JobPhase>("idle");
  const [error, setError] = useState<FriendlyError | null>(null);
  const [approvalError, setApprovalError] = useState<FriendlyError | null>(
    null,
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isPushed, setIsPushed] = useState(false);
  const [approvedCommitMessage, setApprovedCommitMessage] = useState<string | null>(null);
  const jobRef = useRef<Job | null>(null);
  const generation = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const approvalController = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitting = useRef(false);
  const approving = useRef(false);
  const pushed = useRef(false);
  const mounted = useRef(true);

  const cancelRequests = useCallback(() => {
    generation.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    requestController.current?.abort();
    approvalController.current?.abort();
    requestController.current = null;
    approvalController.current = null;
    submitting.current = false;
    approving.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRequests();
    };
  }, [cancelRequests]);

  const applyResult = useCallback(
    ({ job: nextJob, error: nextError }: JobResult) => {
      jobRef.current = nextJob;
      setJob(nextJob);
      setError(nextError);
      setPhase(
        nextJob.status === "completed" || nextJob.status === "failed"
          ? nextJob.status
          : "active",
      );
    },
    [],
  );

  const poll = useCallback(
    async function pollJob(id: Job["id"], version: number) {
      if (!mounted.current || version !== generation.current) return;
      const controller = new AbortController();
      requestController.current = controller;
      let shouldContinue = false;
      try {
        const result = await getJob(id, controller.signal);
        if (!mounted.current || version !== generation.current) return;
        applyResult(result);
        shouldContinue =
          result.job.status !== "completed" && result.job.status !== "failed";
      } catch (failure) {
        if (
          !mounted.current ||
          version !== generation.current ||
          isAbortError(failure)
        )
          return;
        const nextError = mapError(failure, undefined, "poll");
        setError(nextError);
        shouldContinue = nextError.retryable;
        if (!shouldContinue) setPhase("failed");
      } finally {
        if (requestController.current === controller)
          requestController.current = null;
        if (
          shouldContinue &&
          mounted.current &&
          version === generation.current
        ) {
          timer.current = setTimeout(
            () => void pollJob(id, version),
            POLL_INTERVAL_MS,
          );
        }
      }
    },
    [applyResult],
  );

  const submit = useCallback(
    async (input: JobInput): Promise<boolean> => {
      if (submitting.current || approving.current) return false;
      cancelRequests();
      const version = generation.current;
      const controller = new AbortController();
      requestController.current = controller;
      submitting.current = true;
      pushed.current = false;
      jobRef.current = null;
      setJob(null);
      setPhase("submitting");
      setError(null);
      setApprovalError(null);
      setIsApproving(false);
      setIsPushed(false);
      setApprovedCommitMessage(null);

      try {
        const result = await createJob(input, controller.signal);
        if (!mounted.current || version !== generation.current) return false;
        applyResult(result);
        if (
          result.job.status !== "completed" &&
          result.job.status !== "failed"
        ) {
          timer.current = setTimeout(
            () => void poll(result.job.id, version),
            POLL_INTERVAL_MS,
          );
        }
        return true;
      } catch (failure) {
        if (
          !mounted.current ||
          version !== generation.current ||
          isAbortError(failure)
        )
          return false;
        setError(mapError(failure, undefined, "create"));
        setPhase("failed");
        return false;
      } finally {
        if (version === generation.current) submitting.current = false;
        if (requestController.current === controller)
          requestController.current = null;
      }
    },
    [applyResult, cancelRequests, poll],
  );

  const approve = useCallback(async (commitMessage = DEFAULT_COMMIT_MESSAGE): Promise<void> => {
    const currentJob = jobRef.current;
    if (
      !currentJob ||
      currentJob.status !== "completed" ||
      approving.current ||
      pushed.current
    )
      return;
    if (!currentJob.diff?.trim()) {
      setApprovalError(friendlyError("nothing-changed"));
      return;
    }
    const version = generation.current;
    const controller = new AbortController();
    approvalController.current = controller;
    approving.current = true;
    setIsApproving(true);
    setApprovalError(null);
    try {
      const committed = await approveJob(currentJob.id, controller.signal, commitMessage);
      if (!mounted.current || version !== generation.current) return;
      pushed.current = true;
      setIsPushed(true);
      setApprovedCommitMessage(committed);
    } catch (failure) {
      if (
        !mounted.current ||
        version !== generation.current ||
        isAbortError(failure)
      )
        return;
      setApprovalError(mapError(failure, undefined, "approve"));
    } finally {
      if (version === generation.current && mounted.current) {
        approving.current = false;
        setIsApproving(false);
      }
      if (approvalController.current === controller)
        approvalController.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancelRequests();
    jobRef.current = null;
    pushed.current = false;
    setJob(null);
    setPhase("idle");
    setError(null);
    setApprovalError(null);
    setIsApproving(false);
    setIsPushed(false);
    setApprovedCommitMessage(null);
  }, [cancelRequests]);

  const retryPolling = useCallback(() => {
    const currentJob = jobRef.current;
    if (
      !currentJob ||
      currentJob.status === "completed" ||
      currentJob.status === "failed"
    )
      return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    requestController.current?.abort();
    generation.current += 1;
    setError(null);
    void poll(currentJob.id, generation.current);
  }, [poll]);

  return {
    job,
    phase,
    error,
    approvalError,
    isApproving,
    isPushed,
    approvedCommitMessage,
    submit,
    approve,
    reset,
    retryPolling,
  };
}
