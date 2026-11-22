import { canAccessAdminPanel, canWriteRepositories } from "@/shared/admin/panel";
import { classifyRef, formatRefOption, shortRefName } from "@/shared/git/ref-display";
import { PROFILE_README_CANDIDATES, PROFILE_REPO_SLUG } from "@/shared/slugs";
import { bytesToText, isValidOwnerRepo, isValidRef } from "@/shared/web";
import { resolveAdminAuthConfig } from "@/worker/auth/adminAuth";
import { viewerIsNamespaceMember } from "@/worker/auth/pat";
import { loadViewer } from "@/worker/auth/session";
import { buildCacheKeyFrom, cacheOrLoadJSONForRequest } from "@/worker/cache";
import { findDirectoryAccountBySlug } from "@/worker/db/d1/dal/adminDirectory";
import { findNamespaceBySlug } from "@/worker/db/d1/dal/namespaces";
import { findRepositoryById, listRepositoriesForNamespace } from "@/worker/db/d1/dal/repositories";
import {
  getNamespaceProfileMeta,
  getRepositoryMeta,
  listRepositoryMetaMap,
} from "@/worker/db/d1/dal/workspaceMeta";
import type { HeadInfo, ReadPathResult, Ref } from "@/worker/git";
import { getHeadAndRefs, readPath } from "@/worker/git";
import { getErrorMessage, isGitReadMissError } from "@/client/server/error";
import type { AppContext } from "../hono";
import { renderUiDocumentResponse } from "../uiResponse";
import {
  badRequest,
  canViewerManageRepo,
  formatSortedTreeEntries,
  loadHeadAndRefsCached,
  loadUiRepoActivity,
  markRequestPrivate,
  notFound,
  resolveRequestOrigin,
  resolveUiRepoAccess,
  type UiTreeEntry,
} from "./helpers";

async function loadCandidateMarkdown(args: {
  env: Env;
  req: Request;
  cacheCtx: AppContext["var"]["cacheCtx"];
  repoId: string;
  refOrOid: string;
  candidates: readonly string[];
  cachePath: string;
  log?: ReturnType<AppContext["var"]["logFor"]>;
}): Promise<{ md: string; path: string } | null> {
  const loader = async (): Promise<{ md: string; path: string } | null> => {
    for (const candidate of args.candidates) {
      try {
        const res = await readPath(args.env, args.repoId, args.refOrOid, candidate, args.cacheCtx);
        if (res.type === "blob" && !res.tooLarge) {
          return { md: bytesToText(res.content), path: candidate };
        }
      } catch (error) {
        if (isGitReadMissError(error)) {
          args.log?.debug("overview:markdown-candidate-miss", {
            candidate,
            ref: args.refOrOid,
          });
        } else {
          args.log?.warn("overview:markdown-candidate-failed", {
            candidate,
            ref: args.refOrOid,
            error: getErrorMessage(error),
          });
        }
      }
    }
    return null;
  };

  const cacheKey = buildCacheKeyFrom(args.req, args.cachePath, {
    repo: args.repoId,
    ref: args.refOrOid,
  });
  return await cacheOrLoadJSONForRequest<{ md: string; path: string }>(
    args.cacheCtx,
    cacheKey,
    loader,
    300
  );
}

export async function handleOwnerOverview(c: AppContext<"/:owner" | "/profile/:owner">) {
  const env = c.env;
  const owner = c.req.param("owner");
  if (!isValidOwnerRepo(owner)) {
    return badRequest(env, "Invalid owner", "Owner contains invalid characters or length");
  }
  const db = c.var.db;
  const namespace = await findNamespaceBySlug(db, owner);
  if (!namespace) {
    // Namespace rows are the owner-listing authority.
    return await notFound(c);
  }
  const viewer = await loadViewer(c);
  const [repos, directoryAccount, isMember, profileMeta] = await Promise.all([
    listRepositoriesForNamespace(db, namespace.id, viewer?.userId ?? null),
    findDirectoryAccountBySlug(env.DB, db, owner),
    viewer ? viewerIsNamespaceMember(db, viewer.userId, namespace.id) : Promise.resolve(false),
    getNamespaceProfileMeta(env.DB, namespace.id),
  ]);
  const repoMeta = await listRepositoryMetaMap(
    env.DB,
    repos.map((row) => row.id)
  );

  const canManageProfile = Boolean(viewer && canWriteRepositories(viewer.role) && isMember);
  const exposeRoleToViewer = Boolean(viewer && canAccessAdminPanel(viewer.role));
  const includesPrivate = repos.some((row) => row.visibility === "private");
  const cacheCtx = c.var.cacheCtx;
  if (includesPrivate || canManageProfile || exposeRoleToViewer) {
    // Private repo lists, interactive owner views, or admin-only role badges
    // bypass edge cache so updates and visibility rules apply immediately.
    markRequestPrivate(cacheCtx);
  }

  const profileRepo = repos.find((row) => row.slug === PROFILE_REPO_SLUG);
  let profileReadmeMd = "";
  let profileReadmePath = "";
  let profileRef = "main";

  if (profileRepo) {
    const profileLog = c.var.logFor({ service: "UiOverview", repoId: profileRepo.doName });
    const refsData =
      canManageProfile || profileRepo.visibility === "private"
        ? await getHeadAndRefs(env, profileRepo.doName, cacheCtx).catch((error) => {
            profileLog.warn("owner:profile-refs-failed", {
              owner,
              error: getErrorMessage(error),
            });
            return null;
          })
        : await loadHeadAndRefsCached(
            env,
            cacheCtx,
            profileRepo.doName,
            String(profileRepo.updatedAt)
          );
    const head = refsData?.head;
    const refs = refsData?.refs || [];
    const defaultRef = head?.target || (refs[0]?.name ?? "refs/heads/main");
    profileRef = shortRefName(defaultRef);
    const matchedRef = refs.find((r) => r.name === defaultRef) || refs[0];
    const targetOid = head?.oid || matchedRef?.oid || "";

    if (targetOid) {
      const foundProfile = await loadCandidateMarkdown({
        env,
        req: c.req.raw,
        cacheCtx,
        repoId: profileRepo.doName,
        refOrOid: targetOid,
        candidates: PROFILE_README_CANDIDATES,
        cachePath: "/_cache/owner-profile-readme",
        log: profileLog,
      });
      if (foundProfile) {
        profileReadmeMd = foundProfile.md;
        profileReadmePath = foundProfile.path;
      }
    }
  }

  const isPrimaryAdminOwner = owner === resolveAdminAuthConfig(env).username;
  const displayName =
    directoryAccount?.displayName || (isPrimaryAdminOwner ? "Administrator" : owner);
  const ownerRole = isPrimaryAdminOwner ? "admin" : directoryAccount?.role;

  return renderUiDocumentResponse(
    env,
    "owner",
    {
      title: `${displayName} (@${owner}) · Repositories`,
      owner,
      displayName,
      role: exposeRoleToViewer ? ownerRole : undefined,
      bio: profileMeta.bio,
      location: profileMeta.location,
      website: profileMeta.website,
      canManageProfile,
      hasProfileRepo: Boolean(profileRepo),
      profileRepoVisibility: profileRepo?.visibility,
      profileReadmeMd,
      profileReadmePath,
      profileRef,
      repos: repos.map((row) => ({
        id: row.id,
        slug: row.slug,
        visibility: row.visibility,
        description: repoMeta.get(row.id)?.description ?? "",
        pinned: repoMeta.get(row.id)?.pinned ?? false,
        updatedAt: row.updatedAt,
      })),
    },
    {
      // Public-only listings cache briefly per-colo. Private rows or member
      // views must not be shared across requests.
      cacheControl:
        includesPrivate || canManageProfile || exposeRoleToViewer
          ? "no-store"
          : "public, max-age=60",
      failureBody: "Failed to render view",
      viewer,
    }
  );
}

export async function handleRepoOverview(c: AppContext<"/:owner/:repo">) {
  const env = c.env;
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const access = await resolveUiRepoAccess(c, owner, repo);
  if (access.kind === "response") return access.response;
  const { route, cacheCtx, viewer } = access;
  const repoId = route.doName;
  const origin = resolveRequestOrigin(c.req.raw);
  const isProfileRepo = repo === PROFILE_REPO_SLUG;
  const canManageRepo = canViewerManageRepo(access);
  const canEditRepo = canManageRepo;
  const canEditProfile = Boolean(isProfileRepo && canEditRepo);

  if (canEditRepo || route.visibility === "private") {
    markRequestPrivate(cacheCtx);
  }

  const [repoRow, repoMeta, directoryAccount] = await Promise.all([
    findRepositoryById(c.var.db, route.repositoryId),
    getRepositoryMeta(env.DB, route.repositoryId),
    isProfileRepo ? findDirectoryAccountBySlug(env.DB, c.var.db, owner) : Promise.resolve(null),
  ]);

  const repoLog = c.var.logFor({ service: "UiOverview", repoId });
  const refsData =
    canEditRepo || route.visibility === "private"
      ? await getHeadAndRefs(env, repoId, cacheCtx).catch((error) => {
          repoLog.warn("repo:refs-failed", { error: getErrorMessage(error) });
          return null;
        })
      : await loadHeadAndRefsCached(
          env,
          cacheCtx,
          repoId,
          repoRow ? String(repoRow.updatedAt) : undefined
        );
  const head: HeadInfo | undefined = refsData?.head;
  const refs: Ref[] = refsData?.refs || [];

  const defaultRef = head?.target || (refs[0]?.name ?? "refs/heads/main");
  const defaultBranch = shortRefName(defaultRef);
  const requestedRef = new URL(c.req.url).searchParams.get("ref") || "";
  const hasValidRequestedRef = Boolean(requestedRef && isValidRef(requestedRef));
  const activeRefShort = hasValidRequestedRef ? shortRefName(requestedRef) : defaultBranch;
  const refEnc = encodeURIComponent(activeRefShort);

  const matchedRef = hasValidRequestedRef
    ? refs.find((r) => r.name === requestedRef || shortRefName(r.name) === activeRefShort)
    : refs.find((r) => r.name === defaultRef) || refs[0];
  const targetOid = hasValidRequestedRef
    ? matchedRef?.oid || requestedRef
    : head?.oid || matchedRef?.oid || "";

  const branchesData = refs
    .filter((ref) => classifyRef(ref.name) === "branch")
    .map(formatRefOption);
  const tagsData = refs.filter((ref) => classifyRef(ref.name) === "tag").map(formatRefOption);

  let readmeMd = "";
  let profileReadmeMd = "";
  let profileReadmePath = "";
  let rootEntries: UiTreeEntry[] = [];

  if (targetOid || refs.length > 0) {
    const refLookup = targetOid || activeRefShort;

    const loadRootTree = async (): Promise<ReadPathResult | null> => {
      try {
        return await readPath(env, repoId, refLookup, "", cacheCtx);
      } catch (error) {
        if (isGitReadMissError(error)) {
          repoLog.debug("repo:root-tree-miss", { ref: refLookup });
        } else {
          repoLog.warn("repo:root-tree-failed", {
            ref: refLookup,
            error: getErrorMessage(error),
          });
        }
        return null;
      }
    };
    const cacheKeyRootTree = buildCacheKeyFrom(c.req.raw, "/_cache/tree", {
      repo: repoId,
      ref: refLookup,
      path: "",
    });
    const rootTreeRes = await cacheOrLoadJSONForRequest<ReadPathResult | null>(
      cacheCtx,
      cacheKeyRootTree,
      loadRootTree,
      120
    );
    if (rootTreeRes && rootTreeRes.type === "tree" && rootTreeRes.entries) {
      rootEntries = formatSortedTreeEntries({
        owner,
        repo,
        ref: activeRefShort,
        basePath: "",
        entries: rootTreeRes.entries,
      });
    }

    const foundRootReadme = await loadCandidateMarkdown({
      env,
      req: c.req.raw,
      cacheCtx,
      repoId,
      refOrOid: refLookup,
      candidates: ["README.md", "README.MD", "Readme.md", "README", "readme.md"],
      cachePath: "/_cache/readme",
      log: repoLog,
    });
    readmeMd = foundRootReadme?.md || "";

    if (isProfileRepo) {
      const foundProfileReadme = await loadCandidateMarkdown({
        env,
        req: c.req.raw,
        cacheCtx,
        repoId,
        refOrOid: refLookup,
        candidates: PROFILE_README_CANDIDATES,
        cachePath: "/_cache/owner-profile-readme",
        log: repoLog,
      });
      profileReadmeMd = foundProfileReadme?.md || "";
      profileReadmePath = foundProfileReadme?.path || "";
    }
  }

  const progress = await loadUiRepoActivity(env, access);

  return renderUiDocumentResponse(
    env,
    "overview",
    {
      title: `${owner}/${repo}`,
      owner,
      repo,
      repositoryId: route.repositoryId,
      origin,
      displayName: directoryAccount?.displayName,
      description: repoMeta.description,
      pinned: repoMeta.pinned,
      visibility: route.visibility,
      defaultBranch,
      refShort: activeRefShort,
      refEnc,
      branches: branchesData,
      tags: tagsData,
      rootEntries,
      readmeMd,
      profileReadmeMd,
      profileReadmePath,
      canEditRepo,
      canManageRepo,
      canEditProfile,
      progress,
    },
    {
      cacheControl: route.visibility === "private" || canEditRepo ? "no-store" : undefined,
      failureBody: "Failed to render view",
      viewer,
    }
  );
}
