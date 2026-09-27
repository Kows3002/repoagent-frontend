import { ArrowUpRight, BookOpen, Github, History, LayoutPanelLeft, Plus } from "lucide-react";
import type { User } from "../lib/types";

export default function Header({ onHelp, user, onLogout, loggingOut, view, onViewChange, onNewChange, busy }: {
  onHelp: () => void;
  user: User | null;
  onLogout: () => void;
  loggingOut: boolean;
  view: "workspace" | "activity";
  onViewChange: (view: "workspace" | "activity") => void;
  onNewChange: () => void;
  busy: boolean;
}) {
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <a className="brand" href="#main" aria-label="RepoAgent home" onClick={() => onViewChange("workspace")}>
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>repo<span className="brand-light">agent</span><span className="brand-period">.</span></span>
        </a>
        <nav aria-label="Main navigation" className="header-nav">
          <button className={"nav-link" + (view === "workspace" ? " nav-link-active" : "")} aria-current={view === "workspace" ? "page" : undefined} onClick={() => onViewChange("workspace")}><LayoutPanelLeft size={16} />Workspace</button>
          <button className={"nav-link" + (view === "activity" ? " nav-link-active" : "")} aria-current={view === "activity" ? "page" : undefined} onClick={() => onViewChange("activity")} disabled={!user}><History size={16} />Activity</button>
        </nav>
        <div className="header-actions">
          <button className="icon-button help-button" onClick={onHelp} aria-label="How it works" title="How it works"><BookOpen size={18} /></button>
          {user ? <>
            <button className="button button-outline new-change-button" onClick={onNewChange} disabled={busy}><Plus size={16} />New change</button>
            <div className="account-menu">
              {user.avatar_url ? <img src={user.avatar_url} alt="" width={30} height={30} referrerPolicy="no-referrer" /> : <span className="account-fallback"><Github size={18} /></span>}
              <div><span className="account-name" title={user.username}>{user.username}</span><button className="text-button signout-button" onClick={onLogout} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Sign out"}</button></div>
            </div>
          </> : <a className="github-link" aria-label="Open GitHub" href="https://github.com" target="_blank" rel="noreferrer"><Github size={18} /><span>GitHub</span><ArrowUpRight size={13} /></a>}
        </div>
      </div>
    </header>
  );
}
