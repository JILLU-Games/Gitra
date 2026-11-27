import type { CacheContext } from "@/worker/cache";
import type { Logger } from "@/worker/common/logger";
import { createLogger } from "@/worker/common/logger";
import type { Limiter } from "@/worker/git/operations/limits";
import { shortRefName } from "@/shared/git/ref-display";
import {
  detectLicenseFromText,
  detectPrimaryLanguageFromPaths,
  extractPackageJsonMetadata,
} from "@/shared/git/repoMetadata";
import { readCommit } from "@/worker/git/operations/read/commits";
import { readLooseObjectRaw } from "@/worker/git/operations/read/objects";
import { getHeadAndRefs } from "@/worker/git/operations/read/refs";
import { isTreeMode, joinTreePath, readTree } from "@/worker/git/operations/read/tree";
import type { TreeEntry } from "@/worker/git/operations/read/types";
import type { RepositoryListing } from "@/worker/db/d1/dal/repositories";
import type { RepositoryMeta } from "@/worker/db/d1/dal/workspaceMeta";

export type RepoDerivedSummary = {
  language?: string;
  langColor?: string;
  branch?: string;
  license?: string;
  version?: string;
};

export type EnrichedRepositorySummary = {
  id: string;
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  description: string;
  pinned: boolean;
  homePinned: boolean;
  updatedAt: number;
  language?: string;
  langColor?: string;
  branch?: string;
  license?: string;
  version?: string;
};

const REPO_SUMMARY_KV_TTL_SECONDS = 60 * 60 * 24;
const MAX_COLD_SCANS_PER_REQUEST = 12;
const MAX_SUBTREE_DIRS_PER_REPO = 5;
const MAX_METADATA_BLOB_BYTES = 64 * 1024;
const PREFERRED_SOURCE_DIRS = new Set([
  "src",
  "lib",
  "app",
  "cmd",
  "pkg",
  "internal",
  "packages",
  "server",
  "client",
  "worker",
  "shared",
  "test",
  "tests",
]);
const LICENSE_FILENAMES = new Set([
  "license",
  "license.md",
  "license.txt",
  "copying",
  "copying.md",
]);
const textDecoder = new TextDecoder("utf-8", { fatal: false });

export function repoSummaryCacheKey(repositoryId: string, updatedAt: number): string {
  return `repo-summary:v1:${repositoryId}:${updatedAt}`;
}

function pickPrimaryRef(
  headTarget: string | undefined,
  refs: ReadonlyArray<{ name: string; oid: string }>
): { name: string; oid: string } | undefined {
  if (refs.length === 0) return undefined;
  if (headTarget) {
    const exact = refs.find((r) => r.name === headTarget);
    if (exact) return exact;
  }
  const branchRef = refs.find((r) => r.name.startsWith("refs/heads/"));
  return branchRef ?? refs[0];
}

function selectShallowDirsToScan(rootEntries: readonly TreeEntry[]): TreeEntry[] {
  const dirs = rootEntries.filter((entry) => isTreeMode(entry.mode));
  const preferred: TreeEntry[] = [];
  const fallback: TreeEntry[] = [];
  for (const dir of dirs) {
    if (PREFERRED_SOURCE_DIRS.has(dir.name.toLowerCase())) {
      preferred.push(dir);
    } else if (!dir.name.startsWith(".")) {
      fallback.push(dir);
    }
  }
  return [...preferred, ...fallback].slice(0, MAX_SUBTREE_DIRS_PER_REPO);
}

async function deriveRepositorySummaryFromGit(args: {
  env: Env;
  doName: string;
  cacheCtx: CacheContext;
}): Promise<RepoDerivedSummary> {
  const { head, refs } = await getHeadAndRefs(args.env, args.doName, args.cacheCtx);
  const primaryRef = pickPrimaryRef(head?.target, refs);
  if (!primaryRef) {
    return {};
  }

  const branch = shortRefName(primaryRef.name);
  const commitObj = await readLooseObjectRaw(args.env, args.doName, primaryRef.oid, args.cacheCtx);
  if (!commitObj) {
    return { branch };
  }

  let rootTreeOid: string | undefined;
  if (commitObj.type === "commit") {
    const commit = await readCommit(args.env, args.doName, primaryRef.oid, args.cacheCtx);
    rootTreeOid = commit.tree;
  } else if (commitObj.type === "tree") {
    rootTreeOid = primaryRef.oid;
  }
  if (!rootTreeOid) {
    return { branch };
  }

  const rootEntries = await readTree(args.env, args.doName, rootTreeOid, args.cacheCtx);
  const collectedPaths: string[] = [];
  let licenseEntry: TreeEntry | undefined;
  let packageJsonEntry: TreeEntry | undefined;

  for (const entry of rootEntries) {
    if (isTreeMode(entry.mode)) continue;
    collectedPaths.push(entry.name);
    const lower = entry.name.toLowerCase();
    if (!licenseEntry && LICENSE_FILENAMES.has(lower)) {
      licenseEntry = entry;
    } else if (!packageJsonEntry && lower === "package.json") {
      packageJsonEntry = entry;
    }
  }

  const subDirs = selectShallowDirsToScan(rootEntries);
  if (subDirs.length > 0) {
    const subTrees = await Promise.all(
      subDirs.map(async (dir) => {
        try {
          const entries = await readTree(args.env, args.doName, dir.oid, args.cacheCtx);
          return { base: dir.name, entries };
        } catch {
          return { base: dir.name, entries: [] as TreeEntry[] };
        }
      })
    );
    for (const sub of subTrees) {
      for (const entry of sub.entries) {
        if (!isTreeMode(entry.mode)) {
          collectedPaths.push(joinTreePath(sub.base, entry.name));
        }
      }
    }
  }

  let license: string | undefined;
  let version: string | undefined;

  const [licenseBlob, packageBlob] = await Promise.all([
    licenseEntry
      ? readLooseObjectRaw(args.env, args.doName, licenseEntry.oid, args.cacheCtx).catch(() => null)
      : Promise.resolve(null),
    packageJsonEntry
      ? readLooseObjectRaw(args.env, args.doName, packageJsonEntry.oid, args.cacheCtx).catch(
          () => null
        )
      : Promise.resolve(null),
  ]);

  if (licenseBlob && licenseBlob.type === "blob" && licenseBlob.payload.byteLength > 0) {
    const slice = licenseBlob.payload.subarray(0, MAX_METADATA_BLOB_BYTES);
    license = detectLicenseFromText(textDecoder.decode(slice));
  }

  if (packageBlob && packageBlob.type === "blob" && packageBlob.payload.byteLength > 0) {
    const slice = packageBlob.payload.subarray(0, MAX_METADATA_BLOB_BYTES);
    const pkgMeta = extractPackageJsonMetadata(textDecoder.decode(slice));
    if (!license && pkgMeta.license) {
      license = pkgMeta.license;
    }
    if (pkgMeta.version) {
      version = pkgMeta.version;
    }
  }

  const detectedLang = detectPrimaryLanguageFromPaths(collectedPaths);

  return {
    branch,
    language: detectedLang?.language,
    langColor: detectedLang?.langColor,
    license,
    version,
  };
}

function parseCachedSummary(raw: string | null): RepoDerivedSummary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    return {
      language: typeof obj.language === "string" ? obj.language : undefined,
      langColor: typeof obj.langColor === "string" ? obj.langColor : undefined,
      branch: typeof obj.branch === "string" ? obj.branch : undefined,
      license: typeof obj.license === "string" ? obj.license : undefined,
      version: typeof obj.version === "string" ? obj.version : undefined,
    };
  } catch {
    return null;
  }
}

export async function enrichRepositoriesWithMetadata(args: {
  env: Env;
  req: Request;
  ctx: ExecutionContext;
  limiter: Limiter;
  log?: Logger;
  rows: readonly RepositoryListing[];
  metaMap: ReadonlyMap<string, RepositoryMeta>;
  sharedDerived?: Map<string, RepoDerivedSummary>;
}): Promise<EnrichedRepositorySummary[]> {
  const { env, rows, metaMap } = args;
  const log = args.log ?? createLogger(env.LOG_LEVEL, { service: "RepoMetadata" });
  const derivedById = args.sharedDerived ?? new Map<string, RepoDerivedSummary>();

  const uniqueRows: RepositoryListing[] = [];
  const seenIds = new Set<string>();
  for (const row of rows) {
    if (seenIds.has(row.repository.id)) continue;
    seenIds.add(row.repository.id);
    if (!derivedById.has(row.repository.id)) {
      uniqueRows.push(row);
    }
  }

  // Step 1: Read cached summaries from KV ROUTES in parallel through limiter.
  if (uniqueRows.length > 0 && env.ROUTES) {
    const cachedPairs = await Promise.all(
      uniqueRows.map(async (row) => {
        const key = repoSummaryCacheKey(row.repository.id, row.repository.updatedAt);
        try {
          const raw = await args.limiter.run("kv:get-repo-summary", () => env.ROUTES.get(key));
          return { row, cached: parseCachedSummary(raw) };
        } catch (error) {
          log.debug("repo-metadata:kv-read-failed", {
            repositoryId: row.repository.id,
            error: String(error),
          });
          return { row, cached: null };
        }
      })
    );
    for (const pair of cachedPairs) {
      if (pair.cached) {
        derivedById.set(pair.row.repository.id, pair.cached);
      }
    }
  }

  // Step 2: Derive uncached summaries lazily (bounded to prevent subrequest exhaustion).
  const uncached = uniqueRows.filter((row) => !derivedById.has(row.repository.id));
  let coldScansRemaining = MAX_COLD_SCANS_PER_REQUEST;
  for (const row of uncached) {
    if (coldScansRemaining <= 0) break;
    coldScansRemaining -= 1;

    const cacheCtx: CacheContext = {
      req: args.req,
      ctx: args.ctx,
      memo: {
        repoId: row.repository.doName,
        limiter: args.limiter,
      },
    };
    try {
      const summary = await deriveRepositorySummaryFromGit({
        env,
        doName: row.repository.doName,
        cacheCtx,
      });
      derivedById.set(row.repository.id, summary);
      if (env.ROUTES) {
        const key = repoSummaryCacheKey(row.repository.id, row.repository.updatedAt);
        await args.limiter
          .run("kv:put-repo-summary", () =>
            env.ROUTES.put(key, JSON.stringify(summary), {
              expirationTtl: REPO_SUMMARY_KV_TTL_SECONDS,
            })
          )
          .catch((error) => {
            log.debug("repo-metadata:kv-write-failed", {
              repositoryId: row.repository.id,
              error: String(error),
            });
          });
      }
    } catch (error) {
      log.warn("repo-metadata:derive-failed", {
        repositoryId: row.repository.id,
        doName: row.repository.doName,
        error: String(error),
      });
      derivedById.set(row.repository.id, {});
    }
  }

  return rows.map((row) => {
    const meta = metaMap.get(row.repository.id);
    const derived = derivedById.get(row.repository.id);
    return {
      id: row.repository.id,
      slug: row.repository.slug,
      namespaceSlug: row.namespace.slug,
      visibility: row.repository.visibility,
      description: meta?.description ?? "",
      pinned: meta?.pinned ?? false,
      homePinned: meta?.homePinned ?? false,
      updatedAt: row.repository.updatedAt,
      ...(derived?.language ? { language: derived.language } : {}),
      ...(derived?.langColor ? { langColor: derived.langColor } : {}),
      ...(derived?.branch ? { branch: derived.branch } : {}),
      ...(derived?.license ? { license: derived.license } : {}),
      ...(derived?.version ? { version: derived.version } : {}),
    };
  });
}
