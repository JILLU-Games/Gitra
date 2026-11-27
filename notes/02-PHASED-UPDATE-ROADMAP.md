# 02 · A–Z Phased Update Roadmap

All **21 verified findings (`F-01`–`F-21`)** are organized into **5 strict, non-overlapping sequential phases** so each phase completes cleanly, passes regression gates, and leaves unrelated modules untouched.

---

## Phase Sequence Overview

| Phase        | Focus Area                                                           | Findings Included                                              | Gate Command                                                                                                    |
| :----------- | :------------------------------------------------------------------- | :------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **Phase 01** | Regression Repair, Auth Separation, Primary-Admin & Session Security | `F-01`, `F-02`, `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08` | `npm run typecheck && npm run test && npm run test:auth && npm run test:workers`                                |
| **Phase 02** | Git Protocol, Ref Backfill, Compaction & Tier Reliability            | `F-09`, `F-10`, `F-17`, `F-18`, `F-19`                         | `npm run typecheck && npm run test && npm run test:workers`                                                     |
| **Phase 03** | Real Repo Metadata, Web Git Completeness & Raw Link Handling         | `F-11`, `F-12`, `F-16`                                         | `npm run typecheck && npm run test && npm run test:workers && npm run build`                                    |
| **Phase 04** | Global Component-Only UI (`--radius: 0rem`), Toast System & PWA      | `F-13`, `F-14`, `F-15`                                         | `npm run typecheck && npm run build && npm run test:workers` (+ headless browser check)                         |
| **Phase 05** | Auto-Deploy Secret Timing, Unused Artifacts & Prettier Cleanliness   | `F-20`, `F-21`                                                 | `node --test test/cf-auto-deploy.node-test.ts && npm run format:check && npm run build && npm run test:workers` |

---

## Detailed Step-by-Step Phase Plans

### Phase 01 — Regression Repair, Auth & Session Security

- **Findings:** `F-01`, `F-02`, `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08`
- **Why First:** Unblocks the currently failing `npm run test:workers` suite (`F-01`) and closes every Critical/High auth & setup lockout defect (`F-02`–`F-08`) before touching any feature or UI layer.
- **Exact Steps:**
  1. Fix `src/client/components/footer.tsx:110` to use `buildNamespaceProfileHref(viewer.primaryNamespaceSlug)` so `/admin` collision stops and `test/demo-user-mock-repo.worker.test.ts` turns green.
  2. Introduce a single canonical D1 primary-admin resolver (handling custom `/auth/setup` handles cleanly) and replace duplicated `buildLocalAccountSubject(resolveAdminAuthConfig(...).username)` checks across `session.ts`, `systemAdmin.ts`, `index.ts`, and `ui/overview.ts`.
  3. Make `/auth/setup` atomic via D1 batching (`F-04`).
  4. Unlock `/user/settings/security` password change & `/admin/users` modal for D1-claimed primary admin (`passwordManagedByEnv === false`), and fix `"ADMIN_PASSWORD set"` / `"(env)"` status text (`F-03`, `F-06`).
  5. Add session epoch / password-version validation in `session.ts` and bump it on password changes & admin resets (`F-05`).
  6. Add in-memory defense-in-depth + safer failure behavior in `rateLimit.ts` (`F-07`), and adaptive HTTPS/HTTP session cookies in `cookies.ts` (`F-08`).
- **Scope Lock Check:** No Git engine, homepage repo metadata, CSS theme, or deploy script edits allowed.

---

### Phase 02 — Git Protocol, Ref Backfill, Compaction & Tier Policy

- **Findings:** `F-09`, `F-10`, `F-17`, `F-18`, `F-19`
- **Why Second:** Stabilizes the core Cloudflare storage/queue engine across both `--no-queues`/Free Tier and Paid Tier once auth gates are verified green.
- **Exact Steps:**
  1. Add bounded inline `.refs` backfill fallback (or queue-free sidecar recovery) in `fetch/plan.ts` + `dispatch.ts` when `REPO_TASKS_QUEUE` is unbound (`F-09`).
  2. Prevent manual compaction `"queued"` deadlocks under `--no-queues` and Free Tier alarm re-arming, and protect Free Tier against CPU Error `1102` (`F-10`).
  3. Resolve `handleUploadPackPOST` protocol v0/v1 vs v2 contract & JSDoc alignment (`F-17`).
  4. Replace standalone `getLimiter()` and the silent 60-repo `"main"` overflow default in `systemAdmin.ts` (`F-18`).
  5. Harden post-push D1 `updatedAt` and KV/Cache invalidation in `git.ts` / `streamReceivePack.ts` (`F-19`).
- **Scope Lock Check:** No auth logic, React styling tokens, or deploy script edits allowed.

---

### Phase 03 — Real Repo Metadata, Web Git Completeness & Raw Link Guard

- **Findings:** `F-11`, `F-12`, `F-16`
- **Why Third:** Builds real repository data and web write capabilities on top of the stabilized Git/DO engine.
- **Exact Steps:**
  1. Remove regex-based language guessing and hardcoded `TypeScript`/`Python` filter fallbacks in `home-repos.tsx`; derive real server metadata; replace `"Vib Tools"` production defaults in `branding.ts` & `home-repos.tsx` (`F-11`).
  2. Add tree delete, rename/move, binary upload, and branch/tag UI management wired cleanly to DO/commit APIs; support configurable user commit email instead of `${slug}@local.dev` (`F-12`).
  3. Update `raw.ts` hotlink protection to handle `Sec-Fetch-Site` and forwarded host headers cleanly (`F-16`).
- **Scope Lock Check:** No global CSS/token refactor or PWA changes yet (handled holistically in Phase 04).

---

### Phase 04 — Global Component-Only UI System, Global Toast & PWA

- **Findings:** `F-13`, `F-14`, `F-15`
- **Why Fourth:** Applies visual design consistency, global Toast notifications, and PWA support across all completed pages and islands in one unified pass.
- **Exact Steps:**
  1. Implement global `<ToastProvider />` & unified notification helper; replace silent clipboard `catch {}` blocks and abrupt `window.location.reload()` timers (`F-13`).
  2. Enforce global UI rules in `src/client/styles/app.css` & `src/client/components/ui/*` (`--radius: 0rem`, exact Segoe/Helvetica font stack, no shadows, 1 border token, 2 accent tokens) and refactor islands to consume shared `ui/*` primitives cleanly (`F-15`).
  3. Add PWA `public/manifest.webmanifest`, app icons, offline navigation `public/sw.js`, and `<Document>`/`shell.ts` registration (`F-14`).
- **Scope Lock Check:** Zero backend API contract or Git engine modifications.

---

### Phase 05 — Auto-Deploy Secret Hygiene, Bundle Cleanup & Formatting

- **Findings:** `F-20`, `F-21`
- **Why Last:** Finalizes CI/CD deployment hygiene, secret lifecycle, and formatting once runtime & static assets (`public/`) are in final shape.
- **Exact Steps:**
  1. Remove unused `CREDENTIAL_SECRET` & `ADMIN_BOOTSTRAP_SECRET` from `scripts/cf-auto-deploy-lib.mjs` (updating `test/cf-auto-deploy.node-test.ts`), and move secret reconciliation prior to initial `wrangler deploy` (`F-20`).
  2. Delete the 22 unreferenced files under `public/assets/aistudio/` so they are omitted from `dist/client`, format `wrangler.paid.jsonc`, and enforce passing `npm run format:check` (`F-21`).
- **Final Release Verification:** Run `npm run typecheck && npm run format:check && npm run test && node --test test/cf-auto-deploy.node-test.ts && npm run build && npm run test:workers`.
