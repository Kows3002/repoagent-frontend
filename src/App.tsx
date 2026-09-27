import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  FileDiff,
  Github,
  GitCommitHorizontal,
  LockKeyhole,
  Search,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";
import Header from "./components/Header";
import HistoryPanel from "./components/HistoryPanel";
import ActivityPanel from "./components/ActivityPanel";
import { SnackbarProvider, useSnackbar } from "./components/Snackbar";
import { useHistory } from "./hooks/useHistory";
import RepoForm from "./components/RepoForm";
import StatusTimeline from "./components/StatusTimeline";
import DiffViewer from "./components/DiffViewer";
import ErrorAlert from "./components/ErrorAlert";
import ApproveCard from "./components/ApproveCard";
import Modal from "./components/Modal";
import PreviewPanel from "./components/PreviewPanel";
import "./auth.css";
import "./preview.css";
import "./workspace.css";
import { useJob } from "./hooks/useJob";
import { useAuth } from "./hooks/useAuth";
import { githubLoginUrl } from "./lib/api";
import type { Job, JobStatus } from "./lib/types";

const EXAMPLE_DIFF =
  "diff --git a/src/pages/Login.jsx b/src/pages/Login.jsx\n--- a/src/pages/Login.jsx\n+++ b/src/pages/Login.jsx\n@@ -18,5 +18,5 @@ export default function Login() {\n   return (\n     <Helmet>\n-      <title>Sign in | Visitor Pass</title>\n+      <title>Login | Visitor Pass</title>\n     </Helmet>\n   );";
const statusCopy: Record<
  JobStatus,
  { title: string; detail: string; label: string }
> = {
  queued: {
    title: "Job queued",
    detail: "Waiting to process your request.",
    label: "Queued",
  },
  analyzing: {
    title: "Analyzing repository",
    detail: "Finding the right files and understanding your request.",
    label: "Analyzing",
  },
  generating: {
    title: "Generating patch",
    detail: "Preparing a focused patch for you to review.",
    label: "Generating patch",
  },
  completed: {
    title: "Ready for review",
    detail: "Review the diff and previews before approving the commit.",
    label: "Completed",
  },
  failed: {
    title: "Change could not be generated",
    detail: "See the details below, then adjust your request.",
    label: "Failed",
  },
};

export default function App() {
  return <SnackbarProvider><Workspace /></SnackbarProvider>;
}

function Workspace() {
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
    selectJob,
    reset,
  } = useJob();
  const auth = useAuth();
  const [view, setView] = useState<"workspace" | "activity">("workspace");
  const [formVersion, setFormVersion] = useState(0);
  const history = useHistory(auth.user?.github_id, view === "activity");
  const { notify, clear } = useSnackbar();
  const lastJobEvent = useRef("");
  useEffect(() => {
    if (!job) { lastJobEvent.current = ""; return; }
    const stage = isPushed ? "pushed" : job.status === "completed" || job.status === "failed" ? job.status : "started";
    const key = `${job.id}:${stage}`;
    if (lastJobEvent.current === key) return;
    lastJobEvent.current = key;
    if (stage === "started") notify({ id: key, tone: "info", title: "Job created", message: "Your repository change is now in progress." });
    if (stage === "completed" && job.diff?.trim()) notify({ id: key, tone: "success", title: "Your change is ready", message: "Review the diff and preview before approving." });
    if (stage === "pushed") notify({ id: key, tone: "success", title: "Changes pushed successfully", message: approvedCommitMessage || "Your approved commit is now on GitHub." });
    void history.refresh();
  }, [job, isPushed, approvedCommitMessage, notify, history.refresh]);
  async function handleSignOut() {
    clear();
    if (await auth.signOut()) {
      setView("workspace");
      notify({ tone: "success", title: "Signed out", message: "Your work is saved to your account." });
    }
  }
  function openHistoryJob(saved: Job) {
    const stage = saved.pushed_at ? "pushed" : saved.status === "completed" || saved.status === "failed" ? saved.status : "started";
    lastJobEvent.current = `${saved.id}:${stage}`;
    if (selectJob(saved)) setView("workspace");
  }
  const previousAccount = useRef<number | null>(null);
  useEffect(() => {
    if (auth.loading) return;
    const currentAccount = auth.user?.github_id ?? null;
    if (currentAccount !== previousAccount.current || !auth.user) reset();
    previousAccount.current = currentAccount;
  }, [auth.loading, auth.user, reset]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showExample, setShowExample] = useState(false);
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
      <Header onHelp={() => setHelpOpen(true)} user={auth.user} onLogout={() => void handleSignOut()} loggingOut={auth.loggingOut}
        view={view} onViewChange={setView} busy={busy}
        onNewChange={() => { reset(); setFormVersion(value => value + 1); setView("workspace"); }} />
      <main id="main" className="page-width main-content">
        <div className="breadcrumb">
          <span className="workspace-slash">/</span> {auth.user?.username || "Personal workspace"} <ChevronRight size={13} />
          <span>{view === "activity" ? "Activity log" : "Repository changes"}</span>
          <span className="workspace-label"><span className={"status-dot" + (auth.user ? " connected-dot" : "")} />{auth.user ? "GitHub connected" : "Not signed in"}</span>
        </div>
        <section className="page-intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">{view === "activity" ? "Activity log" : "Repository workspace"}</h1>
            <p>{view === "activity" ? "Sign-ins, code changes, and approved commits saved to your account." : "Choose a repository, describe a change, and review it before you push."}</p>
          </div>
        </section>
        <div hidden={view !== "workspace"}>
        <div className="workspace-grid">
          <div className="input-column">
            {auth.error ? <ErrorAlert error={auth.error} onRetry={auth.error.retryable ? () => void auth.refresh() : undefined} retryLabel="Retry sign-in status" /> : null}
            {auth.loading ? (
              <div className="card auth-card" role="status">Checking your GitHub session…</div>
            ) : !auth.user ? (
              <section className="card auth-card" aria-labelledby="sign-in-title">
                <Github size={24} />
                <h2 id="sign-in-title">Connect your GitHub account</h2>
                <p>Sign in, then choose which repositories RepoAgent can access on GitHub. You review and approve every change before it is pushed.</p>
                {auth.configured ? <a className="button button-dark" href={githubLoginUrl}>
                  <Github size={17} /> Continue with GitHub <ArrowRight size={16} />
                </a> : <><button className="button button-dark" disabled><Github size={17} /> Continue with GitHub</button><p className="field-hint">GitHub sign-in is not available yet. The workspace owner needs to configure the RepoAgent GitHub App.</p></>}
              </section>
            ) : null}
            <RepoForm
              key={`${auth.user?.github_id ?? "guest"}:${formVersion}`}
              onSubmit={submit}
              busy={busy}
              isSubmitting={phase === "submitting"}
              authenticated={Boolean(auth.user) && auth.csrfReady && !auth.loading}
              accountId={auth.user?.github_id}
            />
            {auth.user ? <HistoryPanel jobs={history.jobs} selectedId={job?.id} loading={history.loading} error={history.error}
              onSelect={openHistoryJob} onRefresh={() => void history.refresh()} disabled={busy} /> : null}
          </div>
          <div className="output-column">
            <section className="card status-card" aria-labelledby="job-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">EXECUTION</span>
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
                      ? "Change pushed to GitHub"
                      : state?.title ||
                        (phase === "submitting"
                          ? "Starting your change…"
                          : "No active job")}
                  </h3>
                  <p>
                    {isPushed
                      ? "Your repository is up to date with your approved change."
                      : state?.detail ||
                        "Choose a repository and describe a change to start a job."}
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
                    <span>Repository analysis</span>
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
                  <span className="eyebrow">REVIEW</span>
                  <h2 id="review-title">Code changes</h2>
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
                        ? "No changes generated"
                        : job?.status === "failed"
                          ? "No patch available"
                          : "Your diff will appear here"}
                    </h3>
                    <p>
                      {job?.status === "completed"
                        ? "The requested text may already match your repository."
                        : job?.status === "failed"
                          ? "Update your request and generate a new change."
                          : "Added and removed lines will be highlighted for review."}
                    </p>
                  </div>
                  {!job && phase === "idle" ? (
                    <div className="sample-patch">
                      <div className="sample-heading">
                        <span>
                          <span className="sample-dot" /> Example diff
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
        </div>
        {view === "activity" && auth.user ? <ActivityPanel activity={history.activity} loading={history.loading} error={history.error} onRefresh={() => void history.refresh()} /> : null}
        <footer className="page-footer">
          <span>
            <span className="footer-mark">
              <Code2 size={13} />
            </span>{" "}
            RepoAgent / Repository workspace
          </span>
          <span>
            Describe <ArrowRight size={11} /> Review <ArrowRight size={11} />{" "}
            Ship <GitCommitHorizontal size={17} />
          </span>
        </footer>
      </main>
      {helpOpen ? (
        <Modal title="How RepoAgent works" onClose={() => setHelpOpen(false)}>
          <p className="help-intro">
            Connect a repository, generate a patch, and review it before pushing.
          </p>
          <div className="help-steps">
            <div>
              <span>
                <Terminal size={19} />
              </span>
              <section>
                <h3>01. Describe your change</h3>
                <p>
                  Continue with GitHub, then select repositories in the GitHub App installation settings.
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
              Generating a patch never pushes it automatically.
            </p>
          </div>
          <button
            className="button button-primary modal-action"
            onClick={() => setHelpOpen(false)}
          >
            Back to workspace <ArrowRight size={16} />
          </button>
        </Modal>
      ) : null}
    </>
  );
}
