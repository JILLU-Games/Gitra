---
title: Features
description: Complete directory of all implemented features in Gitra with detailed usage guides.
order: 4
draft: false
---

# Gitra Feature Guides

Every feature listed below has been forensically verified against Gitra's live source code.

| Feature Guide                                                                                    | Status            | Primary Source Modules                                                                                                      |
| :----------------------------------------------------------------------------------------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **[Git Smart HTTP v2 & CLI](./git-protocol-and-cli.md)**                                         | Fully Implemented | `src/worker/routes/git.ts`, `src/worker/git/core/protocol.ts`, `src/worker/git/receive/`, `src/worker/git/operations/`      |
| **[Repositories, Code Browser & Web Editor](./repositories-and-code-browser.md)**                | Fully Implemented | `src/worker/routes/ui/*`, `src/worker/routes/authRepositories.ts`, `src/worker/git/commitFile.ts`, `src/client/pages/*`     |
| **[Namespaces & `.vibtools` Profiles](./namespaces-and-profiles.md)**                            | Fully Implemented | `src/worker/routes/ui/overview.ts`, `src/worker/index.ts`, `src/shared/slugs.ts`, `src/client/pages/OwnerPage.tsx`          |
| **[Authentication, RBAC & Personal Access Tokens](./auth-rbac-and-tokens.md)**                   | Fully Implemented | `src/worker/auth/*`, `src/worker/routes/authLogin.ts`, `src/worker/routes/authTokens.ts`, `src/shared/admin/panel.ts`       |
| **[Admin Control Panel & Branding Studio](./admin-console-and-branding.md)**                     | Fully Implemented | `src/worker/routes/systemAdmin.ts`, `src/worker/routes/admin.ts`, `src/worker/branding.ts`, `src/shared/branding.ts`        |
| **[Cloudflare Free/Paid Tiers & Zero-Touch Auto-Deploy](./cloudflare-tiers-and-auto-deploy.md)** | Fully Implemented | `src/worker/common/tier.ts`, `src/worker/tasks/dispatch.ts`, `scripts/cf-auto-deploy.mjs`, `scripts/cf-auto-deploy-lib.mjs` |

For a complete maturity breakdown—including partially implemented, historical, or unused items—see the [Documentation Manifest](https://github.com/vibtoolshq/gitra/blob/main/docs/MANIFEST.md).
