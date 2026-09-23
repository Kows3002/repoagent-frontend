import { useId, useState } from "react";
import {
  ArrowUpRight,
  CheckCheck,
  GitCommitHorizontal,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import {
  DEFAULT_COMMIT_MESSAGE,
  MAX_COMMIT_MESSAGE_LENGTH,
  getCommitMessageError,
} from "../lib/commit";
import type { FriendlyError } from "../lib/types";
import ErrorAlert from "./ErrorAlert";

export default function ApproveCard({
  onApprove,
  isApproving,
  isPushed,
  approvedCommitMessage,
  error,
}: {
  onApprove: (commitMessage: string) => void | Promise<void>;
  isApproving: boolean;
  isPushed: boolean;
  approvedCommitMessage: string | null;
  error: FriendlyError | null;
}) {
  const inputId = useId();
  const [commitMessage, setCommitMessage] = useState(DEFAULT_COMMIT_MESSAGE);
  const validationError = getCommitMessageError(commitMessage);

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
      <form
        className="approve-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isApproving && !isPushed && !validationError) {
            void onApprove(commitMessage.trim());
          }
        }}
      >
        {isPushed ? (
          <>
            <p className="commit-label">Commit message</p>
            <div className="commit-message commit-message-saved">
              <GitCommitHorizontal size={16} aria-hidden="true" />
              <span>{approvedCommitMessage ?? commitMessage.trim()}</span>
            </div>
          </>
        ) : (
          <>
            <label className="commit-label" htmlFor={inputId}>
              Commit message
            </label>
            <div className={"commit-message" + (validationError ? " commit-message-invalid" : "")}>
              <GitCommitHorizontal size={16} aria-hidden="true" />
              <input
                id={inputId}
                name="commit_message"
                type="text"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                maxLength={MAX_COMMIT_MESSAGE_LENGTH}
                required
                disabled={isApproving}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(validationError)}
                aria-describedby={`${inputId}-hint`}
              />
              <Pencil size={13} aria-hidden="true" />
            </div>
            <p
              id={`${inputId}-hint`}
              className={"commit-hint" + (validationError ? " commit-error" : "")}
              aria-live="polite"
            >
              {validationError ?? "Edit the message that will appear in your repository’s commit history."}
            </p>
          </>
        )}
        {error ? <ErrorAlert error={error} /> : null}
        {!isPushed ? (
          <button
            className="button button-success"
            type="submit"
            disabled={isApproving || Boolean(validationError)}
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
      </form>
    </section>
  );
}
