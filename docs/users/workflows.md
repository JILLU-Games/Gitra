---
title: Common Workflows
description: End-to-end developer and administrator workflows for Gitra.
order: 5
draft: false
---

# Common Workflows

This guide maps real-world end-to-end workflows to the exact UI pages, API routes, and CLI commands implemented in Gitra.

---

## 1. Solo Developer: Create, Clone, Edit, and Push

1. **Sign in** at `/auth`.
2. **Create a repository** at `/user/account` (or the home page modal), optionally checking **Initialize with README.md**.
3. **Create a scoped PAT** at `/user/settings/tokens` with scope **Repository** (or **Namespace**) and permission **Read & Write (`push`)**.
4. **Clone and push** from your terminal:

```bash
git clone https://git.example.com/myhandle/my-app.git
cd my-app
git commit --allow-empty -m "Initial work"
git push https://myhandle:goc_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@git.example.com/myhandle/my-app.git main
```

5. **Quick Web Edits**: Open any text file at `/:owner/:repo/blob?ref=main&path=README.md`, click **Edit**, modify content (up to 256 KiB), enter a commit message, and save (`PUT /auth/api/repositories/:repositoryId/file`). Gitra builds a real packfile + `.idx` in R2 and commits it atomically via the repository's Durable Object.

---

## 2. Team Onboarding: Provisioning Users with RBAC

Only active **`admin`** accounts can manage the user directory (`src/worker/routes/systemAdmin.ts`).

1. Open **`/admin/users`**.
2. Click **Add User / Namespace**:
   - **Handle**: lowercase slug (e.g. `maya-eng`), max 40 chars, no reserved routes (`auth`, `user`, `admin`, `explore`, `namespaces`, etc.).
   - **Display Name**: up to 80 characters.
   - **Role**:
     - `admin` — full site administration + repository write + Global PAT privileges.
     - `member` — create and manage repositories inside their own namespace + namespace/repo PATs.
     - `viewer` — read-only; cannot push even with an older `push` PAT (downgraded to `pull` at verification time in `src/worker/auth/pat.ts`).
   - **Password**: set a custom password (8–128 chars) or click **Generate** (uses CSPRNG 16-char temporary password via `generateTemporaryPassword()`).
3. Share the handle and temporary password securely with the user.
4. The user signs in at `/auth` and changes their password at **`/user/settings/security`** (`POST /auth/api/change-password`).

---

## 3. Setting Up a Namespace `.vibtools` Profile Page

Gitra supports GitHub-Org-style profile READMEs via a special repository named `.vibtools` (`src/shared/slugs.ts#PROFILE_REPO_SLUG`):

1. Create a public repository named **`.vibtools`** in your namespace (e.g. `/myhandle/.vibtools`).
2. Check **Initialize profile README** when creating it—or open your profile page (`/:owner` or `/profile/admin` for `@admin`) and edit the profile README directly via `PUT /auth/api/repositories/:repositoryId/profile-readme`.
3. Update your **Display Name**, **Bio** (200 chars), **Location** (60 chars), and **Website** (`http://` or `https://`, 160 chars) in **`/user/profile`** (`PUT /auth/api/profile`).
4. Pin key repositories to your profile (using the repository Pin action) so visitors see curated projects beneath your rendered `profile/README.md`.

---

## 4. Featuring Public Repositories on the Homepage

Only active `admin` accounts can pin repositories to the global homepage (`/`):

1. Open **`/admin/repositories`** (or toggle homepage featuring on a public repository).
2. Pin any **public** repository (`PATCH /admin/api/repositories/:repositoryId` with `{ "homePinned": true }`).
3. Private repositories are blocked from homepage featuring (`400 private-repo-cannot-feature`), and switching a featured public repository to private automatically clears `homePinned` (`src/worker/routes/authRepositories.ts`).

---

## 5. Multi-Namespace Automation with a Global Admin PAT

Active `admin` users can mint a single **Global PAT** (`scope: "global"`) for CI/CD or backup scripts that touch multiple namespaces:

1. Visit **`/user/settings/tokens`** (or **`/admin/tokens`**).
2. Select target **All namespaces** (`__global__`) and choose **Read** (`pull`) or **Read & Write** (`push`).
3. Authenticate with **either** your own admin handle **or** the target repository's namespace slug as the HTTP Basic username:

```bash
git clone https://admin:goc_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@git.example.com/other-user/private-repo.git
```

> **Live Role Guardrail:** If an admin is demoted to `member`/`viewer` or disabled in `/admin/users`, all of their Global PATs lose cross-namespace access immediately on the next request (`src/worker/auth/pat.ts#resolvePatOwnerPolicy`).

---

## 6. Safe Code Updates & Zero-Downtime Redeploys

When pulling new Gitra updates and redeploying to Cloudflare:

```bash
git pull origin main
npm install
npm run cf:auto-deploy
```

- Existing D1, KV, R2, and Queue resources are reused by name.
- Existing `SESSION_SECRET`, `ADMIN_PASSWORD`, and other deployed Worker secrets are **preserved automatically**—no users are signed out and no credential mismatch occurs.
- New D1 migrations in `drizzle/d1/` are applied idempotently before deploying the new Worker bundle.

---

## 7. Repository Maintenance & Permanent Deletion

Repository members (or site admins) can open **`/:owner/:repo/admin`** to:

- Inspect refs, HEAD, and active/superseded packs (`GET /:owner/:repo/admin/debug-state`).
- Preview pack compaction (`POST /:owner/:repo/admin/compact` with `{ "dryRun": true }`) or trigger compaction (`{ "dryRun": false }`).
- Remove a **superseded** pack (`DELETE /:owner/:repo/admin/pack/:packKey` — active packs return `409`).
- Permanently purge a repository (`DELETE /:owner/:repo/admin/purge` with `{ "confirm": "purge-<owner>/<repo>" }`), which removes the D1 row, `ROUTES` KV entry, R2 objects, and DO storage.
