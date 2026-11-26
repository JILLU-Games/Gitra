---
name: "Feature Request"
about: "Propose a focused improvement or practical feature for Gitra"
title: "[Feature]: "
labels: ["enhancement"]
assignees: []
---

## Problem or Workflow Need

<!-- What real developer or self-hosting workflow problem does this solve? -->

## Proposed Solution

<!-- Describe the desired behavior, route, UI, or CLI interaction clearly. -->

## Scope & Architectural Fit

<!-- How does this fit within Gitra's Cloudflare Workers + Durable Objects + R2 + D1 architecture? -->

- [ ] Respects single-hop boundary rules (`Workers -> DO`, `Workers -> R2`, `Workers -> D1`)
- [ ] Works cleanly on both Cloudflare Free (`CLOUDFLARE_TIER=free`) and Paid (`CLOUDFLARE_TIER=paid`) plans
- [ ] Uses existing DAL layers (`src/worker/do/repo/db/dal.ts` / `src/worker/db/d1/dal/*`)
- [ ] Fits SSR + focused Client Islands UI architecture

## Alternatives Considered

<!-- Any workarounds or alternative approaches you evaluated? -->
