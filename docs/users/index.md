---
title: Gitra
description: End-user and self-hosting operator documentation for Gitra.
version: "0.1.0"
category: Developer Tools
order: 0
draft: false
---

# Gitra User Guide

Welcome to the **Gitra** User Guide. Whether you are cloning repositories from an existing Gitra instance or deploying your own serverless Git forge on Cloudflare, these guides explain every implemented workflow and setting.

---

## Reading Order

1. **[Getting Started](./getting-started.md)** — Run Gitra locally in Demo Mode, sign in, create a Personal Access Token (PAT), and push your first repository.
2. **[Installation & Deployment](./installation.md)** — Deploy Gitra to a Cloudflare Free or Paid account using the zero-touch idempotent auto-deploy pipeline.
3. **[Configuration](./configuration.md)** — Manage runtime environment variables, secrets, and live instance branding/SEO in `/admin/settings`.
4. **[Feature Guides](./features/index.md)** — Detailed guides for every implemented capability:
   - [Git Smart HTTP v2 & CLI](./features/git-protocol-and-cli.md)
   - [Repositories, Code Browser & Web Editor](./features/repositories-and-code-browser.md)
   - [Namespaces & `.vibtools` Profiles](./features/namespaces-and-profiles.md)
   - [Authentication, RBAC & Personal Access Tokens](./features/auth-rbac-and-tokens.md)
   - [Admin Control Panel & Branding Studio](./features/admin-console-and-branding.md)
   - [Cloudflare Free/Paid Tiers & Zero-Touch Auto-Deploy](./features/cloudflare-tiers-and-auto-deploy.md)
5. **[Common Workflows](./workflows.md)** — Practical recipes for daily development, onboarding team members, and safe redeployments.
6. **[Troubleshooting](./troubleshooting.md)** — Diagnosing authentication, CSRF, receive-lease, and Cloudflare tier errors.
7. **[FAQ](./faq.md)** — Answers to common questions about limits, compatibility, and architecture.

---

## Need Technical Internals?

Looking for API schemas, database tables, or contribution rules? Head to the [Developer Guide](https://developer.vibtools.io/gitra/) or [Technical Reference](https://developer.vibtools.io/gitra/reference/).
