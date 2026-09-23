import { ApiError, friendlyError, mapError } from "./errors";
import { API_BASE_URL, getGitHubSession, sessionRequest, signOutGitHub } from "./auth";
import type { Job, JobInput, JobResult, JobStatus, User } from "./types";

export { SESSION_EXPIRED_EVENT } from "./auth";
export const githubLoginUrl = `${API_BASE_URL}/auth/github/login`;

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeJob(value: unknown): Job {
  const data = objectValue(value);
  if (
    (typeof data.id !== "string" && typeof data.id !== "number") ||
    (typeof data.id === "string" && !data.id.trim()) ||
    (typeof data.id === "number" && !Number.isFinite(data.id))
  ) {
    throw new ApiError(friendlyError("service-unavailable"));
  }

  const rawStatus =
    typeof data.status === "string"
      ? data.status.trim().toLowerCase().replace(/[ -]/g, "_")
      : "";
  const aliases: Record<string, JobStatus> = {
    queued: "queued",
    pending: "queued",
    analyzing: "analyzing",
    analysing: "analyzing",
    analyzing_repository: "analyzing",
    cloning: "analyzing",
    running: data.ai_result ? "generating" : "analyzing",
    processing: data.ai_result ? "generating" : "analyzing",
    generating: "generating",
    generating_patch: "generating",
    completed: "completed",
    complete: "completed",
    success: "completed",
    failed: "failed",
    error: "failed",
  };
  const status = Object.prototype.hasOwnProperty.call(aliases, rawStatus)
    ? aliases[rawStatus]
    : undefined;
  if (!status) throw new ApiError(friendlyError("service-unavailable"));

  // Retain only the public response fields needed by the workspace.
  return {
    id: data.id,
    status,
    ...(typeof data.repo_url === "string" ? { repo_url: data.repo_url } : {}),
    ...(typeof data.task === "string" ? { task: data.task } : {}),
    diff: typeof data.diff === "string" ? data.diff : null,
    ai_result:
      status !== "failed" && typeof data.ai_result === "string"
        ? data.ai_result
        : null,
  };
}

export function normalizeJobResult(value: unknown): JobResult {
  const job = normalizeJob(value);
  const data = objectValue(value);
  if (job.status === "failed") return { job, error: mapError(data) };
  if (job.status === "completed" && !job.diff?.trim()) {
    const mapped = mapError(data);
    return {
      job,
      error:
        mapped.kind === "file-not-found"
          ? mapped
          : friendlyError("nothing-changed"),
    };
  }
  return { job, error: null };
}

const request = sessionRequest;

export async function createJob(
  input: JobInput,
  signal: AbortSignal,
): Promise<JobResult> {
  const data = await request(
    "/jobs/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_url: input.repo_url.trim(),
        task: input.task.trim(),
      }),
      signal,
    },
    "create",
  );
  return normalizeJobResult(data);
}

export async function getCurrentUser(signal: AbortSignal): Promise<User | null> {
  try {
    return (await getGitHubSession(signal)).user;
  } catch (error) {
    if (error instanceof ApiError && error.friendly.kind === "session-expired")
      return null;
    throw error;
  }
}

export async function logout(signal: AbortSignal): Promise<void> {
  await signOutGitHub(signal);
}

export async function getJob(
  id: Job["id"],
  signal: AbortSignal,
): Promise<JobResult> {
  const data = await request(
    `/jobs/${encodeURIComponent(String(id))}`,
    { signal },
    "poll",
  );
  return normalizeJobResult(data);
}

export function confirmPushResult(value: unknown): void {
  const data = objectValue(value);
  const message =
    typeof data.message === "string" ? data.message.toLowerCase() : "";
  if (
    /nothing to commit|nothing changed|no changes|already up.to.date/.test(
      message,
    )
  ) {
    throw new ApiError(friendlyError("nothing-changed"));
  }
  if (
    data.pushed === true ||
    data.status === "pushed" ||
    /changes pushed successfully|successfully pushed/.test(message)
  ) {
    return;
  }
  throw new ApiError({
    ...friendlyError("push-failed"),
    title: "Could not confirm the push",
    message:
      "Check your repository on GitHub before trying again. RepoAgent did not receive a confirmed push result.",
  });
}

export async function approveJob(
  id: Job["id"],
  signal: AbortSignal,
): Promise<void> {
  const data = await request(
    `/jobs/${encodeURIComponent(String(id))}/approve`,
    { method: "POST", signal },
    "approve",
  );
  confirmPushResult(data);
}
