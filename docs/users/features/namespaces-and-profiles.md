---
title: Namespaces & .vibtools Profiles
description: How Gitra organizes repositories under namespaces, serves public profiles, and renders .vibtools/profile/README.md pages.
order: 3
draft: false
---

# Namespaces & `.vibtools` Profiles

Every repository in Gitra lives inside a **namespace** (`@<slug>`). Namespaces act as user or organization spaces, URL owners (`/:owner/:repo`), and authorization boundaries.

---

## Namespace Directory & URL Structure

| Route                 | Purpose                                                                                                                                                                          |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /namespaces`     | Browse all active namespaces on the instance (`src/worker/index.ts`)                                                                                                             |
| `GET /:owner`         | Public namespace profile page with bio, pinned repos, `.vibtools` README, and repository list                                                                                    |
| `GET /profile/:owner` | Explicit profile route — required for `@admin` (`/profile/admin`) so it never collides with `/admin` Site Administration (`src/shared/admin/panel.ts#buildNamespaceProfileHref`) |

### Namespace Slug Rules (`src/shared/slugs.ts`)

- 1–40 lowercase ASCII alphanumeric characters with internal hyphens: `/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/`.
- Cannot match reserved routes (`auth`, `user`, `profile`, `explore`, `namespaces`, `repo`, `sign-in`, `sign-out`, `api`, `assets`, `_cache`, `_routes`, `favicon.ico`, `robots.txt`).
- Leading `@` prefixes typed in forms are stripped automatically by `normalizeNamespaceHandle()`.

---

## Customizing Your Profile Metadata

Signed-in users can edit their namespace profile at **`/user/profile`** (`PUT /auth/api/profile`, validated by `ProfileMetaUpdateRequestSchema`):

| Field            | Max Length | Validation & Storage                                                                                                                             |
| :--------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Display Name** | 80 chars   | Stripped of control chars; stored in `namespace_directory_meta.display_name`                                                                     |
| **Bio**          | 200 chars  | Single-line sanitized; stored in `namespace_profile_meta.bio`                                                                                    |
| **Location**     | 60 chars   | Single-line sanitized; stored in `namespace_profile_meta.location`                                                                               |
| **Website**      | 160 chars  | Only `http://` or `https://` URLs with a valid hostname (`javascript:`, `data:`, `mailto:` rejected); stored in `namespace_profile_meta.website` |

---

## `.vibtools` Profile README

Modeled after GitHub Organization `.github/profile/README.md` repositories, any namespace can create a repository named **`.vibtools`** (`src/shared/slugs.ts#PROFILE_REPO_SLUG`) containing a profile README at one of the recognized candidate paths (`PROFILE_README_CANDIDATES`):

- `profile/README.md` _(canonical default)_
- `profile/readme.md`
- `profile/README.MD`
- `profile/Readme.md`
- `profile/README`
- `profile/readme`

### Creating & Editing `.vibtools`

1. Create a public repository named `.vibtools` with **Initialize profile README** checked—Gitra commits a starter Markdown template (`buildDefaultProfileReadmeTemplate()`).
2. Edit the profile README directly from the namespace profile page or repository view via **`PUT /auth/api/repositories/:repositoryId/profile-readme`** (max `256 KiB`), or clone and push `.vibtools` over Git CLI like any standard repository.

---

## Pinned Namespace Repositories

Namespace members (and site admins) can toggle `pinned: true` on repositories (`PATCH /auth/api/repositories/:repositoryId`) to highlight key projects at the top of the namespace's profile page.
