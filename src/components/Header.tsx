import { ArrowUpRight, BookOpen, Code2, Github } from "lucide-react";
import type { User } from "../lib/types";
export default function Header({ onHelp, user, onLogout, loggingOut }: {
  onHelp: () => void;
  user: User | null;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <a className="brand" href="#main" aria-label="RepoAgent home">
          <span className="brand-mark">
            <Code2 size={22} />
          </span>
          <span>
            Repo<span className="brand-light">Agent</span>
          </span>
          <span className="version-badge">BETA</span>
        </a>
        <nav aria-label="Main navigation" className="header-nav">
          <a className="nav-link nav-link-active" href="#main">
            Workspace
          </a>
          <button className="nav-link" onClick={onHelp}>
            <BookOpen size={14} /> How it works
          </button>
        </nav>
        {user ? (
          <div className="account-menu">
            {user.avatar_url ? <img src={user.avatar_url} alt="" width={26} height={26} referrerPolicy="no-referrer" /> : <Github size={19} />}
            <span className="account-name" title={user.username}>{user.username}</span>
            <button className="text-button" onClick={onLogout} disabled={loggingOut}>
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : <a
          className="github-link"
          aria-label="Open GitHub"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} />
          <span>GitHub</span>
          <ArrowUpRight size={13} />
        </a>}
      </div>
    </header>
  );
}
