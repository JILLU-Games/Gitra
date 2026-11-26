## Summary

<!-- Briefly describe what problem this pull request solves and how it is implemented in Gitra. -->

## Related Issue(s)

<!-- Link any related issue, e.g., Closes #123 -->

## Subsystem(s) Touched

- [ ] Git Smart HTTP v2 / Pack Engine (`src/worker/git/*`, `src/worker/routes/git.ts`)
- [ ] Repo Durable Object / SQLite DAL (`src/worker/do/repo/*`)
- [ ] Cloudflare D1 / Auth / RBAC / PATs (`src/worker/db/d1/*`, `src/worker/auth/*`)
- [ ] Cloudflare Tier Policy / Queue Fallback / Auto-Deploy (`src/worker/common/tier.ts`, `src/worker/tasks/*`, `scripts/*`)
- [ ] Web UI SSR Pages / Client Islands / Footer (`src/client/*`, `src/worker/routes/ui/*`)
- [ ] Site Administration / Branding Studio / User Settings (`/admin/*`, `/user/*`)
- [ ] Documentation / Tests (`docs/*`, `test/*`, `*.md`)

## Architectural & Quality Checklist (`AGENTS.md`)

- [ ] **Single-Hop Boundaries:** No transitive `Workers -> DO -> R2` chains or distributed transactions across DO and D1.
- [ ] **DAL Discipline:** All SQLite/D1 queries go through `src/worker/do/repo/db/dal.ts` or `src/worker/db/d1/dal/*`.
- [ ] **Platform Limiter:** Request-scoped R2 and outbound DO calls use `limiter.run(label, fn)`.
- [ ] **Free & Paid Compatibility:** Optional Queue calls use `src/worker/tasks/dispatch.ts`, and `wrangler.jsonc` contains no hardcoded production IDs or domains.
- [ ] **Strict TypeScript:** Zero `as any` casts or duplicated helper types; `npm run typecheck` passes.
- [ ] **Formatting:** `npm run format:check` passes cleanly.
- [ ] **Tests:** Unit tests (`npm run test`), tier/auto-deploy tests, and relevant Worker integration tests pass.

## Verification Commands Run

```bash
npm run format:check
npm run typecheck
npm run test
npx tsx --test test/cloudflare-tier.node-test.ts test/cf-auto-deploy.node-test.ts
```
