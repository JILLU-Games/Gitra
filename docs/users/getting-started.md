---
title: Getting Started with Gitra
description: Run Gitra locally in Demo Mode, sign in, create a Personal Access Token, and push your first Git repository.
order: 1
draft: false
---

# Getting Started with Gitra

This guide walks you through starting Gitra locally, exploring the pre-seeded Demo Mode workspace, signing in, creating a repository, and pushing commits over HTTPS.

---

## Prerequisites

- **Node.js** `20+` (recommended `22+`) and **npm**
- **Git** CLI `2.26+` (for Git Smart HTTP v2 support)

---

## 1. Run Gitra Locally

Clone the repository, install dependencies, and start the local Cloudflare Workers + Vite development server:

```bash
git clone https://github.com/vibtoolshq/gitra.git
cd gitra
npm install
npm run dev
```

Gitra boots on `http://localhost:3000` (configured in `vite.config.ts`) using local Miniflare emulation for D1, Durable Objects, R2, and KV. On the first HTTP request, `ensureD1Schema()` (`src/worker/db/d1/bootstrap.ts`) automatically creates all 11 D1 tables—no manual database migration command is required for local preview.

---

## 2. Sign In (Local Demo Mode)

When running locally via `npm run dev` without `ADMIN_PASSWORD` or `AUTH_MODE=production` set (`src/worker/auth/adminAuth.ts`), Gitra runs in **Demo Mode**:

- Navigate to **`http://localhost:3000/auth`**.
- Use either the one-click Demo buttons or the standard login form with the built-in local accounts:

| Account                   | Role     | Username   | Demo Password | Namespace                   |
| :------------------------ | :------- | :--------- | :------------ | :-------------------------- |
| **Primary Administrator** | `admin`  | `admin`    | `admin123`    | `@admin` (`/profile/admin`) |
| **Standard Developer**    | `member` | `alex-dev` | `devuser123`  | `@alex-dev` (`/alex-dev`)   |

> **Security Note:** Demo Mode is **automatically disabled** in production builds (`vite build` / `npm run build` where `import.meta.env.PROD === true`), whenever `AUTH_MODE=production`, or whenever `ADMIN_PASSWORD` is configured. Demo passwords (`admin123` / `devuser123`) are never active in production.

---

## 3. Create Your First Repository

1. Open your account workspace at **`/user/account`** (or **`/auth/account`**), or click **New Repository** from the home page (`/`).
2. Choose a **Namespace** you belong to (for example, `admin` or `alex-dev`).
3. Enter a **Repository Slug** (lowercase ASCII letters, digits, dots, underscores, or hyphens; up to 40 characters—e.g. `hello-gitra`).
4. Select **Public** or **Private** visibility.
5. Optionally enable **Initialize with README.md** to create an initial commit immediately.
6. Submit to create the repository.

You can now browse your repository at `http://localhost:3000/<namespace>/<repo>`.

---

## 4. Mint a Personal Access Token (PAT) for Git CLI

Gitra requires a Personal Access Token for all `git push` operations and for cloning private repositories. Passwords used for web login cannot be used for Git CLI authentication.

1. Visit **`/user/settings/tokens`** (or the **Access Tokens** tab in `/user/account`).
2. Enter a **Token Name** (1–40 alphanumeric/space/hyphen/underscore characters, e.g. `laptop-cli`).
3. Choose a **Scope**:
   - **Repository** — access a single repository.
   - **Namespace** — access all repositories under a namespace you belong to.
   - **All namespaces (Global)** — available exclusively to active `admin` accounts.
4. Choose **Permission Level**:
   - **Read (`pull`)** — clone and fetch only.
   - **Read & Write (`push`)** — clone, fetch, and push.
5. Click **Create Token** and copy the generated token immediately (`goc_<8-hex>_<32-base32>`). Plaintext tokens are hashed with SHA-256 and cannot be viewed again.

---

## 5. Clone, Commit, and Push

```bash
# Clone a public repository (no credentials needed)
git clone http://localhost:3000/alex-dev/hello-gitra.git
cd hello-gitra

# Make a change
echo "Hello from Gitra!" >> README.md
git add README.md
git commit -m "Add greeting"

# Push using HTTP Basic authentication
# Username = namespace slug (or admin handle for Global Admin PATs)
# Password = your Personal Access Token (goc_...)
git push http://alex-dev:goc_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@localhost:3000/alex-dev/hello-gitra.git main
```

> **Tip:** Both `/owner/repo` and `/owner/repo.git` URLs are supported by Gitra's Smart HTTP endpoints (`src/worker/routes/git.ts`).

---

## Next Steps

- Deploy to Cloudflare Workers in minutes with **[Installation & Zero-Touch Auto-Deploy](./installation.md)**.
- Customize branding, logos, and SEO metadata in **[Configuration](./configuration.md)**.
- Learn about `.vibtools` namespace profile pages in **[Namespaces & Profiles](./features/namespaces-and-profiles.md)**.
