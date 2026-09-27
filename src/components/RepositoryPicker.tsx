import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, GitBranch, GitFork, LockKeyhole, RefreshCw, Search } from "lucide-react";
import { getGitHubRepositories } from "../lib/auth";
import { isAbortError, mapError } from "../lib/errors";
import type { FriendlyError, GitHubRepository, RepositoryAccess } from "../lib/types";
import ErrorAlert from "./ErrorAlert";
import "../access.css";

export default function RepositoryPicker({ accountId, selected, onChange, disabled }: {
  accountId: string | number;
  selected: GitHubRepository | null;
  onChange: (repository: GitHubRepository | null) => void;
  disabled: boolean;
}) {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [access, setAccess] = useState<RepositoryAccess | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [nextPage, setNextPage] = useState<number | string | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const returningFromGitHub = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const loadPage = useCallback(async (page: number | string, replace = false) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getGitHubRepositories(page, request.signal);
      if (version !== requestVersion.current || request.signal.aborted) return;
      setAccess(result.access);
      setRepositories((previous) => {
        const merged = replace ? result.repositories : [...previous, ...result.repositories];
        return Array.from(new Map(merged.map((repository) => [repository.id, repository])).values());
      });
      setNextPage(result.next_cursor ?? result.next_page);
    } catch (failure) {
      if (version !== requestVersion.current || request.signal.aborted || isAbortError(failure)) return;
      setError(mapError(failure, undefined, "repositories"));
    } finally {
      if (version === requestVersion.current && !request.signal.aborted) setLoading(false);
    }
  }, []);

  const refreshAccess = useCallback(() => {
    if (disabled) return;
    returningFromGitHub.current = false;
    onChange(null);
    setRepositories([]);
    setNextPage(null);
    setOpen(false);
    setQuery("");
    void loadPage(1, true);
  }, [disabled, loadPage, onChange]);

  useEffect(() => {
    onChange(null);
    setRepositories([]);
    setAccess(null);
    setQuery("");
    setOpen(false);
    setNextPage(null);
    returningFromGitHub.current = false;
    void loadPage(1, true);
    return () => {
      requestVersion.current += 1;
      controller.current?.abort();
    };
  }, [accountId, loadPage, onChange]);

  useEffect(() => {
    const returned = () => {
      if (returningFromGitHub.current && !disabled && document.visibilityState !== "hidden") refreshAccess();
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    return () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [disabled, refreshAccess]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const openGitHub = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (disabled || loading) { event.preventDefault(); return; }
    returningFromGitHub.current = true;
  };
  const installations = access?.installations ?? [];
  const ready = access?.configured === true;
  const setupNeeded = ready && !installations.length && !repositories.length;
  const manageUrl = installations.length === 1 ? installations[0].manage_url : access?.manage_url;
  const hasAllRepositories = installations.some(installation => installation.repository_selection === "all");
  const filtered = repositories.filter((repository) =>
    `${repository.full_name} ${repository.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return <div className="field repository-field" ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <label id={`${panelId}-label`}>GitHub repository</label>
    {loading && !access && !repositories.length ? <p className="repository-access-loading" role="status">Checking repository access...</p> : null}
    {!loading && !error && !ready ? <div className="repository-access-setup" role="status">
      <GitFork size={19} aria-hidden="true" />
      <div><strong>Repository access needs setup</strong><p>{access ? "The server needs a configured GitHub App before repositories can be connected." : "Deploy the backend update for selected repository access, then sign in again."}</p></div>
    </div> : null}
    {ready && setupNeeded ? <div className="repository-access-setup">
      <GitFork size={19} aria-hidden="true" />
      <div><strong>Choose your repositories</strong><p>On GitHub, choose <b>Only select repositories</b> and pick the projects you want RepoAgent to access.</p>
        {access.installation_url ? <a className="repository-access-connect" href={access.installation_url} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || loading} tabIndex={disabled || loading ? -1 : undefined} onClick={openGitHub}>Choose repositories on GitHub<ExternalLink size={13} aria-hidden="true" /></a> : <p>The server administrator needs to finish configuring the GitHub App.</p>}
      </div>
    </div> : null}
    {ready && !setupNeeded ? <>
      <button type="button" ref={trigger} className="repository-trigger" disabled={disabled || (loading && !repositories.length)}
        aria-labelledby={`${panelId}-label ${panelId}-selection`} aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(!open)}>
        <GitFork size={17} /><span id={`${panelId}-selection`}>{selected?.full_name ?? (loading ? "Loading repositories..." : "Choose a repository")}</span><ChevronDown size={15} />
      </button>
      {selected ? <div className="repository-selection-meta"><span><GitBranch size={12} />{selected.default_branch}</span>{selected.private ? <span><LockKeyhole size={11} />Private</span> : <span>Public</span>}<span>Default branch</span></div> : <p className="field-hint">Repositories connected to RepoAgent that you can push to.</p>}
      {!repositories.length && !loading && !error ? <p className="repository-access-empty">No writable repositories are connected yet. Update access on GitHub, then refresh. Organization requests may need an administrator's approval.</p> : null}
      {open && !disabled ? <div id={panelId} className="repository-menu" role="region" aria-label="Repository picker">
        <div className="repository-search"><Search size={15} /><input ref={search} aria-label="Search repositories" placeholder="Find a repository..." value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} /></div>
        <ul className="repository-list" aria-label="Your connected GitHub repositories">
          {filtered.map((repository) => <li key={repository.id}><button type="button" className="repository-option" aria-pressed={selected?.id === repository.id} onClick={() => { onChange(repository); setOpen(false); trigger.current?.focus(); }}>
            <div className="repository-option-title"><GitFork size={15} /><strong>{repository.full_name}</strong>{repository.private ? <span className="repository-private"><LockKeyhole size={10} />Private</span> : null}{selected?.id === repository.id ? <Check size={15} /> : null}</div>
            {repository.description ? <p>{repository.description}</p> : null}
            <div className="repository-option-meta"><span><GitBranch size={11} />{repository.default_branch}</span>{repository.language ? <span>{repository.language}</span> : null}</div>
          </button></li>)}
        </ul>
        {!filtered.length && !loading ? <p className="repository-empty">{query ? "No matching repositories in the loaded list." : "No connected repositories found."}</p> : null}
        <div className="repository-menu-footer"><span>{repositories.length} connected</span>{nextPage ? <button type="button" className="text-button" disabled={loading} onClick={() => void loadPage(nextPage)}>{loading ? "Loading..." : "Load more repositories"}</button> : <span>{loading ? "Loading..." : "Access checked"}</span>}</div>
      </div> : null}
    </> : null}
    {ready ? <div className="repository-access-controls">
      <div className="repository-access-links">
        {!setupNeeded && manageUrl ? <a href={manageUrl} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || loading} tabIndex={disabled || loading ? -1 : undefined} onClick={openGitHub}>Manage access<ExternalLink size={12} aria-hidden="true" /></a> : null}
        {!setupNeeded && access.installation_url ? <a href={access.installation_url} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || loading} tabIndex={disabled || loading ? -1 : undefined} onClick={openGitHub}>Add account<ExternalLink size={12} aria-hidden="true" /></a> : null}
      </div>
      <button type="button" className="repository-access-refresh" disabled={disabled || loading} onClick={refreshAccess}><RefreshCw size={12} aria-hidden="true" />{loading ? "Refreshing..." : "Refresh access"}</button>
    </div> : null}
    {ready && hasAllRepositories ? <p className="repository-access-note">GitHub currently allows all repositories for {installations.filter(installation => installation.repository_selection === "all").map(installation => installation.account).join(", ")}. Use Manage access and choose <strong>Only select repositories</strong> to limit access.</p> : null}
    {ready && installations.length > 1 ? <details className="repository-access-accounts"><summary>Connected accounts ({installations.length})</summary><ul>{installations.map(installation => <li key={installation.id}><span>{installation.account}</span><a href={installation.manage_url} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || loading} tabIndex={disabled || loading ? -1 : undefined} onClick={openGitHub}>Edit access<ExternalLink size={12} aria-hidden="true" /></a></li>)}</ul></details> : null}
    {error ? <div className="repository-error"><ErrorAlert error={error} />{error.retryable ? <button type="button" className="text-button" disabled={loading || disabled} onClick={() => void loadPage(nextPage ?? 1, !repositories.length)}>Try loading repositories again</button> : null}</div> : null}
  </div>;
}
