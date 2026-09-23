import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  FileDiff,
  GitBranch,
  Github,
  GitCommitHorizontal,
  Lightbulb,
  LockKeyhole,
  Search,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";
import Header from "./components/Header";
import RepoForm from "./components/RepoForm";
import StatusTimeline from "./components/StatusTimeline";
import DiffViewer from "./components/DiffViewer";
import ErrorAlert from "./components/ErrorAlert";
import ApproveCard from "./components/ApproveCard";
import Modal from "./components/Modal";
import PreviewPanel from "./components/PreviewPanel";
import "./auth.css";
import "./preview.css";
import { useJob } from "./hooks/useJob";
import { useAuth } from "./hooks/useAuth";
import { githubLoginUrl } from "./lib/api";
import type { JobStatus } from "./lib/types";

const EXAMPLE_DIFF =
  "diff --git a/src/pages/Login.jsx b/src/pages/Login.jsx\n--- a/src/pages/Login.jsx\n+++ b/src/pages/Login.jsx\n@@ -18,5 +18,5 @@ export default function Login() {\n   return (\n     <Helmet>\n-      <title>Sign in | Visitor Pass</title>\n+      <title>Login | Visitor Pass</title>\n     </Helmet>\n   );";
const statusCopy: Record<
  JobStatus,
  { title: string; detail: string; label: string }
> = {
  queued: {
    title: "Your change is in the queue.",
    detail: "The agent will pick up your task shortly.",
    label: "Queued",
  },
  analyzing: {
    title: "Getting to know your code.",
    detail: "Finding the right files and understanding your request.",
    label: "Analyzing",
  },
  generating: {
    title: "Putting your change together.",
    detail: "Preparing a focused patch for you to review.",
    label: "Generating patch",
  },
  completed: {
    title: "Your change is ready.",
    detail: "Take a look at the diff. The final call is yours.",
    label: "Completed",
  },
  failed: {
    title: "This change needs another look.",
    detail: "See the details below, then adjust your request.",
    label: "Failed",
  },
};

export default function App() {
  const {
    job,
    phase,
    error,
    approvalError,
    isApproving,
    isPushed,
    approvedCommitMessage,
    submit,
    approve,
    retryPolling,
    reset,
  } = useJob();
  const auth = useAuth();
  const previousAccount = useRef<number | null>(null);
  useEffect(() => {
    if (auth.loading) return;
    const currentAccount = auth.user?.github_id ?? null;
    if (currentAccount !== previousAccount.current || !auth.user) reset();
    previousAccount.current = currentAccount;
  }, [auth.loading, auth.user, reset]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showExample, setShowExample] = useState(true);
  const busy = phase === "submitting" || phase === "active" || isApproving || auth.loggingOut;
  const displayStatus = phase === "failed" ? "failed" : job?.status;
  const state = displayStatus ? statusCopy[displayStatus] : null;
  const hasDiff = Boolean(job?.diff?.trim());
  const progress = job
    ? {
        queued: 12,
        analyzing: 38,
        generating: 72,
        completed: 100,
        failed: 100,
      }[job.status]
    : 0;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <Header onHelp={() => setHelpOpen(true)} user={auth.user} onLogout={() => void auth.signOut()} loggingOut={auth.loggingOut} />
      <main id="main" className="page-width main-content">
        <div className="breadcrumb">
          <span className="tiny-grid">
            <i />
            <i />
            <i />
            <i />
          </span>{" "}
          Workspace <ChevronRight size={12} />
          <span>New change</span>
          <span className="workspace-label">
            <span className="status-dot" /> YOUR CODE. YOUR CALL.
          </span>
        </div>
        <section className="page-intro" aria-labelledby="page-title">
          <div>
            <div className="intro-kicker">
              <span /> FROM INTENT TO COMMIT
            </div>
            <h1 id="page-title">
              Your next change, <span>simplified.</span>
            </h1>
            <p>A precise task. A focused diff. A better repository.</p>
          </div>
          <div className="workflow-map" aria-hidden="true">
            <div>
              <span>
                <Terminal size={17} />
              </span>
              <small>Describe</small>
            </div>
            <i />
            <div>
              <span>
                <FileDiff size={17} />
              </span>
              <small>Review</small>
            </div>
            <i />
            <div>
              <span>
                <GitBranch size={17} />
              </span>
              <small>Ship</small>
            </div>
          </div>
        </section>
        <div className="workspace-grid">
          <div className="input-column">
            {auth.error ? <ErrorAlert error={auth.error} onRetry={auth.error.retryable ? () => void auth.refresh() : undefined} retryLabel="Retry sign-in status" /> : null}
            {auth.loading ? (
              <div className="card auth-card" role="status">Checking your GitHub session…</div>
            ) : !auth.user ? (
              <section className="card auth-card" aria-labelledby="sign-in-title">
                <Github size={24} />
                <h2 id="sign-in-title">Your GitHub. Your changes.</h2>
                <p>Sign in to generate a change, review the diff, and push to your repository’s default branch when you approve.</p>
                {auth.configured ? <a className="button button-dark" href={githubLoginUrl}>
                  <Github size={17} /> Continue with GitHub <ArrowRight size={16} />
                </a> : <><button className="button button-dark" disabled><Github size={17} /> Continue with GitHub</button><p className="field-hint">GitHub sign-in is not available yet. The workspace owner needs to finish connecting GitHub.</p></>}
              </section>
            ) : null}
            <RepoForm
              onSubmit={submit}
              busy={busy}
              isSubmitting={phase === "submitting"}
              authenticated={Boolean(auth.user) && auth.csrfReady && !auth.loading}
              accountId={auth.user?.github_id}
            />
            <aside className="prompt-tip">
              <Lightbulb size={17} />
              <div>
                <h3>A little precision goes a long way.</h3>
                <p>
                  Name the file. Describe the change. Tell us what to leave
                  alone.
                </p>
              </div>
            </aside>
          </div>
          <div className="output-column">
            <section className="card status-card" aria-labelledby="job-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">02 / OBSERVE</span>
                  <h2 id="job-title">Live job</h2>
                </div>
                <span
                  className={"status-pill status-" + (displayStatus || "idle")}
                >
                  <span className="status-dot" />
                  {phase === "submitting"
                    ? "Connecting"
                    : isPushed
                      ? "Pushed"
                      : state?.label || "Standby"}
                </span>
              </div>
              <div className="status-content">
                <div
                  className="job-status-message"
                  role="status"
                  aria-live="polite"
                >
                  <h3>
                    {isPushed
                      ? "One more good change, shipped."
                      : state?.title ||
                        (phase === "submitting"
                          ? "Starting your change…"
                          : "Ready when you are.")}
                  </h3>
                  <p>
                    {isPushed
                      ? "Your repository is up to date with your approved change."
                      : state?.detail ||
                        "Add your repository and a task to get things moving."}
                  </p>
                </div>
                <StatusTimeline status={displayStatus} />
                <div
                  className={
                    "progress-track" +
                    (job?.status === "failed" ? " progress-failed" : "")
                  }
                  role="progressbar"
                  aria-label="Job progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  aria-valuetext={state?.label || "Waiting for a job"}
                >
                  <span style={{ width: progress + "%" }} />
                </div>
                <div className="analysis-strip">
                  <div>
                    <span className="analysis-icon">
                      <Code2 size={14} />
                    </span>
                    <span>AI analysis</span>
                  </div>
                  <span>
                    {job?.status === "failed"
                      ? "Stopped"
                      : job?.ai_result
                        ? "Analysis complete"
                        : job?.status === "analyzing"
                          ? "Reading your repository…"
                          : job?.status === "generating"
                            ? "Preparing your patch…"
                            : job?.status === "completed"
                              ? "Complete"
                              : "Waiting for your task"}
                    <span className="analysis-dots">···</span>
                  </span>
                </div>
                {job ? (
                  <div className="job-meta">
                    <span>JOB #{String(job.id).slice(0, 12)}</span>
                    <span>
                      {phase === "active"
                        ? "Updates every 2.5s"
                        : "Latest job status"}
                    </span>
                  </div>
                ) : null}
                {job?.ai_result && job.status !== "failed" ? (
                  <details className="analysis-details">
                    <summary>
                      View analysis <ChevronRight size={13} />
                    </summary>
                    <p>{job.ai_result}</p>
                  </details>
                ) : null}
                {error ? (
                  <ErrorAlert
                    error={error}
                    onRetry={
                      job && phase === "active" ? retryPolling : undefined
                    }
                  />
                ) : null}
              </div>
            </section>
            <section
              className="card review-card"
              aria-labelledby="review-title"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">03 / REVIEW</span>
                  <h2 id="review-title">The change, in detail</h2>
                </div>
                <span className="heading-icon">
                  <FileDiff size={19} />
                </span>
              </div>
              {hasDiff ? (
                <div className="actual-diff">
                  <DiffViewer diff={job!.diff!} />
                </div>
              ) : (
                <>
                  <div className="diff-empty">
                    <div className="diff-empty-art" aria-hidden="true">
                      <span className="art-bracket">[</span>
                      <span className="art-minus">−</span>
                      <span className="art-plus">+</span>
                      <span className="art-bracket">]</span>
                    </div>
                    <h3>
                      {job?.status === "completed"
                        ? "No lines to change."
                        : job?.status === "failed"
                          ? "A fresh start is one task away."
                          : "Every line. In plain sight."}
                    </h3>
                    <p>
                      {job?.status === "completed"
                        ? "The requested text may already match your repository."
                        : job?.status === "failed"
                          ? "Update your request and generate a new change."
                          : "Your generated patch will appear here.\nSee exactly what changes before you approve."}
                    </p>
                  </div>
                  {!job && phase === "idle" ? (
                    <div className="sample-patch">
                      <div className="sample-heading">
                        <span>
                          <span className="sample-dot" /> A SMALL CHANGE, FOR
                          EXAMPLE
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setShowExample(!showExample)}
                        >
                          {showExample ? "Hide example" : "Show example"}
                        </button>
                      </div>
                      {showExample ? (
                        <DiffViewer diff={EXAMPLE_DIFF} isExample />
                      ) : null}
                    </div>
                  ) : null}
                  {phase === "active" ? (
                    <div className="waiting-note">
                      <Search size={14} /> Your diff will appear as soon as it’s
                      ready.
                    </div>
                  ) : null}
                </>
              )}
              <div className="review-assurance">
                <ShieldCheck size={16} />
                <p>
                  Nothing is pushed until <strong>you</strong> approve it.
                </p>
                <LockKeyhole size={12} />
              </div>
            </section>
            {auth.user && job?.status === "completed" && hasDiff ? (
              <ApproveCard
                key={job.id}
                onApprove={approve}
                isApproving={isApproving}
                isPushed={isPushed}
                approvedCommitMessage={approvedCommitMessage}
                error={approvalError}
              />
            ) : null}
          </div>
        </div>
        <PreviewPanel key={job?.id ?? "empty"} job={job} />
        <footer className="page-footer">
          <span>
            <span className="footer-mark">
              <Code2 size={13} />
            </span>{" "}
            Built for intentional changes.
          </span>
          <span>
            Describe <ArrowRight size={11} /> Review <ArrowRight size={11} />{" "}
            Ship <GitCommitHorizontal size={17} />
          </span>
        </footer>
      </main>
      {helpOpen ? (
        <Modal title="From intent to commit" onClose={() => setHelpOpen(false)}>
          <p className="help-intro">
            A small, deliberate workflow for making changes to your code.
          </p>
          <div className="help-steps">
            <div>
              <span>
                <Terminal size={19} />
              </span>
              <section>
                <h3>01. Describe your change</h3>
                <p>
                  Continue with GitHub, then choose one of your repositories.
                  Name the exact file and the change you want.
                </p>
              </section>
            </div>
            <div>
              <span>
                <Workflow size={19} />
              </span>
              <section>
                <h3>02. Follow the work</h3>
                <p>
                  RepoAgent analyzes the repository and generates a patch. The
                  live job panel keeps you up to date.
                </p>
              </section>
            </div>
            <div>
              <span>
                <CheckCheck size={19} />
              </span>
              <section>
                <h3>03. Review, then ship</h3>
                <p>
                  Compare the current and updated UI, then read the diff. Approve only when you’re ready to
                  commit and push directly to the repository’s default branch.
                </p>
              </section>
            </div>
          </div>
          <div className="security-note">
            <Check size={18} />
            <p>
              You stay in control. Generating a patch never pushes it
              automatically.
            </p>
          </div>
          <button
            className="button button-primary modal-action"
            onClick={() => setHelpOpen(false)}
          >
            Let’s make a change <ArrowRight size={16} />
          </button>
        </Modal>
      ) : null}
    </>
  );
}
