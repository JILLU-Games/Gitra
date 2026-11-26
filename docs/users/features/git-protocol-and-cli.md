---
title: Git Smart HTTP v2 & CLI
description: How Gitra implements Git Smart HTTP v2 clone, fetch, and streaming push over Cloudflare Workers, Durable Objects, and R2.
order: 1
draft: false
---

# Git Smart HTTP v2 & CLI

Gitra exposes standard HTTPS Git Smart HTTP endpoints compatible with modern Git clients (`Git 2.26+`), supporting both `/<owner>/<repo>` and `/<owner>/<repo>.git` URLs (`src/worker/routes/git.ts#normalizeGitRouteRepoSlug`).

---

## Supported Endpoints & Protocol Capabilities

| Operation           | Endpoint                                               | Protocol & Capabilities                                                                                                                              |
| :------------------ | :----------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fetch Discovery** | `GET /:owner/:repo/info/refs?service=git-upload-pack`  | Protocol **v2**: `agent=git-on-cloudflare/0.1`, `ls-refs`, `fetch`, `side-band-64k`, `ofs-delta`, `object-format=sha1`                               |
| **Clone / Fetch**   | `POST /:owner/:repo/git-upload-pack`                   | Commands: `ls-refs` (`ref-prefix`, `peel`, `symrefs`) and `fetch` (streaming pack assembly with `side-band-64k` & optional `Content-Encoding: gzip`) |
| **Push Discovery**  | `GET /:owner/:repo/info/refs?service=git-receive-pack` | v0-style ref advertisement with `report-status`, `delete-refs`, `side-band-64k`, `quiet`, `atomic`, `ofs-delta`                                      |
| **Push**            | `POST /:owner/:repo/git-receive-pack`                  | Streaming R2 `.pack` + `.idx` write with single-writer DO receive lease and atomic ref commit                                                        |

> **Limitations verified in source (`src/worker/git/core/protocol.ts`, `src/worker/routes/git.ts`):**
>
> - Only SHA-1 repositories (`object-format=sha1`) are supported (SHA-256 object format is not supported).
> - `thin-pack` is intentionally not advertised on fetch.
> - Legacy protocol v0/v1 `POST git-upload-pack` without `Git-Protocol: version=2` or a v2 `command=` body returns `400`.
> - Git LFS and SSH transport are not implemented.

---

## Authentication Rules for Git CLI

### Public Repositories

- **Clone / Fetch:** Anonymous access allowed (no credentials needed).
- **Push:** Always requires a Personal Access Token with `level = "push"`. There is no anonymous push mode (`src/worker/routes/git.ts#gateGitPush`).

### Private Repositories

- **Clone / Fetch:** Requires a valid PAT with `pull` or `push` grant for the target repo/namespace (or an active admin's Global PAT). Anonymous discovery returns `404` to avoid leaking repository existence.
- **Push:** Requires a valid PAT with `push` grant.

### Username Matching Rules (`src/worker/auth/pat.ts#verifyPat`)

- **Repo-scoped or Namespace-scoped PAT:** HTTP Basic **username must match `:owner`** (the repository's namespace slug).
- **Global Admin PAT:** HTTP Basic **username may be either `:owner` or any of the admin's own namespace slugs**.

```bash
# Public clone
git clone https://git.example.com/vibtools/gitra.git

# Private clone or push with scoped PAT
git clone https://vibtools:goc_1a2b3c4d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@git.example.com/vibtools/private-repo.git

# Push using a git credential helper (recommended so tokens aren't saved in .git/config)
git clone https://git.example.com/vibtools/gitra.git
git push origin main
# Username: vibtools
# Password: <paste goc_... PAT>
```

---

## Streaming Push & Receive Lease Behavior

When you run `git push`:

1. The Worker acquires a single-writer receive lease on `RepoDurableObject` via `beginReceive()`. If another push is already in progress on the same repository, Gitra returns **`503 Service Unavailable`** with `Retry-After: 10`.
2. The incoming packfile is streamed directly to R2 (`do/<doId>/objects/pack/<name>.pack`), indexed inline to build the matching `.idx` (and `.refs` sidecar), and written to R2.
3. Refs and `pack_catalog` metadata are committed atomically via `finalizeReceive()`.
4. On success, Gitra updates `repositories.updated_at` in D1, invalidates the branch/refs cache, and (on Paid tier) may trigger background compaction.
5. On error or disconnect, the lease is released via `abortReceive()` (and expired leases are cleaned up by the DO `alarm()`).
