# Support & Troubleshooting Guide (`git-on-cloudflare`)

Need help running, deploying, or contributing to **`git-on-cloudflare`**? This document lists the official **[Vib Tools](https://vibtools.io/)** support channels, contact routing rules, and solutions to common operational questions.

---

## 1. Official Contact & Support Routing

Use the table below to reach the right channel quickly:

| Request Type                              | Preferred Channel                                                             | Details                                                                                         |
| :---------------------------------------- | :---------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **Bug Report**                            | [GitHub Issues](https://github.com/vibtoolshq/git-on-cloudflare/issues)       | Open a reproducible bug report with steps, logs, and environment details.                       |
| **Feature Request**                       | [GitHub Issues](https://github.com/vibtoolshq/git-on-cloudflare/issues)       | Propose a focused improvement aligned with `git-on-cloudflare`'s scope.                         |
| **Code Contribution**                     | [GitHub Pull Requests](https://github.com/vibtoolshq/git-on-cloudflare/pulls) | Follow [`CONTRIBUTING.md`](./CONTRIBUTING.md) and submit a focused PR.                          |
| **Product / Technical Support**           | [support@vibtools.io](mailto:support@vibtools.io)                             | Help with Vib Tools products and public open-source projects.                                   |
| **Security Vulnerability**                | [support@vibtools.io](mailto:support@vibtools.io)                             | **Private disclosure only.** Follow [`SECURITY.md`](./SECURITY.md); do not open a public issue. |
| **General Inquiry / Partnership / Press** | [hello@vibtools.io](mailto:hello@vibtools.io)                                 | Partnerships, press/media, company inquiries, and general questions.                            |
| **Phone / WhatsApp**                      | `+880 1795-470603` (`+8801795470603`)                                         | Direct phone & WhatsApp contact (Bangladesh, GMT+6 / Asia-Dhaka context).                       |
| **Official Website**                      | [https://vibtools.io/](https://vibtools.io/)                                  | Current Vib Tools product catalog, status, and documentation.                                   |

### Head Office

**Vib Tools HQ**  
5660 Kochakata, Nageswari  
Kurigram, Rangpur  
Bangladesh

---

## 2. Common Troubleshooting FAQ

### Q1: Why are the "Quick Demo Login" and "Demo User Panel" buttons visible (or hidden) on `/auth`?

- **Local Development / Preview Mode:** When `ADMIN_PASSWORD` is left empty in `.dev.vars`, Demo Mode is enabled automatically. It displays the quick-login buttons and seeds `@admin` (`admin123`) and `@alex-dev` (`devuser123`) along with `/alex-dev/cloud-forge-kit`.
- **Production Mode:** Once you set `ADMIN_PASSWORD` via `npx wrangler secret put ADMIN_PASSWORD`, Demo Mode is disabled automatically for security.

### Q2: Why does `git push` return `401 Unauthorized` or `403 Forbidden`?

- Git pushes require an active **Personal Access Token (`goc_...`)** created at `/user/settings/tokens` with **`push`** access level.
- Your HTTP Basic **username** must match the route namespace handle (e.g., `alex-dev` when pushing to `/:owner/:repo` under `/alex-dev/my-repo`), and the **password** must be the `goc_...` token.
- Users with the **`viewer`** role have read-only access and cannot create `push` tokens or push commits.

### Q3: Why does a concurrent `git push` return `503 Service Unavailable`?

- `RepoDurableObject` enforces a single-writer receive lease (`beginReceive` / `finalizeReceive`) so two concurrent pushes cannot corrupt repository refs. When a push is already in progress, concurrent pushes receive `HTTP 503` with `Retry-After: 10`. Wait a few seconds and retry `git push`.

### Q4: Why is the repository `Settings` (`/:owner/:repo/admin`) tab not visible?

- By design, `Settings` is strictly RBAC-gated (`canViewerManageRepo`). It is rendered only when you are signed in as an active member of the repository's namespace with write permissions (or as a Site Administrator). Anonymous visitors and read-only `viewer` accounts only see `<> Code` and `Commits`.

### Q5: How do I customize my public profile README on `/:username`?

1. Sign in and visit your public profile at `/:username` (e.g., `/alex-dev`).
2. On the **`Overview`** tab, click **`Initialize .vibtools profile`** (or **`Edit README`** if `.vibtools` already exists).
3. Save your Markdown content—it is committed directly to `/:username/.vibtools` (`profile/README.md`) and rendered on your `Overview` tab.

---

## 3. Useful Documentation Links

- [`README.md`](./README.md) — Complete A–Z feature guide, setup, and deployment instructions.
- [`docs/api-endpoints.md`](./docs/api-endpoints.md) — HTTP endpoints and JSON schemas.
- [`docs/architecture.md`](./docs/architecture.md) — Worker, Durable Object, R2, D1, KV, and Queue architecture.
- [`docs/storage.md`](./docs/storage.md) — Pack-first R2 + Durable Object SQLite storage model.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Developer workflow, architectural invariants, and testing commands.
- [`SECURITY.md`](./SECURITY.md) — Security architecture and private vulnerability reporting.
