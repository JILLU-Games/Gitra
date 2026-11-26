---
title: Admin Control Panel & Branding Studio
description: Manage users, namespaces, repositories, tokens, live branding, SEO, and per-repository storage diagnostics in Gitra.
order: 5
draft: false
---

# Admin Control Panel & Branding Studio

Gitra provides two distinct administrative surfaces:

1. **Site Administration Control Panel (`/admin/*`)** — restricted strictly to active **`admin`** users (`src/worker/routes/systemAdmin.ts`).
2. **Per-Repository Admin Dashboard (`/:owner/:repo/admin`)** — accessible to active namespace members and site admins (`src/worker/routes/admin.ts`, `src/worker/routes/ui/adminPage.ts`).

> **Session-Only Policy:** Both admin surfaces require a valid browser session cookie (`__Host-goc_session`) plus same-origin CSRF verification on mutating verbs. Git Personal Access Tokens cannot access admin pages or admin JSON APIs.

---

## 1. Site Administration Control Panel (`/admin/*`)

| Page Route                                                  | Capabilities                                                                                                                                                                                               | Backing APIs                                                                                                        |
| :---------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **`/admin`**                                                | Overview dashboard with live counts (total/public/private repos, active/total namespaces, active/total PATs)                                                                                               | `GET /admin/api/overview`                                                                                           |
| **`/admin/repositories`**                                   | Browse all instance repositories, toggle visibility (`public`/`private`), pin/unpin to global Homepage (`homePinned`), or delete repositories                                                              | `PATCH /admin/api/repositories/:repositoryId`, `DELETE /admin/api/repositories/:repositoryId`                       |
| **`/admin/tokens`**                                         | Audit all Personal Access Tokens across users (prefix, scope, target, last used, revoked status) and revoke any token                                                                                      | `DELETE /admin/api/tokens/:patId`                                                                                   |
| **`/admin/users`**                                          | Full User & Namespace Directory: search/filter by role or status, create accounts with custom or CSPRNG temporary passwords, edit display name/handle/role/status/password, or remove non-primary accounts | `GET/POST /admin/api/users`, `PATCH/DELETE /admin/api/users/:userId` (and legacy `/admin/api/namespaces/*` aliases) |
| **`/admin/settings`** (alias `/admin/SettingsControlPanel`) | Live Branding, SEO & Asset Studio: edit site identity, hero copy, meta tags, social links, `robots.txt` indexing toggle, and upload/delete `logo`, `favicon`, and `og-image` assets in R2                  | `PUT /admin/api/settings`, `POST/DELETE /admin/api/settings/asset/:slot`                                            |
| **`/admin/security`**                                       | Security & Policies overview: active auth runtime mode (`development` vs `production`), admin/member/viewer counts, disabled accounts, password coverage, and cryptographic policy summary                 | Server-rendered (`AdminSecurityPage.tsx`)                                                                           |

### Dynamic Public Endpoints Controlled by `/admin/settings`

- **`GET /api/site-assets/:slot`** — Serves uploaded `logo`, `favicon`, or `og-image` bytes from R2 (`site-assets/<slot>`) with `Cache-Control: public, max-age=3600` and `X-Content-Type-Options: nosniff`.
- **`GET /favicon.ico`** — Serves uploaded R2 favicon, redirects (`302`) to external `faviconUrl`, or returns `204` if none is configured.
- **`GET /robots.txt`** — Dynamically switches between `Allow: /` (always disallowing `/admin/` and `/auth/`) when `allowIndexing` is enabled, or `Disallow: /` when disabled.

---

## 2. Per-Repository Admin Dashboard (`/:owner/:repo/admin`)

Every repository includes a dedicated maintenance dashboard (`src/client/pages/AdminPage.tsx`, `src/worker/routes/admin.ts`) exposing typed `RepoDurableObject` controls:

- **Refs & HEAD Management:** Inspect or directly update branch/tag refs (`GET/PUT /:owner/:repo/admin/refs`) and symbolic `HEAD` (`GET/PUT /:owner/:repo/admin/head`), automatically invalidating refs and branch caches.
- **Pack Compaction:**
  - Preview compaction plan without mutating (`POST /:owner/:repo/admin/compact` with `{ "dryRun": true }`, default).
  - Queue/trigger compaction (`POST /:owner/:repo/admin/compact` with `{ "dryRun": false }`, returns `202` when queued).
  - Clear a stuck compaction request (`DELETE /:owner/:repo/admin/compact`).
- **Pack Inspection & Cleanup:**
  - Dump DO metadata & pack catalog (`GET /:owner/:repo/admin/debug-state`).
  - Verify a commit tree (`GET /:owner/:repo/admin/debug-commit/:commit`) or object OID (`GET /:owner/:repo/admin/debug-oid/:oid`).
  - Delete a **superseded** pack and its `.idx` (`DELETE /:owner/:repo/admin/pack/:packKey` — active packs are protected with `409 Conflict`).
- **Danger Zone — Purge Repository:**
  - Permanently deletes the repository from D1, `ROUTES` KV, R2, and DO storage (`DELETE /:owner/:repo/admin/purge` with `{ "confirm": "purge-<owner>/<repo>" }`).
