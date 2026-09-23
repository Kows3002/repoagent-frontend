export type JobStatus =
  "queued" | "analyzing" | "generating" | "completed" | "failed";

export type JobPhase =
  "idle" | "submitting" | "active" | "completed" | "failed";

export interface JobInput {
  repo_url: string;
  task: string;
}

export interface User {
  id: number;
  github_id: number;
  username: string;
  avatar_url: string | null;
}

export interface GitHubRepository {
  id: string | number;
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  description: string | null;
  language: string | null;
}

export interface GitHubSession {
  authenticated: boolean;
  configured: boolean;
  user: User | null;
}

export interface RepositoryPage {
  repositories: GitHubRepository[];
  has_more: boolean;
  next_page: number | null;
}

export interface Job {
  id: string | number;
  status: JobStatus;
  repo_url?: string;
  task?: string;
  diff: string | null;
  ai_result: string | null;
}

export type ErrorKind =
  | "session-expired"
  | "authentication-required"
  | "github-access-denied"
  | "repository-not-found"
  | "file-not-found"
  | "nothing-changed"
  | "invalid-session"
  | "service-unavailable"
  | "job-not-found"
  | "invalid-request"
  | "push-failed"
  | "unknown";

export interface FriendlyError {
  kind: ErrorKind;
  title: string;
  message: string;
  retryable: boolean;
}

export interface JobResult {
  job: Job;
  error: FriendlyError | null;
}
