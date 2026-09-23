import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, GitBranch, GitFork, LockKeyhole, Search } from "lucide-react";
import { getGitHubRepositories } from "../lib/auth";
import { isAbortError, mapError } from "../lib/errors";
import type { FriendlyError, GitHubRepository } from "../lib/types";
import ErrorAlert from "./ErrorAlert";

export default function RepositoryPicker({ accountId, selected, onChange, disabled }: {
  accountId: string | number;
  selected: GitHubRepository | null;
  onChange: (repository: GitHubRepository | null) => void;
  disabled: boolean;
}) {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const loadPage = useCallback(async (page: number, replace = false) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getGitHubRepositories(page, request.signal);
      if (version !== requestVersion.current || request.signal.aborted) return;
      setRepositories((previous) => {
        const merged = replace ? result.repositories : [...previous, ...result.repositories];
        return Array.from(new Map(merged.map((repository) => [repository.id, repository])).values());
      });
      setNextPage(result.next_page);
    } catch (failure) {
      if (version !== requestVersion.current || request.signal.aborted || isAbortError(failure)) return;
      setError(mapError(failure, undefined, "repositories"));
    } finally {
      if (version === requestVersion.current && !request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    onChange(null);
    setRepositories([]);
    setQuery("");
    setOpen(false);
    setNextPage(null);
    void loadPage(1, true);
    return () => {
      requestVersion.current += 1;
      controller.current?.abort();
    };
  }, [accountId, loadPage, onChange]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

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
    <button type="button" ref={trigger} className="repository-trigger" disabled={disabled || (loading && !repositories.length)}
      aria-labelledby={`${panelId}-label ${panelId}-selection`} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(!open)}>
      <GitFork size={17} /><span id={`${panelId}-selection`}>{selected?.full_name ?? (loading ? "Loading repositories..." : "Choose a repository")}</span><ChevronDown size={15} />
    </button>
    {selected ? <div className="repository-selection-meta"><span><GitBranch size={12} />{selected.default_branch}</span>{selected.private ? <span><LockKeyhole size={11} />Private</span> : <span>Public</span>}<span>Default branch</span></div> : <p className="field-hint">Select a repository connected to your GitHub account.</p>}
    {open && !disabled ? <div id={panelId} className="repository-menu" role="region" aria-label="Repository picker">
      <div className="repository-search"><Search size={15} /><input ref={search} aria-label="Search repositories" placeholder="Find a repository..." value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} /></div>
      <ul className="repository-list" aria-label="Your GitHub repositories">
        {filtered.map((repository) => <li key={repository.id}><button type="button" className="repository-option" aria-pressed={selected?.id === repository.id} onClick={() => { onChange(repository); setOpen(false); trigger.current?.focus(); }}>
          <div className="repository-option-title"><GitFork size={15} /><strong>{repository.full_name}</strong>{repository.private ? <span className="repository-private"><LockKeyhole size={10} />Private</span> : null}{selected?.id === repository.id ? <Check size={15} /> : null}</div>
          {repository.description ? <p>{repository.description}</p> : null}
          <div className="repository-option-meta"><span><GitBranch size={11} />{repository.default_branch}</span>{repository.language ? <span>{repository.language}</span> : null}</div>
        </button></li>)}
      </ul>
      {!filtered.length && !loading ? <p className="repository-empty">{query ? "No matching repositories in the loaded list." : "No repositories found for this account."}</p> : null}
      <div className="repository-menu-footer"><span>{repositories.length} loaded</span>{nextPage ? <button type="button" className="text-button" disabled={loading} onClick={() => void loadPage(nextPage)}>{loading ? "Loading..." : "Load more repositories"}</button> : <span>{loading ? "Loading..." : "All repositories loaded"}</span>}</div>
    </div> : null}
    {error ? <div className="repository-error"><ErrorAlert error={error} />{error.retryable ? <button type="button" className="text-button" disabled={loading || disabled} onClick={() => void loadPage(nextPage ?? 1, !repositories.length)}>Try loading repositories again</button> : null}</div> : null}
  </div>;
}
