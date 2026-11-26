---
title: Authentication, RBAC & Personal Access Tokens
description: Understand Gitra's Demo vs Production authentication modes, three-tier RBAC roles, and repo, namespace, and Global Admin Personal Access Tokens.
order: 4
draft: false
---

# Authentication, RBAC & Personal Access Tokens

Gitra separates **browser authentication** (sealed encrypted cookies for web UI and admin APIs) from **Git CLI authentication** (Personal Access Tokens over HTTP Basic).

---

## Two-Mode Runtime Authentication (`src/worker/auth/adminAuth.ts`)

| Runtime Mode                | Activation Condition                                                                                                | Behavior                                                                                                                                                                                                                    |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Demo / Development Mode** | `vite dev` (`import.meta.env.PROD === false`) AND neither `AUTH_MODE=production` nor `ADMIN_PASSWORD` is configured | Enables default demo logins (`admin` / `admin123`, `alex-dev` / `devuser123`), one-click `POST /auth/demo-login`, ephemeral fallback `SESSION_SECRET` if unset, and lazy demo repo seeding (`src/worker/auth/demoSeed.ts`). |
| **Production Mode**         | Production build (`vite build` / `npm run build`), OR `AUTH_MODE=production`, OR `ADMIN_PASSWORD` is set            | Disables `/auth/demo-login`, hides demo UI, disables mock seeding, requires non-empty `SESSION_SECRET`, and fails closed if `ADMIN_PASSWORD` is unset.                                                                      |

---

## Role-Based Access Control (RBAC)

Directory accounts stored in D1 (`namespace_directory_meta`) have a **role** (`admin`, `member`, `viewer`) and a **status** (`active`, `disabled`):

| Capability                                         | `admin` (active) |           `member` (active)           |       `viewer` (active)       |  `disabled` (any role)   |
| :------------------------------------------------- | :--------------: | :-----------------------------------: | :---------------------------: | :----------------------: |
| Browse public repos & namespaces                   |       Yes        |                  Yes                  |              Yes              |   Yes (anonymous only)   |
| Browse private repos in own namespace              |       Yes        |                  Yes                  |              Yes              | No (session invalidated) |
| Create/edit repos & web commits in own namespace   |       Yes        |                  Yes                  |          No (`403`)           |            No            |
| Push via PAT (`level = "push"`)                    |       Yes        |                  Yes                  | **No** (downgraded to `pull`) | **No** (`token-revoked`) |
| Mint repo/namespace PATs                           |       Yes        | Yes (`pull` only if viewer? See note) |           Read-only           |            No            |
| Mint & use **Global Admin PAT** (`All namespaces`) |       Yes        |              No (`403`)               |          No (`403`)           |   No (`grant-missing`)   |
| Feature public repos on Homepage (`homePinned`)    |       Yes        |              No (`403`)               |          No (`403`)           |            No            |
| Access `/admin/*` Control Panel & User Directory   |       Yes        |              No (`403`)               |          No (`403`)           |            No            |

### Primary Administrator Protections (`src/shared/admin/panel.ts#evaluatePrimaryAdminPatchPolicy`)

- The primary administrator (matched via `users.tessera_sub === "local:<ADMIN_USERNAME>"`) **cannot** be disabled, demoted from `admin`, deleted, or overridden with a D1 directory password.
- The primary administrator **can** freely rename their public `@namespace` handle and display name in `/admin/users` without altering their env `ADMIN_USERNAME` login credential.

---

## Account & Self-Service Pages (`src/worker/routes/authTokens.ts`)

| Route                                                     | View Section                                                                                             |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `/auth`                                                   | Sign-in form (plus Demo Mode quick buttons in local dev only)                                            |
| `/user`                                                   | Redirects to `/user/account` (or `/auth?next=/user/account` if unauthenticated)                          |
| `/user/account` (alias `/user/accounts`, `/auth/account`) | Account dashboard: namespaces, repositories, and PATs                                                    |
| `/user/profile`                                           | Edit display name, bio, location, and website (`PUT /auth/api/profile`)                                  |
| `/user/settings` & `/user/settings/security`              | Change directory password (`POST /auth/api/change-password`; not applicable to env-backed primary admin) |
| `/user/settings/tokens`                                   | Create, inspect, and revoke Personal Access Tokens                                                       |

---

## Personal Access Tokens (PATs) (`src/worker/auth/pat.ts`)

### Token Format & Storage

- **Plaintext format:** `goc_<8 lowercase hex chars>_<32 lowercase base32 chars>` (`160` bits of CSPRNG secret entropy).
- **Storage:** Only the public prefix (`goc_<8-hex>`) and the **SHA-256 hex digest** of the full plaintext are stored in D1 (`personal_access_tokens`).
- **Verification:** Constant-time comparison (`crypto.subtle.timingSafeEqual` with XOR fallback) plus live D1 checks for revocation, expiry, and owner role/status.
- **`last_used_at` tracking:** Always updated on `write` (`git-receive-pack`); throttled to once every **15 minutes** (`PAT_LAST_USED_READ_THROTTLE_MS`) on reads to avoid excessive D1 writes.

### Supported PAT Scopes (`src/worker/routes/requestSchemas.ts#PatCreateRequestSchema`)

| Scope           | D1 Grant Table         | Who Can Mint             | HTTP Basic Username Accepted                                       |
| :-------------- | :--------------------- | :----------------------- | :----------------------------------------------------------------- |
| **`repo`**      | `pat_repo_grants`      | Namespace member / admin | Target repository's `:owner` slug                                  |
| **`namespace`** | `pat_namespace_grants` | Namespace member / admin | Target repository's `:owner` slug                                  |
| **`global`**    | `pat_global_grants`    | Active `admin` only      | Target `:owner` slug **OR** any of the admin's own namespace slugs |

### Permission Levels

- **`pull` (Read):** Authorizes `git clone` / `git fetch` on matching private (and public) repos.
- **`push` (Read & Write):** Authorizes both fetch and `git push` (`git-receive-pack`)—unless the owner's directory role has been demoted to `viewer`, in which case verification dynamically caps effective access to `pull`.
