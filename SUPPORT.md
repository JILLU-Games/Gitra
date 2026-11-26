# Support & Troubleshooting Guide (Gitra)

Need help installing, deploying, or operating **Gitra** ([gitra.co](https://gitra.co/))? This guide lists the official **[Vib Tools](https://vib.tools/)** support channels and answers common setup and runtime questions.

---

## 1. Official Contact & Support Routing

| Request Type                              | Preferred Channel                                                                 | Notes                                                                      |
| :---------------------------------------- | :-------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Bug Report**                            | [GitHub Issues](https://github.com/vibtoolshq/gitra/issues)                       | Include reproduction steps, environment, and relevant logs.                |
| **Feature Request**                       | [GitHub Issues](https://github.com/vibtoolshq/gitra/issues)                       | Propose focused improvements aligned with Gitra's serverless architecture. |
| **Code Contribution**                     | [GitHub Pull Requests](https://github.com/vibtoolshq/gitra/pulls)                 | Follow [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR.         |
| **Product & Technical Support**           | [support@vibtools.io](mailto:support@vibtools.io)                                 | Help with Gitra and public Vib Tools projects.                             |
| **Security Vulnerability**                | [support@vibtools.io](mailto:support@vibtools.io)                                 | **Private disclosure only.** Follow [`SECURITY.md`](./SECURITY.md).        |
| **General Inquiry / Partnership / Press** | [hello@vibtools.io](mailto:hello@vibtools.io)                                     | Partnerships, media, and general company inquiries.                        |
| **Phone / WhatsApp**                      | `+880 1795-470603` (`+8801795470603`)                                             | Bangladesh business context (GMT+6 / Asia-Dhaka).                          |
| **Official Websites**                     | [https://gitra.co/](https://gitra.co/) · [https://vib.tools/](https://vib.tools/) | Project site and official Vib Tools product catalog.                       |

### Head Office

**Vib Tools HQ**  
5660 Kochakata, Nageswari  
Kurigram, Rangpur  
Bangladesh

---

## 2. Common Troubleshooting FAQ

### Q1: Can I deploy Gitra on a Cloudflare Free account without paying $5/month?

Yes. Run `npm run cf:auto-deploy` with `CLOUDFLARE_TIER=free` (the default). Gitra automatically omits Paid-only `limits.cpu_ms`, skips heavy automatic background compaction to avoid hitting the 10ms Free CPU limit, and supports `--no-queues` (`USE_QUEUES=false`) inline fallback. You only need to click **Enable R2** once in the Cloudflare Dashboard (includes 10 GB/month Free quota).

### Q2: Will redeploying Gitra overwrite my secrets or break existing Git PATs?

No. `npm run cf:auto-deploy` checks existing Worker secret names via Cloudflare's API and preserves all existing secrets (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) untouched unless you explicitly set `FORCE_ROTATE_SECRETS=true`.

### Q3: Why does `git push` return `401 Unauthorized` or `403 Forbidden`?

- Git pushes require an active Personal Access Token (`goc_...`) with **`push`** access created at `/user/settings/tokens` (or a Global Admin PAT created at `/admin/tokens`).
- For standard tokens, the HTTP Basic **username** must match the target repository's namespace slug (e.g., `alex-dev` for `/alex-dev/my-repo.git`), and the **password** must be the `goc_...` token.
- Users with the **`viewer`** role are read-only and cannot issue `push` tokens.

### Q4: Why does a concurrent `git push` return `503 Service Unavailable`?

`RepoDurableObject` enforces a single-writer receive lease (`beginReceive` / `finalizeReceive`) to keep repository refs linearizable. Concurrent pushes receive `HTTP 503` with `Retry-After: 10`. Wait a few seconds and retry.

### Q5: Why are Demo Mode quick-login buttons visible (or hidden) on `/auth`?

- **Local Dev / Preview:** Leaving `ADMIN_PASSWORD` empty in `.dev.vars` enables Demo Mode (`@admin` / `admin123` and `@alex-dev` / `devuser123`).
- **Production:** Setting `ADMIN_PASSWORD` automatically disables Demo Mode.

### Q6: How do I change the site logo, favicon, title, meta description, or footer text?

Sign in as an administrator and open **`/admin/settings`** (_Admin Control Panel → Site Settings_). Every change saves to D1/R2 and updates the live SSR `<head>`, Header, and Footer immediately.

---

## 3. Useful Documentation Links

- [`README.md`](./README.md) — Complete A–Z feature guide, quick start, and architecture overview.
- [`docs/CLOUDFLARE_DEPLOY.md`](./docs/CLOUDFLARE_DEPLOY.md) — Zero-touch Free & Paid Cloudflare deployment guide.
- [`docs/api-endpoints.md`](./docs/api-endpoints.md) — HTTP endpoints and JSON schemas.
- [`docs/architecture.md`](./docs/architecture.md) — Worker, Durable Object, R2, D1, KV, and Queue design.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Engineering rules, local setup, and validation commands.
- [`SECURITY.md`](./SECURITY.md) — Security controls and private vulnerability disclosure.
