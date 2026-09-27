# Dark workspace upgrade

This update is implemented in the local project. Deploy the backend first, then the frontend.

## What changed

- A charcoal workbench with a custom RepoAgent mark, warm accents, clear section numbering, and responsive layouts.
- System typography: 15px base text, 14px main controls, at least 12px metadata, 13px diff code, and 16px mobile text inputs.
- Recent jobs can be reopened to review their saved task, diff, status, and actual commit message.
- The Activity tab shows saved sign-ins, sign-outs, job creation, completion/failure, and approved pushes.
- Dismissible success/error snackbars. Successful notices disappear after six seconds; hovering or focusing pauses the timer. Inline errors retain recovery controls.
- Concurrent reads share one request; React StrictMode remains enabled. Preview starts share pending requests. Mutations keep duplicate-click guards.
- Successful pushes are saved in the database. Repeat approvals return saved success instead of pushing again.

## What you need to do

1. Back up the existing database.
2. Deploy/restart the updated backend on Render using its existing start command. Application startup automatically adds the new job columns and the activity_events table. No manual SQL or new environment variables are required.
3. Keep the existing persistent DATABASE_URL and SESSION_SECRET values. Keep repository workspaces and preview storage persistent if old jobs must remain available for preview or approval after deployments.
4. Build and deploy the updated frontend:

   ```powershell
   cd C:\Users\91730\RepoAgent\frontend
   npm.cmd run build
   ```

   Publish the generated dist folder using your existing hosting setup. Keep this value in the frontend build environment:

   ```dotenv
   VITE_API_URL=https://repoagent.onrender.com
   ```

   For local frontend development, restart with npm.cmd run dev.
5. Sign in with GitHub. Generate a job, review it, edit the commit message if needed, and approve it. Reopen Recent jobs to see saved results; open Activity to see your account events.

The activity log begins with this deployment. Earlier jobs retain their data, but unknown historical dates and push outcomes remain unknown. Jobs created before ownership was recorded are not assigned to an account automatically.

## Backend contract

- GET /jobs: latest 50 jobs owned by the connected account.
- GET /auth/activity?limit=20: newest owned activity events.
- Job responses additionally expose created_at, updated_at, pushed_at, and commit_message. Dates are UTC Unix seconds or null.
- POST /jobs/{id}/approve still accepts { "commit_message": "Your message" }. Successful responses include the actual commit message and pushed_at.

The database stores users, session records, jobs, generated results, and activity summaries. GitHub credentials remain encrypted on the server. Browser notification messages are temporary.

## Why Network can still show two rows

An OPTIONS request followed by POST is the browser's CORS preflight, not a duplicate push or logout. Keep it enabled. GET job/preview requests every 2.5 seconds while work is running are intentional status polling. See [MDN's preflight explanation](https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request).

Initial reads are now deduplicated even with [React StrictMode's development checks](https://react.dev/reference/react/StrictMode). Activity loads only when its tab is opened.

## Verification

Production build passed. Frontend logic, workflow, notification, history, and request-sharing tests passed. Backend migration, activity ownership, OAuth, and repeated approval tests passed using isolated databases and mocked/local Git operations. Desktop and mobile browser checks used an isolated fixture, including actual static before/after previews; they did not authenticate with or push to a real GitHub repository.

Existing Docker requirements for Vite previews still apply. No new preview infrastructure is introduced by this redesign. Background jobs and preview builds remain process-local and can be interrupted by a backend restart; saved database history survives.
