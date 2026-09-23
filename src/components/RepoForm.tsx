import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, GitFork, LockKeyhole, Terminal } from "lucide-react";
import TaskInput from "./TaskInput";
import RepositoryPicker from "./RepositoryPicker";
import type { GitHubRepository, JobInput } from "../lib/types";
import "../auth.css";

export default function RepoForm({ onSubmit, busy, isSubmitting, authenticated, accountId }: {
  onSubmit: (input: JobInput) => Promise<boolean>;
  busy: boolean;
  isSubmitting: boolean;
  authenticated: boolean;
  accountId?: string | number;
}) {
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [task, setTask] = useState("");
  useEffect(() => { setRepository(null); }, [authenticated, accountId]);
  const filled = Boolean(repository && task.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository || !task.trim() || busy || !authenticated) return;
    await onSubmit({ repo_url: repository.clone_url, task: task.trim() });
  }

  return <section className="card form-card" aria-labelledby="configuration-title">
    <div className="section-heading"><div><span className="eyebrow">01 / CONFIGURE</span><h2 id="configuration-title">Start a new change</h2></div><span className="heading-icon"><Terminal size={19} /></span></div>
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-body">
        {authenticated ? <RepositoryPicker accountId={accountId ?? "connected-account"} selected={repository} onChange={setRepository} disabled={busy} /> : <div className="field">
          <label htmlFor="disconnected-repository">GitHub repository</label>
          <button id="disconnected-repository" type="button" className="repository-trigger" disabled><GitFork size={17} /><span>Connect GitHub to choose a repository</span></button>
          <p className="field-hint">Your repositories will appear here after you sign in.</p>
        </div>}
        <TaskInput value={task} onChange={setTask} disabled={busy} />
      </div>
      <div className="form-actions">
        <button className="button button-primary generate-button" type="submit" disabled={!filled || busy || !authenticated}><Terminal size={17} /><span>{isSubmitting ? "Creating your job..." : busy ? "Change in progress..." : "Generate Code Change"}</span><ArrowRight size={17} /></button>
        <p><LockKeyhole size={12} />You review every change before it is pushed.</p>
      </div>
    </form>
  </section>;
}

