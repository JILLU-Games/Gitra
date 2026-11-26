import type { Db } from "@/worker/db/d1/client";
import type { Logger } from "@/worker/common/logger";
import type { Limiter } from "@/worker/git/operations/limits";
import type { GitObjectType } from "@/worker/git/core/objects";

import { getRepoStub, hexToBytes, newPrefixedId, zeroOid } from "@/worker/common";
import {
  claimNamespace,
  findNamespaceBySlug,
  findUserBySubject,
  insertMembershipIfMissing,
  insertRepositoryIfNew,
  insertUserIfNew,
  listRepositoriesForNamespace,
  listRepositoriesForUser,
  upsertNamespaceDirectoryMeta,
  upsertNamespaceProfileMeta,
  upsertRepositoryMeta,
} from "@/worker/db/d1/dal";
import {
  buildLocalAccountSubject,
  DEFAULT_DEMO_USER_DISPLAY_NAME,
  DEFAULT_DEMO_USER_PASSWORD,
  DEFAULT_DEMO_USER_USERNAME,
} from "@/worker/auth/adminAuth";
import { hashPassword } from "@/worker/auth/passwords";
import { generateNamespaceId, generateUserId } from "@/worker/auth/session";
import { concatChunks } from "@/worker/git";
import { createGitObject } from "@/worker/git/core/objects";
import { buildPackV2 } from "@/worker/git/pack/build";
import { resolveDeltasAndWriteIdx, scanPack } from "@/worker/git/pack/indexer";
import { doPrefix, r2PackKey } from "@/worker/keys";
import { putRouteCacheRecord } from "@/worker/repositories/routeCache";

/**
 * Seeds starter Git repositories and a Dev Mode test user (`@alex-dev`) with
 * a complete GitHub-ready mock project structure when Live Preview / Demo Mode
 * is active.
 *
 * Each seeded repository receives a genuine Git packfile (.pack + .idx) in R2
 * committed through the standard single-hop Worker -> R2 + Worker -> DO
 * `beginReceive` / `finalizeReceive` flow so every page (Overview, Tree, Blob,
 * Commits, Commit Diff, Repo Admin) displays live repository data immediately.
 */

type SeedFileSpec = {
  path: string;
  content: string;
};

type SeedCommitSpec = {
  message: string;
  timestampSec: number;
  files: SeedFileSpec[];
};

type SeedRepoSpec = {
  slug: string;
  visibility: "public" | "private";
  description?: string;
  pinned?: boolean;
  homePinned?: boolean;
  commits: SeedCommitSpec[];
};

type PackObjectInput = {
  type: GitObjectType;
  payload: Uint8Array;
};

const textEncoder = new TextEncoder();

const DEMO_REPOSITORIES: readonly SeedRepoSpec[] = [
  {
    slug: "edge-starter",
    visibility: "public",
    description: "Minimal Cloudflare Worker starter hosted on git-on-cloudflare.",
    commits: [
      {
        message: "Initial scaffold for edge worker\n",
        timestampSec: 1763600000,
        files: [
          {
            path: "README.md",
            content: [
              "# edge-starter",
              "",
              "Minimal Cloudflare Worker template hosted directly on **git-on-cloudflare**.",
              "",
              "## Quick start",
              "",
              "```bash",
              "npm install",
              "npm run dev",
              "```",
              "",
            ].join("\n"),
          },
          {
            path: "wrangler.jsonc",
            content: [
              "{",
              '  "name": "edge-starter",',
              '  "main": "src/index.ts",',
              '  "compatibility_date": "2026-05-13"',
              "}",
              "",
            ].join("\n"),
          },
        ],
      },
      {
        message: "Add health endpoint and structured request logger\n",
        timestampSec: 1763686400,
        files: [
          {
            path: "README.md",
            content: [
              "# edge-starter",
              "",
              "Minimal Cloudflare Worker template hosted directly on **git-on-cloudflare**.",
              "",
              "## Endpoints",
              "",
              "- `GET /` — Returns service metadata",
              "- `GET /health` — Lightweight edge health check",
              "",
              "## Quick start",
              "",
              "```bash",
              "npm install",
              "npm run dev",
              "```",
              "",
            ].join("\n"),
          },
          {
            path: "wrangler.jsonc",
            content: [
              "{",
              '  "name": "edge-starter",',
              '  "main": "src/index.ts",',
              '  "compatibility_date": "2026-05-13"',
              "}",
              "",
            ].join("\n"),
          },
          {
            path: "src/index.ts",
            content: [
              "export interface Env {",
              "  LOG_LEVEL?: string;",
              "}",
              "",
              "export default {",
              "  async fetch(request: Request): Promise<Response> {",
              "    const url = new URL(request.url);",
              '    if (url.pathname === "/health") {',
              '      return Response.json({ status: "ok", timestamp: Date.now() });',
              "    }",
              "    return Response.json({",
              '      service: "edge-starter",',
              "      path: url.pathname,",
              "    });",
              "  },",
              "};",
              "",
            ].join("\n"),
          },
        ],
      },
    ],
  },
  {
    slug: "infra-notes",
    visibility: "private",
    description: "Private operational runbook for pack compaction and PAT rotation.",
    commits: [
      {
        message: "Document edge forge operations runbook\n",
        timestampSec: 1763690000,
        files: [
          {
            path: "README.md",
            content: [
              "# infra-notes",
              "",
              "Private operational notes for maintaining edge repositories, pack compaction, and access tokens.",
              "",
              "- See `runbook.md` for routine maintenance checklists.",
              "",
            ].join("\n"),
          },
          {
            path: "runbook.md",
            content: [
              "# Operations Runbook",
              "",
              "## Pack Compaction",
              "",
              "1. Open the repository Admin tab.",
              "2. Run a compaction dry-run to inspect active pack tiers.",
              "3. Queue compaction when tier-0 receive packs accumulate.",
              "",
              "## Access Tokens",
              "",
              "Create scoped Personal Access Tokens from the Account dashboard before pushing over Git Smart HTTP.",
              "",
            ].join("\n"),
          },
        ],
      },
    ],
  },
];

const MOCK_PROJECT_CONFIG_FILES: readonly SeedFileSpec[] = [
  {
    path: ".github/workflows/ci.yml",
    content: [
      "name: CI",
      "",
      "on:",
      "  push:",
      "    branches: [main]",
      "  pull_request:",
      "    branches: [main]",
      "",
      "jobs:",
      "  verify:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: 22",
      "          cache: npm",
      "      - run: npm ci",
      "      - run: npm run typecheck",
      "      - run: npm test",
      "",
    ].join("\n"),
  },
  {
    path: ".gitignore",
    content: [
      "# Dependencies & build output",
      "node_modules/",
      "dist/",
      ".wrangler/",
      "coverage/",
      "",
      "# Local environment secrets",
      ".dev.vars",
      ".env.local",
      "*.log",
      "",
    ].join("\n"),
  },
  {
    path: "LICENSE",
    content: [
      "MIT License",
      "",
      "Copyright (c) 2026 Alex Rivera",
      "",
      "Permission is hereby granted, free of charge, to any person obtaining a copy",
      'of this software and associated documentation files (the "Software"), to deal',
      "in the Software without restriction, including without limitation the rights",
      "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
      "copies of the Software, and to permit persons to whom the Software is",
      "furnished to do so, subject to the following conditions:",
      "",
      "The above copyright notice and this permission notice shall be included in all",
      "copies or substantial portions of the Software.",
      "",
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
      "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
      "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
      "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
      "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
      "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
      "SOFTWARE.",
      "",
    ].join("\n"),
  },
  {
    path: "package.json",
    content: [
      "{",
      '  "name": "@alex-dev/cloud-forge-kit",',
      '  "version": "1.2.0",',
      '  "description": "Edge-native TypeScript API & router kit for Cloudflare Workers",',
      '  "type": "module",',
      '  "license": "MIT",',
      '  "scripts": {',
      '    "dev": "wrangler dev",',
      '    "typecheck": "tsc --noEmit",',
      '    "test": "vitest run",',
      '    "deploy": "wrangler deploy"',
      "  },",
      '  "devDependencies": {',
      '    "typescript": "^5.8.0",',
      '    "vitest": "^3.1.0",',
      '    "wrangler": "^4.0.0"',
      "  }",
      "}",
      "",
    ].join("\n"),
  },
  {
    path: "tsconfig.json",
    content: [
      "{",
      '  "compilerOptions": {',
      '    "target": "ES2022",',
      '    "module": "ESNext",',
      '    "moduleResolution": "Bundler",',
      '    "strict": true,',
      '    "noEmit": true,',
      '    "types": ["@cloudflare/workers-types"]',
      "  },",
      '  "include": ["src/**/*.ts", "test/**/*.ts"]',
      "}",
      "",
    ].join("\n"),
  },
  {
    path: "wrangler.jsonc",
    content: [
      "{",
      '  "name": "cloud-forge-kit",',
      '  "main": "src/index.ts",',
      '  "compatibility_date": "2026-05-13",',
      '  "observability": {',
      '    "enabled": true',
      "  }",
      "}",
      "",
    ].join("\n"),
  },
];

const MOCK_PROJECT_SOURCE_FILES: readonly SeedFileSpec[] = [
  {
    path: "src/index.ts",
    content: [
      'import { verifyBearerToken } from "./middleware/auth";',
      'import { createRouter } from "./router";',
      'import { withEdgeCache } from "./utils/cache";',
      "",
      "export interface Env {",
      "  API_TOKEN_SECRET?: string;",
      "  ENVIRONMENT?: string;",
      "}",
      "",
      "const router = createRouter();",
      "",
      'router.get("/", async () =>',
      "  Response.json({",
      '    service: "cloud-forge-kit",',
      '    version: "1.2.0",',
      '    status: "operational",',
      "  })",
      ");",
      "",
      'router.get("/health", async () =>',
      "  Response.json({",
      "    ok: true,",
      "    timestamp: new Date().toISOString(),",
      "  })",
      ");",
      "",
      'router.get("/v1/projects", async (request, env) =>',
      "  withEdgeCache(request, 60, async () => {",
      "    const auth = await verifyBearerToken(request, env.API_TOKEN_SECRET);",
      "    if (!auth.ok) {",
      '      return Response.json({ error: "Unauthorized" }, { status: 401 });',
      "    }",
      "    return Response.json({",
      "      actor: auth.subject,",
      "      projects: [",
      '        { id: "prj_edge_01", slug: "cloud-forge-kit", visibility: "public" },',
      '        { id: "prj_edge_02", slug: "worker-metrics", visibility: "private" },',
      "      ],",
      "    });",
      "  })",
      ");",
      "",
      "export default {",
      "  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {",
      "    return router.handle(request, env, ctx);",
      "  },",
      "};",
      "",
    ].join("\n"),
  },
  {
    path: "src/router.ts",
    content: [
      "export type RouteHandler<E = unknown> = (",
      "  request: Request,",
      "  env: E,",
      "  ctx: ExecutionContext",
      ") => Promise<Response> | Response;",
      "",
      "type RouteEntry<E> = {",
      "  method: string;",
      "  path: string;",
      "  handler: RouteHandler<E>;",
      "};",
      "",
      "export function createRouter<E = unknown>() {",
      "  const routes: RouteEntry<E>[] = [];",
      "",
      "  return {",
      "    get(path: string, handler: RouteHandler<E>) {",
      '      routes.push({ method: "GET", path, handler });',
      "    },",
      "    post(path: string, handler: RouteHandler<E>) {",
      '      routes.push({ method: "POST", path, handler });',
      "    },",
      "    async handle(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {",
      "      const { pathname } = new URL(request.url);",
      "      const match = routes.find(",
      "        (entry) => entry.method === request.method && entry.path === pathname",
      "      );",
      "      if (!match) {",
      '        return Response.json({ error: "Not Found", path: pathname }, { status: 404 });',
      "      }",
      "      return await match.handler(request, env, ctx);",
      "    },",
      "  };",
      "}",
      "",
    ].join("\n"),
  },
  {
    path: "src/middleware/auth.ts",
    content: [
      "export type AuthVerification =",
      "  | { ok: true; subject: string }",
      '  | { ok: false; reason: "missing-token" | "invalid-token" };',
      "",
      "export async function verifyBearerToken(",
      "  request: Request,",
      "  expectedSecret?: string",
      "): Promise<AuthVerification> {",
      '  const header = request.headers.get("Authorization")?.trim() ?? "";',
      '  if (!header.startsWith("Bearer ")) {',
      '    return { ok: false, reason: "missing-token" };',
      "  }",
      '  const token = header.slice("Bearer ".length).trim();',
      "  if (!token || (expectedSecret && token !== expectedSecret)) {",
      '    return { ok: false, reason: "invalid-token" };',
      "  }",
      '  return { ok: true, subject: "alex-dev" };',
      "}",
      "",
    ].join("\n"),
  },
  {
    path: "src/utils/cache.ts",
    content: [
      "export async function withEdgeCache(",
      "  request: Request,",
      "  ttlSeconds: number,",
      "  compute: () => Promise<Response>",
      "): Promise<Response> {",
      "  const response = await compute();",
      '  if (!response.ok || request.headers.has("Authorization")) {',
      "    return response;",
      "  }",
      "  const headers = new Headers(response.headers);",
      '  headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);',
      "  return new Response(response.body, {",
      "    status: response.status,",
      "    headers,",
      "  });",
      "}",
      "",
    ].join("\n"),
  },
  {
    path: "test/router.test.ts",
    content: [
      'import { describe, expect, it } from "vitest";',
      'import { createRouter } from "../src/router";',
      "",
      'describe("createRouter", () => {',
      '  it("matches GET routes and returns 404 for unknown paths", async () => {',
      "    const router = createRouter();",
      '    router.get("/health", () => Response.json({ ok: true }));',
      "",
      '    const okRes = await router.handle(new Request("https://example.com/health"), {}, {} as ExecutionContext);',
      "    expect(okRes.status).toBe(200);",
      "    expect(await okRes.json()).toEqual({ ok: true });",
      "",
      '    const missRes = await router.handle(new Request("https://example.com/missing"), {}, {} as ExecutionContext);',
      "    expect(missRes.status).toBe(404);",
      "  });",
      "});",
      "",
    ].join("\n"),
  },
];

const MOCK_PROJECT_DOCS_FILES: readonly SeedFileSpec[] = [
  {
    path: "README.md",
    content: [
      "# cloud-forge-kit",
      "",
      "> Zero-dependency TypeScript starter kit for building authenticated edge APIs on Cloudflare Workers.",
      "",
      "## Features",
      "",
      "- **Typed Edge Router** — Lightweight request matching without external router bloat (`src/router.ts`).",
      "- **Bearer Auth Middleware** — Constant-time header validation ready for PAT or HMAC tokens (`src/middleware/auth.ts`).",
      "- **Smart Cache Helper** — Auth-aware `Cache-Control` wrapper preventing accidental private response caching (`src/utils/cache.ts`).",
      "- **GitHub-Ready CI & Docs** — Automated GitHub Actions workflow, architecture guide, API reference, changelog, and MIT license.",
      "",
      "## Project Structure",
      "",
      "```text",
      "cloud-forge-kit/",
      "├── .github/workflows/ci.yml   # Typecheck & Vitest CI pipeline",
      "├── docs/",
      "│   ├── api-reference.md       # HTTP endpoints & JSON payloads",
      "│   └── architecture.md        # Request flow & caching boundaries",
      "├── src/",
      "│   ├── middleware/auth.ts     # Bearer token verification",
      "│   ├── utils/cache.ts         # Public vs authenticated response cache",
      "│   ├── index.ts               # Worker entrypoint",
      "│   └── router.ts              # Typed route table",
      "├── test/router.test.ts        # Unit test coverage",
      "├── CHANGELOG.md               # Version release notes",
      "├── CONTRIBUTING.md            # Contributor guidelines",
      "├── LICENSE                    # MIT license",
      "├── package.json",
      "├── tsconfig.json",
      "└── wrangler.jsonc",
      "```",
      "",
      "## Quick Start",
      "",
      "```bash",
      "git clone https://example.com/alex-dev/cloud-forge-kit.git",
      "cd cloud-forge-kit",
      "npm install",
      "npm run dev",
      "```",
      "",
      "### Verify Endpoints",
      "",
      "```bash",
      "# Public metadata",
      "curl -s https://example.com/ | jq",
      "",
      "# Authenticated projects list",
      'curl -s -H "Authorization: Bearer dev-secret" https://example.com/v1/projects | jq',
      "```",
      "",
      "## Scripts & Tooling",
      "",
      "| Command | Purpose | Target |",
      "| --- | --- | --- |",
      "| `npm run dev` | Start local Wrangler Worker server | `src/index.ts` |",
      "| `npm run typecheck` | Run strict TypeScript checking | `tsconfig.json` |",
      "| `npm test` | Execute Vitest unit suite | `test/router.test.ts` |",
      "| `npm run deploy` | Publish Worker to Cloudflare | `wrangler.jsonc` |",
      "",
      "## Documentation",
      "",
      "- [Architecture Overview](docs/architecture.md)",
      "- [API Reference](docs/api-reference.md)",
      "- [Contributing Guide](CONTRIBUTING.md)",
      "- [Changelog](CHANGELOG.md)",
      "",
      "## License",
      "",
      "Released under the [MIT License](LICENSE).",
      "",
    ].join("\n"),
  },
  {
    path: "CONTRIBUTING.md",
    content: [
      "# Contributing to cloud-forge-kit",
      "",
      "Thanks for helping improve **cloud-forge-kit**! Follow this checklist before opening a pull request.",
      "",
      "## Workflow",
      "",
      "1. Branch from `main` using a descriptive prefix (`feat/...`, `fix/...`, or `docs/...`).",
      "2. Keep changes focused and modular inside `src/` and `test/`.",
      "3. Update `docs/` and `CHANGELOG.md` whenever public API routes or behavior change.",
      "",
      "## Pre-Flight Checks",
      "",
      "```bash",
      "npm run typecheck",
      "npm test",
      "```",
      "",
      "## Pull Request Checklist",
      "",
      "- [x] Strict TypeScript passes without `any` casts",
      "- [x] Unit tests cover new router or middleware branches",
      "- [x] README or docs updated for user-facing changes",
      "",
    ].join("\n"),
  },
  {
    path: "CHANGELOG.md",
    content: [
      "# Changelog",
      "",
      "All notable changes to **cloud-forge-kit** are documented in this file.",
      "",
      "## [1.2.0] - 2026-11-20",
      "",
      "### Added",
      "- Added `withEdgeCache` helper that bypasses public caching on authenticated requests.",
      "- Added `docs/architecture.md` and `docs/api-reference.md` documentation pages.",
      "",
      "## [1.1.0] - 2026-11-12",
      "",
      "### Added",
      "- Introduced `verifyBearerToken` middleware under `src/middleware/auth.ts`.",
      "- Added Vitest router unit suite (`test/router.test.ts`).",
      "",
      "## [1.0.0] - 2026-11-01",
      "",
      "### Added",
      "- Initial Worker scaffold, `tsconfig.json`, MIT `LICENSE`, and GitHub Actions CI workflow.",
      "",
    ].join("\n"),
  },
  {
    path: "docs/architecture.md",
    content: [
      "# Architecture Overview",
      "",
      "`cloud-forge-kit` separates routing, authentication, and caching into small composable modules.",
      "",
      "## Request Lifecycle",
      "",
      "```text",
      "Client Request",
      "   │",
      "   ▼",
      "src/index.ts ──▶ src/router.ts",
      "                     │",
      "                     ├──▶ GET /health        (public, instant JSON)",
      "                     └──▶ GET /v1/projects   ──▶ auth.ts ──▶ cache.ts",
      "```",
      "",
      "## Design Invariants",
      "",
      "1. **No shared mutable global state** across requests inside Workers isolates.",
      "2. **Auth-before-cache** ensures `Authorization` requests never receive stale public payloads.",
      "3. **Strict TypeScript** (`strict: true`) keeps route contracts explicit.",
      "",
    ].join("\n"),
  },
  {
    path: "docs/api-reference.md",
    content: [
      "# API Reference",
      "",
      "## Endpoints",
      "",
      "| Method | Path | Auth | Description |",
      "| --- | --- | --- | --- |",
      "| `GET` | `/` | None | Service metadata and active version |",
      "| `GET` | `/health` | None | Health probe returning ISO timestamp |",
      "| `GET` | `/v1/projects` | Bearer Token | Lists visible workspace projects |",
      "",
      "## Example Responses",
      "",
      "### `GET /v1/projects` (`200 OK`)",
      "",
      "```json",
      "{",
      '  "actor": "alex-dev",',
      '  "projects": [',
      '    { "id": "prj_edge_01", "slug": "cloud-forge-kit", "visibility": "public" }',
      "  ]",
      "}",
      "```",
      "",
      "### Missing Token (`401 Unauthorized`)",
      "",
      "```json",
      '{ "error": "Unauthorized" }',
      "```",
      "",
    ].join("\n"),
  },
];

const DEMO_TEST_USER_REPOSITORIES: readonly SeedRepoSpec[] = [
  {
    slug: "cloud-forge-kit",
    visibility: "public",
    description:
      "GitHub-ready TypeScript Worker starter kit with CI workflow, architecture docs, middleware, and tests.",
    pinned: true,
    homePinned: true,
    commits: [
      {
        message: "chore: initialize package config, CI workflow, and MIT license\n",
        timestampSec: 1763610000,
        files: [...MOCK_PROJECT_CONFIG_FILES],
      },
      {
        message: "feat: implement typed router, bearer auth middleware, cache helper, and tests\n",
        timestampSec: 1763650000,
        files: [...MOCK_PROJECT_CONFIG_FILES, ...MOCK_PROJECT_SOURCE_FILES],
      },
      {
        message:
          "docs: add GitHub-ready README, contributing guide, changelog, and architecture docs\n",
        timestampSec: 1763695000,
        files: [
          ...MOCK_PROJECT_CONFIG_FILES,
          ...MOCK_PROJECT_SOURCE_FILES,
          ...MOCK_PROJECT_DOCS_FILES,
        ],
      },
    ],
  },
  {
    slug: ".vibtools",
    visibility: "public",
    description: "Developer profile repository rendered on /alex-dev.",
    pinned: false,
    commits: [
      {
        message: "docs: initialize @alex-dev profile README\n",
        timestampSec: 1763696000,
        files: [
          {
            path: "profile/README.md",
            content: [
              "# Hi, I'm Alex Rivera (`@alex-dev`)",
              "",
              "Edge systems developer experimenting with TypeScript APIs, Git internals, and Cloudflare Workers.",
              "",
              "### Featured Project",
              "",
              "- **[`alex-dev/cloud-forge-kit`](/alex-dev/cloud-forge-kit)** — Full GitHub-ready starter repository with CI, docs, TypeScript router, and tests.",
              "",
              "### Focus Areas",
              "",
              "- **Runtime:** Cloudflare Workers, D1, R2 object storage, Durable Objects",
              "- **Tooling:** TypeScript, Vitest, Git Smart HTTP v2",
              "",
            ].join("\n"),
          },
        ],
      },
    ],
  },
];

type TreeNode = {
  files: Map<string, string>;
  dirs: Map<string, TreeNode>;
};

function createTreeNode(): TreeNode {
  return { files: new Map(), dirs: new Map() };
}

function encodeTreePayload(
  entries: Array<{ mode: string; name: string; oid: string }>
): Uint8Array {
  // Git sorts tree entries by byte order, treating directories as having a trailing `/`.
  const sorted = [...entries].sort((a, b) => {
    const aKey = a.mode === "40000" ? `${a.name}/` : a.name;
    const bKey = b.mode === "40000" ? `${b.name}/` : b.name;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  const chunks: Uint8Array[] = [];
  for (const entry of sorted) {
    chunks.push(textEncoder.encode(`${entry.mode} ${entry.name}\0`));
    chunks.push(hexToBytes(entry.oid));
  }
  return concatChunks(chunks);
}

async function encodeDirectoryTree(
  node: TreeNode,
  objectsByOid: Map<string, PackObjectInput>
): Promise<string> {
  const entries: Array<{ mode: string; name: string; oid: string }> = [];

  for (const [name, content] of node.files) {
    const payload = textEncoder.encode(content);
    const { oid } = await createGitObject("blob", payload);
    if (!objectsByOid.has(oid)) {
      objectsByOid.set(oid, { type: "blob", payload });
    }
    entries.push({ mode: "100644", name, oid });
  }

  for (const [dirName, childNode] of node.dirs) {
    const dirOid = await encodeDirectoryTree(childNode, objectsByOid);
    entries.push({ mode: "40000", name: dirName, oid: dirOid });
  }

  const treePayload = encodeTreePayload(entries);
  const { oid } = await createGitObject("tree", treePayload);
  if (!objectsByOid.has(oid)) {
    objectsByOid.set(oid, { type: "tree", payload: treePayload });
  }
  return oid;
}

async function buildRepoPackObjects(
  commits: readonly SeedCommitSpec[],
  authorName: string,
  authorEmail: string
): Promise<{
  objects: PackObjectInput[];
  headCommitOid: string;
}> {
  const objectsByOid = new Map<string, PackObjectInput>();
  let parentOid: string | null = null;

  for (const commit of commits) {
    const root = createTreeNode();
    for (const file of commit.files) {
      const parts = file.path.split("/").filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) continue;
      let cursor = root;
      for (const part of parts) {
        let next = cursor.dirs.get(part);
        if (!next) {
          next = createTreeNode();
          cursor.dirs.set(part, next);
        }
        cursor = next;
      }
      cursor.files.set(fileName, file.content);
    }

    const treeOid = await encodeDirectoryTree(root, objectsByOid);
    const ident = `${authorName} <${authorEmail}> ${commit.timestampSec} +0000`;
    const lines = [`tree ${treeOid}`];
    if (parentOid) {
      lines.push(`parent ${parentOid}`);
    }
    lines.push(`author ${ident}`, `committer ${ident}`, "", commit.message);
    const commitPayload = textEncoder.encode(lines.join("\n"));
    const { oid: commitOid } = await createGitObject("commit", commitPayload);
    if (!objectsByOid.has(commitOid)) {
      objectsByOid.set(commitOid, { type: "commit", payload: commitPayload });
    }
    parentOid = commitOid;
  }

  if (!parentOid) {
    throw new Error("Demo repository specification must contain at least one commit");
  }

  return {
    objects: Array.from(objectsByOid.values()),
    headCommitOid: parentOid,
  };
}

async function seedSingleDemoRepository(args: {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  userId: string;
  namespaceId: string;
  namespaceSlug: string;
  authorName: string;
  authorEmail: string;
  spec: SeedRepoSpec;
  now: number;
}): Promise<void> {
  const repositoryId = newPrefixedId("repo");
  const doName = `repo:${repositoryId.slice("repo_".length)}`;

  const inserted = await insertRepositoryIfNew(args.db, {
    id: repositoryId,
    namespaceId: args.namespaceId,
    createdBy: args.userId,
    slug: args.spec.slug,
    doName,
    visibility: args.spec.visibility,
    createdAt: args.now,
    updatedAt: args.now,
  });
  if (!inserted) return;

  if (args.spec.description || args.spec.pinned || args.spec.homePinned) {
    await upsertRepositoryMeta(args.env.DB, inserted.id, {
      description: args.spec.description,
      pinned: args.spec.pinned,
      homePinned: args.spec.homePinned,
      now: args.now,
    });
  }

  await putRouteCacheRecord(args.env, args.namespaceSlug, args.spec.slug, {
    repositoryId: inserted.id,
    namespaceId: args.namespaceId,
    doName: inserted.doName,
    updatedAt: args.now,
  });

  const stub = getRepoStub(args.env, inserted.doName);
  const leaseResult = await args.limiter.run(
    "do:demo-begin-receive",
    async () => await stub.beginReceive()
  );
  if (!leaseResult.ok) {
    args.log.warn("demo-seed:lease-busy", { slug: args.spec.slug });
    return;
  }

  const token = leaseResult.lease.token;
  try {
    const { objects, headCommitOid } = await buildRepoPackObjects(
      args.spec.commits,
      args.authorName,
      args.authorEmail
    );
    const packData = await buildPackV2(objects);
    const packKey = r2PackKey(doPrefix(stub.id.toString()), `pack-demo-${args.now}.pack`);

    await args.limiter.run("r2:demo-put-pack", () => args.env.REPO_BUCKET.put(packKey, packData));

    const scanResult = await scanPack({
      env: args.env,
      packKey,
      packSize: packData.byteLength,
      limiter: args.limiter,
      countSubrequest: () => {},
      log: args.log,
    });
    const resolveResult = await resolveDeltasAndWriteIdx({
      env: args.env,
      packKey,
      packSize: packData.byteLength,
      limiter: args.limiter,
      countSubrequest: () => {},
      log: args.log,
      scanResult,
      repoId: inserted.doName,
    });

    const finalized = await args.limiter.run(
      "do:demo-finalize-receive",
      async () =>
        await stub.finalizeReceive({
          token,
          commands: [{ oldOid: zeroOid(), newOid: headCommitOid, ref: "refs/heads/main" }],
          stagedPack: {
            packKey,
            packBytes: packData.byteLength,
            idxBytes: resolveResult.idxBytes,
            objectCount: resolveResult.objectCount,
          },
        })
    );

    if (finalized.status !== "committed") {
      args.log.warn("demo-seed:finalize-non-committed", {
        slug: args.spec.slug,
        status: finalized.status,
      });
    } else {
      args.log.info("demo-seed:repo-ready", {
        namespaceSlug: args.namespaceSlug,
        slug: args.spec.slug,
        visibility: args.spec.visibility,
        objects: resolveResult.objectCount,
      });
    }
  } catch (error) {
    args.log.warn("demo-seed:pack-init-failed", {
      slug: args.spec.slug,
      error: String(error),
    });
    await args.limiter
      .run("do:demo-abort-receive", async () => await stub.abortReceive(token))
      .catch(() => {});
  }
}

export async function ensureDemoRepositoriesSeeded(args: {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  userId: string;
  namespaceId: string;
  namespaceSlug: string;
  now: number;
}): Promise<void> {
  const existing = await listRepositoriesForUser(args.db, args.userId);
  if (existing.length > 0) return;

  for (const spec of DEMO_REPOSITORIES) {
    await seedSingleDemoRepository({
      env: args.env,
      db: args.db,
      limiter: args.limiter,
      log: args.log,
      userId: args.userId,
      namespaceId: args.namespaceId,
      namespaceSlug: args.namespaceSlug,
      authorName: "Administrator",
      authorEmail: "admin@local.dev",
      spec,
      now: args.now,
    });
  }
}

/**
 * Ensures the Dev Mode non-admin test user (`@alex-dev`, role `member`) and
 * their GitHub-ready mock project repository (`alex-dev/cloud-forge-kit` +
 * `alex-dev/.vibtools`) exist so developers can inspect both the Users Panel
 * and a multi-folder Git repository structure immediately.
 */
export async function ensureDemoTestUserSeeded(args: {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  now?: number;
}): Promise<{ userId: string; namespaceId: string; namespaceSlug: string }> {
  const now = args.now ?? Date.now();
  const slug = DEFAULT_DEMO_USER_USERNAME;
  const subject = buildLocalAccountSubject(slug);

  let existingUser = await findUserBySubject(args.db, subject);
  if (!existingUser) {
    existingUser =
      (await insertUserIfNew(args.db, {
        id: generateUserId(),
        tesseraSub: subject,
        createdAt: now,
      })) ?? (await findUserBySubject(args.db, subject));
  }
  if (!existingUser) {
    throw new Error("Failed to provision Dev Mode test user");
  }

  let namespace = await findNamespaceBySlug(args.db, slug);
  if (!namespace) {
    namespace =
      (await claimNamespace(args.db, {
        id: generateNamespaceId(),
        slug,
        createdBy: existingUser.id,
        createdAt: now,
      })) ?? (await findNamespaceBySlug(args.db, slug));
    if (namespace) {
      const passwordHash = await hashPassword(DEFAULT_DEMO_USER_PASSWORD);
      await upsertNamespaceDirectoryMeta(args.env.DB, namespace.id, {
        displayName: DEFAULT_DEMO_USER_DISPLAY_NAME,
        role: "member",
        status: "active",
        passwordHash,
        lastActiveAt: now,
        now,
      });
      await upsertNamespaceProfileMeta(args.env.DB, namespace.id, {
        bio: "Edge systems developer building TypeScript starter kits on Cloudflare Workers.",
        location: "San Francisco, CA",
        website: "https://vibtools.io",
        now,
      });
    }
  }

  if (!namespace) {
    throw new Error("Failed to claim Dev Mode test user namespace");
  }

  await insertMembershipIfMissing(args.db, {
    namespaceId: namespace.id,
    userId: existingUser.id,
    createdAt: now,
  });

  const existingRepos = await listRepositoriesForNamespace(args.db, namespace.id, null);
  if (existingRepos.length === 0) {
    for (const spec of DEMO_TEST_USER_REPOSITORIES) {
      await seedSingleDemoRepository({
        env: args.env,
        db: args.db,
        limiter: args.limiter,
        log: args.log,
        userId: existingUser.id,
        namespaceId: namespace.id,
        namespaceSlug: slug,
        authorName: DEFAULT_DEMO_USER_DISPLAY_NAME,
        authorEmail: `${slug}@local.dev`,
        spec,
        now,
      });
    }
  }

  return {
    userId: existingUser.id,
    namespaceId: namespace.id,
    namespaceSlug: slug,
  };
}
