# Selected repository access and theme update

This update is implemented in the local project. Deploy the backend first, then the frontend.

## What changed

- Light mode is the default, with dark text and quieter surfaces. The top-right sun/moon button switches themes and remembers your choice in this browser.
- A simpler repository workspace replaces decorative section labels and promotional copy. Typography stays consistent: 15px body text, 14px controls, at least 12px metadata, 13px diff code, and 16px mobile inputs.
- Repository access uses a **GitHub App**. Users choose **Only select repositories** on GitHub; the picker offers only connected repositories where they can push.
- **Manage access** opens GitHub's installation settings. **Add account** connects another account or organization. Returning from GitHub refreshes access once; **Refresh access** is also available.
- Removing a repository clears a stale selection on refresh. The backend checks access before a job, clone, and push, so an old job cannot bypass revoked access.
- Existing saved jobs, activity, editable commit messages, previews, notifications, and request deduplication remain available.

A normal OAuth App with the broad `repo` scope cannot provide this repository selection model. Changing only the frontend would hide repositories without restricting the credential. This update requires the backend GitHub App configuration below.

## One-time GitHub setup

1. Open [GitHub > Settings > Developer settings > GitHub Apps > New GitHub App](https://github.com/settings/apps/new).
2. Set **Homepage URL** and **Setup URL** to your frontend URL. Set **Callback URL** to exactly:

   ```text
   https://repoagent.onrender.com/auth/github/callback
   ```

3. Leave **Request user authorization (OAuth) during installation** unchecked. RepoAgent starts authorization through its own sign-in button. Keep token expiration enabled. Disable webhooks.
4. Set repository **Contents: Read and write**; **Metadata: Read-only** is included by GitHub. Leave other permissions off unless needed. GitHub requires additional Workflows write permission to edit workflow files.
5. Allow installation on **Any account** if other users will use RepoAgent. Create the App, generate a **client secret**, and copy the **Client ID** and App slug. The slug is the last part of `https://github.com/apps/YOUR-SLUG`.
6. In the **Render backend environment**, set:

   ```dotenv
   GITHUB_APP_SLUG=your-github-app-slug
   GITHUB_CLIENT_ID=your-github-app-client-id
   GITHUB_CLIENT_SECRET=your-github-app-client-secret
   GITHUB_CALLBACK_URL=https://repoagent.onrender.com/auth/github/callback
   FRONTEND_URL=https://your-frontend.example
   CORS_ORIGINS=https://your-frontend.example
   SESSION_SAME_SITE=none
   SESSION_HTTPS_ONLY=true
   ```

   Use GitHub App credentials, not the old OAuth App credentials or the numeric App ID. Keep secrets on the backend. No App private key is needed by this integration.

## Deploy and use it

1. Back up your database. Keep the existing persistent `DATABASE_URL` and `SESSION_SECRET` (or `APP_SECRET`) values.
2. Deploy/restart the updated backend. Startup adds the GitHub App credential-binding columns automatically. Use matching App configuration on API and worker processes. Existing broad OAuth sessions become signed out; saved job history remains.
3. Build and deploy the frontend:

   ```powershell
   cd C:\Users\91730\RepoAgent\frontend
   npm.cmd run build
   ```

   Publish `dist` using your existing host. Keep the frontend build variable:

   ```dotenv
   VITE_API_URL=https://repoagent.onrender.com
   ```

   For local frontend work, restart `npm.cmd run dev`. A frontend rebuild alone cannot enable the new permissions.
4. Click **Continue with GitHub**, then **Choose repositories on GitHub**. Select the account, choose **Only select repositories**, pick the projects, and click **Install** or **Save**.
5. Return to RepoAgent. Access refreshes automatically; click **Refresh access** if needed. Select a repository, describe the task, review the diff/preview, edit the commit message, then approve.
6. Use **Manage access** to add or remove repositories later. If an installation is set to **All repositories**, the UI explains how to switch it to **Only select repositories**. An organization owner may need to approve access.
7. After migrating, revoke the **old OAuth App** under **GitHub > Settings > Applications > Authorized OAuth Apps**. Switching server credentials does not revoke that old broad GitHub grant. Keep the new GitHub App authorized.

The top-right theme button changes only your browser preference. New visitors start in light mode. Access tokens remain encrypted on the backend and are never stored in browser storage.

GitHub App user tokens and sessions last at most eight hours in this implementation; sign in again when asked. Existing branch protections still apply to direct pushes.

## API changes

- `GET /auth/session` adds `repository_access` setup metadata. `authenticated: false` remains a normal signed-out response.
- `GET /auth/repositories` returns `{ repositories, has_more, next_cursor, access }`. Follow the opaque cursor, including when an installation page has no writable repositories.
- `access` includes configuration links and installations with account names, GitHub selection mode, and management URLs.
- The frontend hides broad repository lists returned by older backends and shows a setup message until the backend is updated.
- Existing job, preview, activity, and approval endpoints keep their contracts.

## Verification and limits

Validation completed: 45 frontend logic tests and 74 UI tests pass. The production frontend build passes. Backend verification covers 128 distinct tests (127 passed, one existing skip). Automated tests cover selected access, GitHub link validation, cursor pagination, return-to-tab refresh, stale selections, session isolation, and existing job flows. Browser checks verified light mode by default, saved dark mode after reload, both themes on desktop, the 320px mobile layout, and editable commit approval against an isolated fixture. Local browser checks use isolated fixtures, not a live GitHub authorization or real push. Finish the GitHub App registration and deployment before testing with your own account.

An `OPTIONS` request followed by `POST` is the browser's CORS preflight, not a duplicate mutation. Job/preview polling every 2.5 seconds while work runs is intentional.

Keep repository workspaces and preview storage persistent if old previews and approvals must survive deployments. Docker is still required for Vite previews. Background jobs and preview builds remain process-local.

See [the backend configuration guide](../backend/README.md#configure-github-sign-in) for local callbacks and full deployment details, and [GitHub's App user-token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) for its authorization model.
