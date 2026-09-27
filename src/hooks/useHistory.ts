import { useCallback, useEffect, useRef, useState } from "react";
import { getActivity, getJobHistory } from "../lib/api";
import { isAbortError, mapError } from "../lib/errors";
import type { ActivityEvent, FriendlyError, Job } from "../lib/types";

interface Request {
  account: number;
  controller: AbortController;
  promise: Promise<void>;
}

export function useHistory(accountId?: number, activityEnabled = false) {
  const [jobs, setJobs] = useState<{account?: number; values: Job[]}>({values: []});
  const [activity, setActivity] = useState<{account?: number; values: ActivityEvent[]}>({values: []});
  const [error, setError] = useState<FriendlyError | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const jobRequest = useRef<Request | null>(null);
  const activityRequest = useRef<Request | null>(null);

  const loadJobs = useCallback((): Promise<void> => {
    if (accountId === undefined) return Promise.resolve();
    const active = jobRequest.current;
    if (active?.account === accountId && !active.controller.signal.aborted) return active.promise;
    active?.controller.abort();
    const controller = new AbortController();
    setJobsLoading(true);
    const promise = getJobHistory(controller.signal).then(values => {
      if (!controller.signal.aborted) setJobs({account: accountId, values});
    }).catch(failure => {
      if (!controller.signal.aborted && !isAbortError(failure)) setError(mapError(failure, undefined, "poll"));
    }).finally(() => {
      if (jobRequest.current?.controller === controller) {
        jobRequest.current = null;
        setJobsLoading(false);
      }
    });
    jobRequest.current = {account: accountId, controller, promise};
    return promise;
  }, [accountId]);

  const loadActivity = useCallback((): Promise<void> => {
    if (accountId === undefined || !activityEnabled) return Promise.resolve();
    const active = activityRequest.current;
    if (active?.account === accountId && !active.controller.signal.aborted) return active.promise;
    active?.controller.abort();
    const controller = new AbortController();
    setActivityLoading(true);
    const promise = getActivity(controller.signal).then(values => {
      if (!controller.signal.aborted) setActivity({account: accountId, values});
    }).catch(failure => {
      if (!controller.signal.aborted && !isAbortError(failure)) setError(mapError(failure, undefined, "auth"));
    }).finally(() => {
      if (activityRequest.current?.controller === controller) {
        activityRequest.current = null;
        setActivityLoading(false);
      }
    });
    activityRequest.current = {account: accountId, controller, promise};
    return promise;
  }, [accountId, activityEnabled]);

  useEffect(() => {
    setError(null);
    setJobs({account: accountId, values: []});
    setJobsLoading(false);
    void loadJobs();
    return () => {
      jobRequest.current?.controller.abort();
      jobRequest.current = null;
    };
  }, [accountId, loadJobs]);

  useEffect(() => {
    setActivity({account: accountId, values: []});
    setActivityLoading(false);
    void loadActivity();
    return () => {
      activityRequest.current?.controller.abort();
      activityRequest.current = null;
    };
  }, [accountId, loadActivity]);

  const refresh = useCallback(async () => {
    setError(null);
    await Promise.all([loadJobs(), loadActivity()]);
  }, [loadJobs, loadActivity]);

  return {
    jobs: accountId !== undefined && jobs.account === accountId ? jobs.values : [],
    activity: accountId !== undefined && activity.account === accountId ? activity.values : [],
    loading: accountId !== undefined && (jobsLoading || (activityEnabled && activityLoading)),
    error: accountId === undefined ? null : error,
    refresh,
  };
}
