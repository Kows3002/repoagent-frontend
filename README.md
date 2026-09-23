# RepoAgent frontend

A responsive React + TypeScript workbench for GitHub code changes, built with Vite, Tailwind CSS, and Lucide icons. Sign in with GitHub, choose a repository, describe a focused change, compare its diff and rendered UI, then explicitly approve the push.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
cd frontend
npm install
npm run dev
```

On Windows PowerShell with restricted script execution, use `npm.cmd` in place of `npm`.

The workspace runs at http://127.0.0.1:5173. Start the API in a separate terminal after configuring [the backend](../backend/README.md):

```sh
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

With `VITE_API_URL=` (empty), Vite forwards `/auth` and `/jobs` to `http://127.0.0.1:8000`. An absolute `VITE_API_URL` connects the browser directly to that API. The example environment connects to Render; use an empty value for a local backend.

| Variable | Purpose |
| --- | --- |
| `API_PROXY_TARGET` | Development API proxy target; defaults to `http://127.0.0.1:8000`. |
| `VITE_API_URL` | Browser API base URL, for example `https://repoagent.onrender.com`. Leave empty for the same-origin proxy. Requires credentialed CORS and compatible session cookies for another site. |
| `VITE_API_BASE_URL` | Legacy alias used only when `VITE_API_URL` is not defined. |
| `VITE_PREVIEW_ORIGIN` | Allowed wildcard origin for preview frames. Defaults to `http://*.localhost:8000`; must match backend `PREVIEW_DOMAIN`, `PREVIEW_SCHEME`, and `PREVIEW_PORT`. |

The frontend can render without a backend, but sign-in, repository selection, generation, and previews require the API. An unreachable API produces a connection message. When OAuth is not configured, the workspace reports that GitHub sign-in is unavailable.

## GitHub sign-in

Register a GitHub OAuth App with local callback URL `http://127.0.0.1:5173/auth/github/callback`. The login and callback use Vite's `/auth` proxy. Set the backend's `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `FRONTEND_URL`, and persistent `SESSION_SECRET` or `APP_SECRET`; see [backend setup](../backend/README.md#configure-github-sign-in). Do not put OAuth secrets in frontend environment variables.

Use the same host consistently for the workspace, login, and callback; do not mix `localhost` and `127.0.0.1`. The repository picker lists repositories the connected account can push to, supports filtering the loaded list, and offers pagination. Users do not paste repository URLs or personal access tokens.

The browser receives a signed HttpOnly cookie containing an opaque session identifier. Session data lives in the backend database and expires after at most seven days. GitHub OAuth credentials stay encrypted on the backend. The frontend keeps the session's CSRF value only in module memory and sends it as `X-CSRF-Token` on mutations; no access token is stored in browser storage.

## Connect to the Render API

Set this public URL in frontend/.env, then restart Vite (or rebuild the deployed frontend):

```dotenv
VITE_API_URL=https://repoagent.onrender.com
```

The shared API client uses it for GitHub login, sessions, repositories, job creation, status polling, previews, and approval. It sends session cookies and the CSRF header automatically. The frontend Content Security Policy uses the same configured host.

For a local frontend at http://127.0.0.1:5173 connecting directly to Render, set these variables in the Render API service, then deploy the updated backend:

```dotenv
GITHUB_CALLBACK_URL=https://repoagent.onrender.com/auth/github/callback
FRONTEND_URL=http://127.0.0.1:5173
CORS_ORIGINS=http://127.0.0.1:5173
SESSION_SAME_SITE=none
SESSION_HTTPS_ONLY=true
```

The GitHub OAuth app must register that exact Render callback URL. The API also needs GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, its persistent SESSION_SECRET (or APP_SECRET), and the existing database/AI configuration. The frontend URL alone does not configure OAuth. Replace FRONTEND_URL and CORS_ORIGINS with the actual frontend origin for a deployed workspace; never use a wildcard with credentialed CORS.

Browser third-party-cookie blocking can still prevent sessions across different sites. A same-origin reverse proxy is the preferred deployment when those browsers must be supported: set VITE_API_URL empty, proxy /auth and /jobs to Render, and register the proxy origin's callback instead.

To check availability, open https://repoagent.onrender.com/health and /auth/session. The session endpoint should return configured: true before the GitHub button becomes available. The API must be running the current OAuth/session routes.

## Real before-and-after previews

New jobs capture immutable repository snapshots before and after editing. The visual preview builds those snapshots and displays the actual rendered pages in separate sandboxed frames. Compare both versions, switch between Current and Updated, select desktop or mobile sizes, or open the same page path in both.

Supported projects are static `index.html` sites and standalone Vite applications, including React + Vite. Static sites do not need Docker. Vite previews require Docker with a running Linux container engine on the backend host.

Previews are UI-only. Backend APIs, sign-in flows, external services, remote fonts/assets, environment secrets, and browser storage are not connected. Server-rendered frameworks, workspace dependencies, private packages, or packages needing installation scripts may need a custom preview builder. Older jobs without snapshots cannot produce a before-and-after preview. An unsupported or failed preview leaves the generated diff available for review and approval.

Local frames use short-lived URLs such as `http://<capability>.localhost:8000/`. They connect directly to the backend preview host, outside Vite's `/jobs` proxy. If the backend runs on another port, change both backend `PREVIEW_PORT` and frontend `VITE_PREVIEW_ORIGIN`, then restart Vite.

For production, configure a dedicated wildcard preview domain and HTTPS, for example:

```dotenv
# frontend/.env.production
VITE_API_URL=
VITE_PREVIEW_ORIGIN=https://*.preview.example.net
```

The backend must use the matching preview hostname and scheme. DNS and the reverse proxy must route the wildcard hostname to the preview middleware while preserving the incoming Host header. The preview origin must remain separate from the workspace/API origin. See [backend preview deployment](../backend/README.md#visual-preview-deployment).

`VITE_PREVIEW_ORIGIN` is embedded in the frontend Content Security Policy at build time. Rebuild after changing it. Also align any CSP supplied by your production host; a stricter `frame-src` can block the previews.

## API contract

| Endpoint | Purpose |
| --- | --- |
| `GET /auth/github/login` | Browser navigation starts GitHub OAuth. |
| `GET /auth/github/callback` | Completes OAuth and redirects back to the workspace. |
| `GET /auth/session` | Returns `{ authenticated, configured, user, csrf_token? }`. An authenticated user includes `id`, `login`, `name`, and `avatar_url`. |
| `GET /auth/repositories?page=1` | Returns `{ repositories, has_more, next_page }` for the connected account. |
| `POST /auth/logout` | Invalidates the database session and clears the cookie. |
| `POST /jobs/` | Accepts `{ repo_url, task }` and returns a queued, owned job. |
| `GET /jobs/{id}` | Polled every 2.5 seconds until completed or failed. |
| `POST /jobs/{id}/preview` | Starts preparation of both snapshots for a completed job. |
| `GET /jobs/{id}/preview` | Returns preview status and, when ready, expiring `before_url` and `after_url`. |
| `POST /jobs/{id}/approve` | Commits and pushes only after explicit approval. |

All API requests use `credentials: "include"`. POST requests include the CSRF header and a trusted browser origin. The backend retains `GET /auth/me` as a compatibility endpoint; the frontend uses `/auth/session`.

Job responses include `id`, `status`, `repo_url`, `task`, `ai_result`, and `diff`. Stages are queued, analyzing, generating, completed, and failed; the legacy running state is also understood.

Approval requires a completed, nonempty diff and an explicit successful push response. The commit message is `RepoAgent: Apply requested changes`. The backend pushes directly to the repository's default branch; it does not create a branch or pull request.

## Build and test

```sh
npm run build
npm test
npm run test:ui
npm run preview
```

The production bundle is in `dist/`. Host the workspace with same-origin `/auth` and `/jobs` reverse proxies, and register the production `/auth/github/callback` URL with GitHub. Vite's development proxy is not included in production or preview builds.

Tests use mocked requests and cover session/CSRF handling, repository selection and pagination, diff parsing, job polling/cancellation, explicit approval, and preview controls. They do not log into GitHub or push a real commit. The Docker preview path has automated command/contract coverage, but a live Docker build was not verified in this workspace because a Docker daemon was unavailable.

## UI structure

- `Header`: sticky branding, account controls, and workflow help.
- `RepoForm`, `RepositoryPicker`, `TaskInput`: account repositories and precise tasks.
- `StatusTimeline`, `DiffViewer`, `ErrorAlert`, `ApproveCard`: progress, review, friendly errors, and explicit approval.
- `PreviewPanel`, `usePreview`: real current/updated UI previews, route navigation, and build status.
- `useAuth`: session loading, identity, availability, sign-out, and expiry.
- `useJob`: submission, polling, cancellation, reconnect, and duplicate-click protection.
- `lib/auth.ts`: shared credentialed transport and memory-only CSRF handling.

Signing out clears the visible job and stops polling. A 401 returns the workspace to sign-in. Task, analysis, and diff content are rendered as text; repository HTML runs only inside isolated preview frames. The initial sample diff is labeled as an example.

Job and preview background tasks are process-local and do not survive an API restart. See the backend README for persistence, migration, and deployment details.

