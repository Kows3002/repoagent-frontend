import {
  ArrowUpRight,
  CheckCheck,
  GitCommitHorizontal,
  LockKeyhole,
} from "lucide-react";
import type { FriendlyError } from "../lib/types";
import ErrorAlert from "./ErrorAlert";
export default function ApproveCard({
  onApprove,
  isApproving,
  isPushed,
  error,
}: {
  onApprove: () => void;
  isApproving: boolean;
  isPushed: boolean;
  error: FriendlyError | null;
}) {
  return (
    <section
      className={"approve-card" + (isPushed ? " approve-success" : "")}
      aria-labelledby="approve-title"
    >
      <div className="approve-heading">
        <span className="approve-icon">
          {isPushed ? (
            <CheckCheck size={21} />
          ) : (
            <GitCommitHorizontal size={21} />
          )}
        </span>
        <div>
          <h3 id="approve-title">
            {isPushed
              ? "Changes pushed successfully"
              : "Looks good? Make it official."}
          </h3>
          <p>
            {isPushed
              ? "Your approved change is now in your repository."
              : "Review the diff and UI previews, then send your change to GitHub."}
          </p>
        </div>
      </div>
      <div className="commit-message">
        <GitCommitHorizontal size={16} />
        <span>RepoAgent: Apply requested changes</span>
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      {!isPushed ? (
        <button
          className="button button-success"
          disabled={isApproving}
          onClick={onApprove}
        >
          <CheckCheck size={17} />
          {isApproving ? "Pushing your changes…" : "Approve & Push to GitHub"}
          <ArrowUpRight size={16} />
        </button>
      ) : null}
      {!isPushed ? (
        <p className="approve-note">
          <LockKeyhole size={11} /> This will commit and push to the
          repository’s default branch.
        </p>
      ) : (
        <p className="push-confirmation" role="status">
          ✓ Changes pushed successfully
        </p>
      )}
    </section>
  );
}
