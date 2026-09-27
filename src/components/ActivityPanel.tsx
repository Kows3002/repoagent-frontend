import { CheckCheck, CircleAlert, GitCommitHorizontal, LogIn, LogOut, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActivityEvent, FriendlyError } from "../lib/types";
import ErrorAlert from "./ErrorAlert";

export interface ActivityPanelProps {
  activity: ActivityEvent[];
  loading: boolean;
  error: FriendlyError | null;
  onRefresh: () => void;
}

const eventLabels: Record<string, { label: string; Icon: LucideIcon }> = {
  login: { label: "Signed in", Icon: LogIn },
  logout: { label: "Signed out", Icon: LogOut },
  job_created: { label: "Job created", Icon: Plus },
  job_completed: { label: "Change ready", Icon: CheckCheck },
  job_failed: { label: "Job failed", Icon: CircleAlert },
  job_pushed: { label: "Pushed to GitHub", Icon: GitCommitHorizontal },
};
const fallbackEvent = { label: "Account update", Icon: ShieldCheck };

function ActivityTime({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp * 1000);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return <span>Date unavailable</span>;
  return (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      }).format(date)}
    </time>
  );
}

export default function ActivityPanel({ activity, loading, error, onRefresh }: ActivityPanelProps) {
  return (
    <section className="activity-panel" aria-labelledby="activity-heading" aria-busy={loading}>
      <div className="panel-heading">
        <div className="panel-heading-copy">
          <h2 id="activity-heading">Account activity</h2>
          <p>Your sign-ins, code changes, and pushes.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh account activity"
          title="Refresh account activity"
          disabled={loading}
          onClick={onRefresh}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
      {error ? <ErrorAlert error={error} onRetry={onRefresh} retryLabel="Retry account activity" /> : null}
      {loading && activity.length === 0 ? (
        <p className="history-loading" role="status">Loading your activity…</p>
      ) : activity.length === 0 && !error ? (
        <div className="history-empty">
          <ShieldCheck size={22} aria-hidden="true" />
          <p>No activity yet.</p>
          <span>Your account activity will appear here.</span>
        </div>
      ) : null}
      {activity.length > 0 ? (
        <ol className="activity-list">
          {activity.map((event) => {
            const { label, Icon } = Object.hasOwn(eventLabels, event.kind) ? eventLabels[event.kind] : fallbackEvent;
            return (
              <li className="activity-item" key={event.id}>
                <span className="activity-icon"><Icon size={17} aria-hidden="true" /></span>
                <div className="activity-content">
                  <strong className="activity-label">{label}</strong>
                  <p className="activity-message">{event.message}</p>
                  <div className="activity-meta">
                    <ActivityTime timestamp={event.created_at} />
                    {event.job_id !== null && event.job_id !== undefined ? <span>Job #{event.job_id}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
