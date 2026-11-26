# API Endpoints Reference

> **Canonical Reference:** This legacy top-level file has been superseded by the exhaustive, source-verified **[`docs/dev/api-reference.md`](./dev/api-reference.md)**, which documents every Git Smart HTTP v2, Web UI, Auth/Profile, Repository Admin, and Site Admin Control Panel endpoint along with its Zod request schema and CSRF/auth requirements.

## Endpoint Groups at a Glance

- **Git Smart HTTP v2 (`src/worker/routes/git.ts`)**: `GET /:owner/:repo/info/refs`, `POST /:owner/:repo/git-upload-pack`, `POST /:owner/:repo/git-receive-pack` (supports both `/owner/repo` and `/owner/repo.git`).
- **Public Discovery & Web Code Browser (`src/worker/index.ts`, `src/worker/routes/ui.ts`)**: `/`, `/explore`, `/namespaces`, `/profile/:owner`, `/:owner`, `/:owner/:repo`, `/tree`, `/blob`, `/commits`, `/commits/fragments/:oid`, `/commit/:oid`, `/commit/:oid/diff`, `/raw`, `/rawpath`, `/api/refs`, `/api/site-assets/:slot`, `/favicon.ico`, `/robots.txt`.
- **Authentication, Profile, User Repos & PATs (`src/worker/routes/auth*.ts`)**: `/auth`, `/auth/login`, `/auth/demo-login` (dev only), `/auth/sign-out`, `/user/*`, `/auth/account`, `/auth/api/change-password`, `/auth/api/profile`, `/auth/api/repositories*` (including web `file` & `profile-readme` commits), `/auth/api/tokens*` (repo, namespace, and Global Admin PATs).
- **Per-Repository Admin (`src/worker/routes/admin.ts`)**: `/:owner/:repo/admin`, `/admin/refs`, `/admin/head`, `/admin/compact`, `/admin/debug-state`, `/admin/debug-commit/:commit`, `/admin/debug-oid/:oid`, `/admin/pack/:packKey`, `/admin/purge`.
- **Site Administration Control Panel (`src/worker/routes/systemAdmin.ts`)**: `/admin`, `/admin/repositories`, `/admin/tokens`, `/admin/users`, `/admin/settings`, `/admin/security`, and `/admin/api/*`.

Open **[`docs/dev/api-reference.md`](./dev/api-reference.md)** for full request/response contracts, status codes, and security headers.
