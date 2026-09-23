import { useCallback, useEffect, useState } from "react";
import { fetchPreview, startPreview, type PreviewResult } from "../lib/preview";
import { isAbortError, mapError } from "../lib/errors";
import type { FriendlyError } from "../lib/types";

export function usePreview(jobId: string | number | undefined, enabled: boolean) {
  const [preview, setPreview] = useState<PreviewResult>({status: "idle"});
  const [error, setError] = useState<FriendlyError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setPreview({status: "idle"});
    setError(null);
    if (jobId === undefined || !enabled) return () => controller.abort();
    async function check(initial: boolean) {
      try {
        let result = await fetchPreview(jobId!, controller.signal);
        if (!active) return;
        if (initial && (result.status === "idle" || (attempt > 0 && ["failed", "unsupported"].includes(result.status)))) {
          result = await startPreview(jobId!, controller.signal);
          if (!active) return;
        }
        setPreview(result);
        setError(null);
        if (result.status === "building" || result.status === "idle") timer = setTimeout(() => void check(false), 2500);
      } catch (failure) {
        if (!active || isAbortError(failure)) return;
        setError(mapError(failure, undefined, "poll"));
      }
    }
    void check(true);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [jobId, enabled, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { preview, error, retry };
}
