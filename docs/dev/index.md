---
title: Gitra Developer Guide
description: Architecture, codebase map, API reference, database schema, security architecture, build pipeline, and testing guide for Gitra contributors.
version: "0.1.0"
category: Core Infrastructure
order: 0
draft: false
---

# Gitra Developer Guide

This section documents Gitra's internal architecture, runtime invariants, API contracts, storage schemas, security primitives, and testing workflows—verified directly against the source tree.

---

## Contents

| Guide                                               | Topics Covered                                                                                                                                 |
| :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Architecture](./architecture.md)**               | Hono + React 19 SSR Worker, single-hop boundary rules, `RepoDurableObject`, R2 pack data plane, caching, and Mermaid diagrams                  |
| **[Codebase Structure](./codebase-structure.md)**   | Directory layout across `src/worker/`, `src/client/`, `src/shared/`, `scripts/`, `drizzle/`, and `test/`                                       |
| **[Local Setup](./local-setup.md)**                 | Running `vite dev` with `@cloudflare/vite-plugin`, Drizzle migrations, `cf-typegen`, and formatting                                            |
| **[API Reference](./api-reference.md)**             | Exhaustive catalog of every Git Smart HTTP, Web UI, Auth, Repo Admin, and Site Admin route and Zod schema                                      |
| **[Database Schema](./database-schema.md)**         | All 11 D1 SQLite tables, Repo DO `pack_catalog`, KV key namespaces, R2 object paths, and ER diagram                                            |
| **[Security Architecture](./security.md)**          | AES-256-GCM cookies, PBKDF2-SHA256 passwords, PAT hashing & live role checks, CSRF origin validation, rate limiting, and XSS/rawpath hardening |
| **[Building & Packaging](./building-packaging.md)** | Vite SSR/client build, `ASSETS` manifest, Free vs Paid Wrangler manifests, and zero-touch auto-deploy packaging                                |
| **[Testing Guide](./testing.md)**                   | Node Vitest unit tests, `node:test` deploy/tier suites, Cloudflare Worker pool tests, and opt-in 42 MiB pack fixture                           |
| **[Contributing](./contributing.md)**               | Strict engineering invariants (single-hop boundaries, DAL-only SQLite, `Limiter` discipline, validation matrix)                                |
| **[Technical Reference](./reference/index.md)**     | Exhaustive environment variables, Wrangler bindings, CLI flags, audited dependencies, and glossary                                             |

---

## Looking for End-User & Self-Hosting Guides?

For getting started, zero-touch Cloudflare deployment, Git CLI workflows, RBAC, and live branding settings, visit the [Gitra User Guide](https://docs.vib.tools/gitra/).
