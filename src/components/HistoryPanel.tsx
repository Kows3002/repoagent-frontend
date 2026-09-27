import { ArrowUpRight, FolderGit2, History, RotateCcw } from "lucide-react";
import type { FriendlyError, Job } from "../lib/types";
import ErrorAlert from "./ErrorAlert";

export interface HistoryPanelProps {
  jobs: Job[];
  selectedId?: Job["id"];
  loading: boolean;
  error: FriendlyError | null;
  onSelect: (job: Job) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

const statusLabels: Record<Job["status"], string> = {
  queued: "Queued",
  analyzing: "Analyzing",
  generating: "Generating",
  completed: "Ready to review",
  failed: "Failed",
};

function repositoryName(repoUrl: string | undefined): string {
  if (!repoUrl) return "Repository";
  try {
    const segments = new URL(repoUrl).pathname.split("/").filter(Boolean);
    return segments.slice(-2).join("/").replace(/\.git$/i, "") || "Repository";
  } catch {
    return "Repository";
  }
}

function JobTime({ timestamp }: { timestamp: number | null | undefined }) {
  if (!timestamp || !Number.isFinite(timestamp)) return <span className="history-time">Date unavailable</span>;
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return <span className="history-time">Date unavailable</span>;
  return (
    <time className="history-time" dateTime={date.toISOString()} title={date.toLocaleString()}>
      {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}
    </time>
  );
}

export default function HistoryPanel({
  jobs, selectedId, loading, error, onSelect, onRefresh, disabled = false,
}: HistoryPanelProps) {
  return (
    <section className="history-panel" aria-labelledby="history-heading" aria-busy={loading}>
      <div className="panel-heading">
        <div className="panel-heading-copy">
          <h2 id="history-heading">Recent jobs</h2>
          {jobs.length > 0 ? <span className="history-count">{jobs.length}</span> : null}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh job history"
          title="Refresh job history"
          disabled={loading || disabled}
          onClick={onRefresh}
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      </div>

      {error ? <ErrorAlert error={error} onRetry={onRefresh} retryLabel="Retry job history" /> : null}
      {loading && jobs.length === 0 ? (
        <p className="history-loading" role="status">Loading your jobs…</p>
      ) : jobs.length === 0 && !error ? (
        <div className="history-empty">
          <History size={20} aria-hidden="true" />
          <p>Your work starts here.</p>
          <span>Jobs you create will be saved to your account.</span>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="history-list">
          {jobs.map((job) => {
            const pushed = Boolean(job.pushed_at);
            const selected = selectedId !== undefined && String(selectedId) === String(job.id);
            return (
              <li key={job.id}>
                <button
                  type="button"
                  className={`history-item${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  aria-label={`Open job ${job.id}: ${repositoryName(job.repo_url)}`}
                  disabled={disabled}
                  onClick={() => onSelect(job)}
                >
                  <span className="history-item-top">
                    <FolderGit2 size={14} aria-hidden="true" />
                    <span className="history-repository">{repositoryName(job.repo_url)}</span>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </span>
                  <span className="history-task">{job.task?.trim() || "Code change"}</span>
                  <span className="history-item-bottom">
                    <span className={`history-status status-${pushed ? "pushed" : job.status}`}>
                      <span aria-hidden="true" />
                      {pushed ? "Pushed" : statusLabels[job.status]}
                    </span>
                    <JobTime timestamp={job.created_at} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
