---
name: "Bug Report"
about: "Report a reproducible bug or regression in Gitra"
title: "[Bug]: "
labels: ["bug"]
assignees: []
---

> **Security Note:** If you are reporting a sensitive security vulnerability, please **do not** open a public issue. Instead, follow [`SECURITY.md`](../../SECURITY.md) and email **[support@vibtools.io](mailto:support@vibtools.io)** privately.

## Summary

<!-- A concise description of the bug. -->

## Affected Component / Subsystem

- [ ] Git Smart HTTP v2 (`info/refs`, `git-upload-pack`, `git-receive-pack`)
- [ ] Repo Durable Object / SQLite / Pack Compaction (`src/worker/do/repo/*`)
- [ ] Cloudflare R2 Pack Storage / Indexer (`src/worker/git/pack/*`)
- [ ] Zero-Touch Auto-Deploy / Free or Paid Tier Config (`scripts/*`, `wrangler.jsonc`)
- [ ] Authentication, Sessions, RBAC, or PATs (`src/worker/auth/*`, `src/worker/db/d1/*`)
- [ ] Repository Web UI / Namespaces / Public Profile (`/:owner`, `/namespaces`, `/:owner/:repo/*`)
- [ ] User Settings Panel (`/user/*`)
- [ ] Site Administration / Branding & SEO Studio (`/admin/*`)
- [ ] Other (please specify below)

## Steps to Reproduce

1.
2.
3.

## Expected Behavior

<!-- What should have happened? -->

## Actual Behavior & Logs

<!-- What happened instead? Paste relevant Worker logs, Git CLI output, or HTTP status codes. -->

```text
Paste terminal or console output here
```

## Environment

- **Runtime:** Local Dev (`npm run dev`) / Cloudflare Workers Free / Cloudflare Workers Paid
- **Queues Enabled (`USE_QUEUES`):** `true` / `false`
- **Git Client Version (`git --version`):**
- **Node.js / Wrangler Version:**
- **Browser (if UI-related):**
