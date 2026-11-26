# 05 · Actual Implementation Status Ledger

Truth ledger distinguishing what is **actually working in Production**, what is **Demo-only**, and what is **broken, simulated, or missing** at the frozen baseline (`2026-11-26`), plus phase tracking.

---

## 1. Currently Working Features (Verified at Baseline)

| Domain | Feature | Runtime Verification Proof | Parity Note |
| :--- | :--- | :--- | :--- |
| **Git Smart HTTP v2** | `GET /info/refs`, `POST /git-upload-pack` (`ls-refs`, streaming `fetch`), `POST /git-receive-pack` (streaming pack ingest, lease lock) | `src/worker/routes/git.ts`, `streamReceivePack.ts`, `uploadStream/index.ts`, verified by `test:workers` | Incremental fetch fails `503` if pack `.refs` missing & Queues unbound (`F-09`); v0/v1 rejected (`F-17`) |
| **Auth Core** | PBKDF2-SHA256 (`100k` iter, 16B salt) verification, AES-GCM-256 `goc_sess_` sealed cookies, same-origin CSRF checks, PAT generation/scoping/revocation | `src/worker/auth/{session,pat,origin}.ts`, `authLogin.ts`, `authTokens.ts`, verified by `test:auth` | `/auth/setup`, D1 primary admin UI, session revocation & HTTP cookies have bugs (`F-02`–`F-08`) |
| **Control-Plane CRUD** | User creation/edit/disable/delete, Namespace rename & KV cache cleanup, Repo create/visibility/description/pin/`homePinned`/delete, Site Branding CRUD + R2 logo/favicon/og uploads | `src/worker/routes/{systemAdmin,authRepositories}.ts`, `src/worker/db/d1/dal/` | Cold branch lookup caps at `60` (`F-18`); footer Profile link breaks on `admin` (`F-01`) |
| **Repo Code Browser** | SSR overview, directory tree, syntax-highlighted blob view, commit list, merge commit expansion, commit diff inspection, markdown README rendering | `src/worker/routes/ui/{overview,tree,blob,commits}.ts`, `src/client/pages/*` | `rawpath` rejects direct opens (`F-16`) |
| **Web Single-File Edit** | Create README, create new text file, edit existing text file (`PUT /auth/api/repositories/:id/file`, `profile-readme`), committing directly to DO + R2 pack | `src/worker/git/commitFile.ts`, `authRepositories.ts:361-525`, `blob-editor.tsx` | Missing upload/delete/rename/folder/branch/tag UI; stamps `@local.dev` email (`F-12`) |
| **Repo DO & Pack Tools** | Pack catalog inspection, OID/Commit debug inspection, stale pack removal (`DELETE /admin/pack/:key`), repo purge (`DELETE /admin/purge`) | `src/worker/routes/admin.ts`, `src/worker/do/repo/repoDO.ts`, `compactionCard.tsx` | Compaction hangs `"queued"` without Queues (`F-10`) |
| **Deploy Automation** | D1/KV/R2/Queue resource creation & ID resolution, Free vs Paid Wrangler config synthesis, idempotent D1 migrations | `scripts/cf-auto-deploy.mjs`, `cf-auto-deploy-lib.mjs` (`8/8` node tests pass) | Secret upload runs post-deploy + creates unused secrets (`F-20`) |

---

## 2. Demo-Mode-Only Features (Compiled / Gated Out in Production)

| Feature | How Separated | Production Behavior |
| :--- | :--- | :--- |
| **`POST /auth/demo-login`** (`admin` & `alex-dev` 1-click sign-in) | `if (import.meta.env.PROD \|\| !isDemoModeEnabled(c.env)) return 403` (`authLogin.ts:680`) | Compiled out & returns `403` in Production |
| **Quick Demo Login UI Card & Test Credentials Display** | `showDemoUi = !import.meta.env.PROD && demoMode` (`AuthSignInPage.tsx:48,178-220`) | Stripped cleanly from `/auth` in Production |
| **Lazy Workspace Seeding (`ensureDemoTestUserSeeded`)** | `if (import.meta.env.PROD) return` (`index.ts:63,77,175,226`, `authLogin.ts:349`) | Never executes in Production (`users` starts empty for `/auth/setup`) |
| **Default Demo Password Fallback (`admin123`)** | Blocked when `import.meta.env.PROD` or `AUTH_MODE=production` (`adminAuth.ts:153-159`) | Fails closed (`password: null`) until `/auth/setup` or `ADMIN_PASSWORD` secret |

---

## 3. Broken, Simulated, Missing or Unverified Features (Active Backlog)

1. **Footer `Profile` link (`F-01` — BROKEN + TEST FAILING):** `footer.tsx:110` links to `/${slug}` instead of `/profile/${slug}` -> collides with `/admin` and fails `test/demo-user-mock-repo.worker.test.ts:155`.
2. **Production `/auth/setup` Custom Handle (`F-02` — BROKEN):** Custom handle breaks `isPrimaryAdmin`, primary-admin deletion protection, and SSR ownership flags.
3. **D1 Primary Admin Password Management (`F-03` — UI BLOCKED):** UI disables change/reset even when `ADMIN_PASSWORD` is unset.
4. **Atomic `/auth/setup` (`F-04` — MISSING):** Partial D1 failure locks `/auth/setup`.
5. **Session Revocation on Password Rotation (`F-05` — MISSING):** Old 30-day cookies remain active.
6. **Accurate Auth Source Labels (`F-06` — MISLEADING):** Shows `ADMIN_PASSWORD set` / `(env)` when using D1 auth.
7. **Atomic/Resilient Rate Limiting (`F-07` — WEAK):** KV RMW race + fail-open behavior.
8. **HTTP Plain-LAN Auth Cookies (`F-08` — BROKEN ON HTTP):** `__Host-` + `Secure` dropped outside HTTPS/localhost.
9. **Queue-less Incremental `git fetch` (`F-09` — BROKEN `503`):** `.refs` backfill never executes without `REPO_TASKS_QUEUE`.
10. **Queue-less / Free-Tier Compaction (`F-10` — BROKEN / STALLED):** Hangs `"queued"` or risks CPU Error `1102`.
11. **Real Homepage Repo Language/Topics & Neutral Branding (`F-11` — SIMULATED/HARDCODED):** Client regex guesses languages, injects `TypeScript`/`Python`, falls back to `"Vib Tools"`.
12. **Web Binary Upload, File Delete/Rename, Branch/Tag UI & Real Author Email (`F-12` — MISSING):** Only single-text upsert exists; commits use `${slug}@local.dev`.
13. **Global Toast System (`F-13` — MISSING):** Silent clipboard catches & `window.location.reload()` timers.
14. **PWA Support (`F-14` — MISSING):** No `manifest.webmanifest`, `sw.js`, or mobile install icons.
15. **Component-Only Flat Design (`--radius: 0rem`) (`F-15` — NON-COMPLIANT):** Rounded corners, shadows, incomplete font fallback stack, and raw element duplication in islands.
16. **`rawpath` Direct Tab Open (`F-16` — BROKEN):** Returns `403` without exact same-host `Referer`.
17. **Git Smart HTTP v0/v1 Clients (`F-17` — BROKEN `400`):** Rejected despite JSDoc claims.
18. **60+ Repo Admin Listing (`F-18` — INCOMPLETE):** Hardcodes `"main"` beyond #60 cold repos; uses standalone `getLimiter()`.
19. **Reliable Post-Push Sync (`F-19` — FRAGILE):** `waitUntil` swallows D1/KV errors leaving stale cache version keys.
20. **Deploy Secret Ordering & Hygiene (`F-20` — BUGGY):** Deploys Worker before uploading `SESSION_SECRET`; provisions 2 unused secrets.
21. **Format Check & Bundle Bloat (`F-21` — FAILING/BLOAT):** `npm run format:check` fails on checkout; `22` unreferenced `/public/assets/aistudio/` files ship to `dist/client`.

---

## 4. Phase Completion Status Tracker

- **Baseline (Frozen):** Complete (`21` pending items across Phases `01`–`05`).
- **Phase 01 (`F-01`–`F-08`):** Pending.
- **Phase 02 (`F-09`, `F-10`, `F-17`–`F-19`):** Pending.
- **Phase 03 (`F-11`, `F-12`, `F-16`):** Pending.
- **Phase 04 (`F-13`–`F-15`):** Pending.
- **Phase 05 (`F-20`, `F-21`):** Pending.
