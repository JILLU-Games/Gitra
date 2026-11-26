---
title: Repositories, Code Browser & Web Editor
description: Explore Gitra's server-rendered repository overview, directory tree browser, syntax-highlighted blob viewer, commit diffs, raw streaming, and browser file editor.
order: 2
draft: false
---

# Repositories, Code Browser & Web Editor

Gitra renders repository views on the edge with React 19 SSR (`src/client/pages/*`) and hydrates lightweight interactive islands (`src/client/islands/*`) for branch switching, diff expansion, and inline file editing.

---

## Web UI Browsing Routes

| View                      | Route                                                          | Capabilities                                                                                                                                                                                                           |
| :------------------------ | :------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Homepage**              | `GET /`                                                        | Site hero, Admin-featured public repositories (`homePinned`), and recent/accessible repositories                                                                                                                       |
| **Explore**               | `GET /explore`                                                 | Public repository directory across namespaces                                                                                                                                                                          |
| **Repository Overview**   | `GET /:owner/:repo`                                            | Default branch files, README rendering (Markdown + sanitized HTML), branch/tag selector, clone URL copy                                                                                                                |
| **Directory Tree**        | `GET /:owner/:repo/tree?ref=<ref>&path=<dir>`                  | Browse subdirectories at any branch, tag, or commit OID                                                                                                                                                                |
| **File / Blob Preview**   | `GET /:owner/:repo/blob?ref=<ref>&path=<file>`                 | Syntax highlighting (`highlight.js`), Markdown rendering (`marked`), image/media preview, binary/oversize guardrails, and inline web editor                                                                            |
| **Commit History**        | `GET /:owner/:repo/commits?ref=<ref>&per_page=50&page=0`       | Paginated commit log with expandable merge-commit side branches (`GET /:owner/:repo/commits/fragments/:oid`)                                                                                                           |
| **Commit Detail & Diff**  | `GET /:owner/:repo/commit/:oid`                                | Commit metadata, changed files list (`A`/`M`/`D`), and lazy per-file patch expansion (`GET /:owner/:repo/commit/:oid/diff?path=<file>`)                                                                                |
| **Raw File (by OID)**     | `GET /:owner/:repo/raw?oid=<sha>&name=<file>[&download=1]`     | Streams blob content safely as `text/plain; charset=utf-8` with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`                                                                               |
| **Raw File (by Path)**    | `GET /:owner/:repo/rawpath?ref=<ref>&path=<file>[&download=1]` | Serves non-scriptable assets (such as README images) with MIME detection and same-origin `Referer` hotlink protection; scriptable types (`svg`, `html`, `xml`, `javascript`) are forced to `text/plain` + `attachment` |
| **Branch / Tag JSON API** | `GET /:owner/:repo/api/refs`                                   | Populates the navigation branch/tag dropdown asynchronously                                                                                                                                                            |

---

## Repository Creation & Metadata

Authenticated `admin` and `member` users can create and configure repositories (`src/worker/routes/authRepositories.ts`):

- **Visibility:** `public` (readable anonymously) or `private` (accessible only to namespace members, active admins, or matching PAT holders; unauthenticated UI requests return `404` to avoid existence disclosure).
- **Description:** Single-line text sanitized up to `200` characters (`REPO_DESCRIPTION_MAX_LENGTH`).
- **Auto-Initialize:** Optional starter `README.md` (`initializeReadme: true`) or `.vibtools` `profile/README.md` (`initializeProfileReadme: true`), committed immediately to R2 and the repository's Durable Object.
- **Pinning:**
  - `pinned`: pins a repository on the owner's namespace profile page (manageable by namespace `member` or `admin`).
  - `homePinned`: features a **public** repository on the global homepage (manageable exclusively by `admin`; automatically cleared if the repository becomes `private`).

---

## In-Browser File Editor

Authorized writers (`admin` or namespace `member`, not `viewer`) can edit and commit text files directly from the blob viewer via **`PUT /auth/api/repositories/:repositoryId/file`** (`src/worker/routes/authRepositories.ts`, `src/worker/git/commitFile.ts`):

- **Payload limit:** `256 KiB` (`MAX_WEB_COMMIT_BYTES`).
- **Real Git commit:** Constructs proper Git blob, updated parent trees, and commit objects, packages them into a valid `.pack` + `.idx` in R2, acquires the DO receive lease, and commits the branch ref atomically.
- **No separate branch creation UI:** Edits target an existing branch ref (`ref` parameter, defaulting to HEAD).

---

## Slug & Naming Rules (`src/shared/slugs.ts`)

- **Repository slugs:** 1–40 characters matching `/^\.?[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/`.
- Leading dot is allowed specifically for dot-prefixed repos like `.vibtools`.
- Path traversal (`..`), trailing `.git` suffix, and reserved top-level slugs (`auth`, `user`, `profile`, `explore`, `namespaces`, `repo`, `sign-in`, `sign-out`, `api`, `assets`, `_cache`, `_routes`, `favicon.ico`, `robots.txt`) are rejected.
