import type { FriendlyError } from "./types";

export type ErrorContext = "create" | "poll" | "approve" | "auth" | "repositories" | "preview";

const messages: Record<FriendlyError["kind"], Omit<FriendlyError, "kind">> = {
  "authentication-required": {
    title: "Reconnect your GitHub account",
    message: "Your GitHub connection needs to be refreshed. Sign in again to continue with your repositories.",
    retryable: false,
  },
  "session-expired": {
    title: "Sign in to continue",
    message:
      "Your session has ended. Continue with GitHub to sign in again.",
    retryable: false,
  },
  "github-access-denied": {
    title: "GitHub access required",
    message:
      "Make sure your GitHub account can write to this repository. If access was revoked, sign out and continue with GitHub again.",
    retryable: false,
  },
  "repository-not-found": {
    title: "Repository not found",
    message:
      "Choose a repository your connected GitHub account can access.",
    retryable: false,
  },
  "file-not-found": {
    title: "AI couldn't locate the file",
    message:
      "Include the exact file path in your task, then generate the change again.",
    retryable: false,
  },
  "nothing-changed": {
    title: "Nothing changed",
    message:
      "No changes were generated. The requested text may already match the repository. Check the file path and text in your task.",
    retryable: false,
  },
  "invalid-session": {
    title: "Sign-in response not recognized",
    message:
      "The service returned an unexpected sign-in response. Please try again or check that the API is up to date.",
    retryable: true,
  },
  "service-unavailable": {
    title: "Connection interrupted",
    message:
      "RepoAgent could not reach the service. Check your connection and try again.",
    retryable: true,
  },
  "job-not-found": {
    title: "Job is no longer available",
    message:
      "This job could not be found. Generate a new code change to continue.",
    retryable: false,
  },
  "invalid-request": {
    title: "Check your request",
    message:
      "Choose a GitHub repository and describe the code change you want to make.",
    retryable: false,
  },
  "push-failed": {
    title: "Could not push the changes",
    message:
      "Check your GitHub account permissions and repository branch rules, then try again. Your generated diff is still available to review.",
    retryable: true,
  },
  unknown: {
    title: "The change could not be completed",
    message:
      "Check the repository and use an exact file path and precise instructions, then try again.",
    retryable: false,
  },
};

export function friendlyError(kind: FriendlyError["kind"]): FriendlyError {
  return { kind, ...messages[kind] };
}

// Backend failures can include git commands, credentials, and stack traces.
// Inspect them only to choose an approved message; never return their text.
function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value !== "object" || value === null) return "";
  const object = value as Record<string, unknown>;
  return ["detail", "message", "error", "ai_result"]
    .map((key) => (typeof object[key] === "string" ? object[key] : ""))
    .join(" ");
}

export function mapError(
  value: unknown,
  status?: number,
  context: ErrorContext = "create",
): FriendlyError {
  if (value instanceof ApiError) return value.friendly;
  const detail = errorText(value).toLowerCase();

  // Model-provider failures are unrelated to the user's GitHub session.
  if (/groq|ollama|openai|model provider|rate.?limit|quota/.test(detail)) {
    return {
      ...friendlyError("service-unavailable"),
      title: "Code generation is unavailable",
      message:
        "The code generation service could not finish this request. Please try again shortly.",
    };
  }
  if (
    /nothing to commit|nothing changed|no changes|already matches|empty (?:diff|patch)/.test(
      detail,
    )
  ) {
    return friendlyError("nothing-changed");
  }
  if (/job not found/.test(detail) || (context === "poll" && status === 404)) {
    return friendlyError("job-not-found");
  }
  if (
    /repository not found|repository .* does not exist|remote: not found|could not find repository/.test(
      detail,
    )
  ) {
    return friendlyError("repository-not-found");
  }
  if (
    /file not found|no such file|could(?:n't| not) (?:locate|find) (?:the )?file|no relevant files|target file.*(?:missing|not found)|workspace not found/.test(
      detail,
    )
  ) {
    return friendlyError("file-not-found");
  }
  if (status === 401) return friendlyError("session-expired");
  if (/csrf|session.*(?:refresh|expired)|not authenticated/.test(detail)) return friendlyError("authentication-required");
  if (
    status === 403 ||
    /bad credentials|authentication failed|invalid.*token|token.*(?:invalid|expired)|permission denied|could not read (?:username|password)|write access .*not granted/.test(
      detail,
    )
  ) {
    return friendlyError("github-access-denied");
  }
  if (status === 422 || (context === "create" && status === 400)) {
    return friendlyError("invalid-request");
  }
  if (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    value instanceof TypeError
  ) {
    return friendlyError("service-unavailable");
  }
  if (context === "approve") return friendlyError("push-failed");
  if (context === "poll" || context === "auth" || context === "repositories" || context === "preview")
    return friendlyError("service-unavailable");
  return friendlyError("unknown");
}

export class ApiError extends Error {
  readonly friendly: FriendlyError;

  constructor(friendly: FriendlyError) {
    super(friendly.title);
    this.name = "ApiError";
    this.friendly = friendly;
  }
}

export function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError";
}
