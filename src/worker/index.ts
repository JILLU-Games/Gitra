import { Hono } from "hono";
import { registerGitRoutes } from "./routes/git";
import { registerAdminRoutes } from "./routes/admin";
import { registerSystemAdminRoutes } from "./routes/systemAdmin";
import { registerUiRoutes } from "./routes/ui";
import { registerAuthRoutes } from "./routes/auth";
import { requestServicesMiddleware, type AppBindings, type AppContext } from "./routes/hono";
import { renderUiDocumentResponse } from "./routes/uiResponse";
import { loadSiteBranding } from "./branding";
import { loadViewer } from "./auth/session";
import {
  buildLocalAccountSubject,
  DEFAULT_DEMO_USER_USERNAME,
  isDemoModeEnabled,
  resolveAdminAuthConfig,
  resolveInitialAdminNamespaceSlug,
} from "./auth/adminAuth";
import { ensureDemoTestUserSeeded } from "./auth/demoSeed";
import { createDb } from "./db/d1/client";
import {
  findNamespaceBySlug,
  findPrimaryAdminNamespace,
  listAllPublicNamespaceDirectory,
  listNamespacesForUser,
  listPublicNamespaceSummaries,
  listPublicRepositoriesWithNamespaces,
  listRepositoriesForUser,
  listRepositoryMetaMap,
} from "./db/d1/dal";
import {
  computeNamespaceDirectoryTotals,
  filterNamespaceDirectoryItems,
} from "@/shared/namespaces";
import {
  buildEscapedErrorHtmlDocument,
  getErrorMessage,
  getErrorStack,
  resolveErrorStatus,
} from "@/client/server/error";
import { createLogger, json } from "./common";
import { handleRepoTaskQueue } from "./tasks/queue";

const app = new Hono<AppBindings>({ strict: false });
app.use("*", requestServicesMiddleware);
// Register Git protocol routes (info/refs, upload-pack, receive-pack)
registerGitRoutes(app);
// Register repo-scoped Admin routes (/:owner/:repo/admin/*)
registerAdminRoutes(app);
// Register Auth & User Settings routes BEFORE UI to avoid /:owner shadowing /auth or /user
registerAuthRoutes(app);
// Register System Admin Panel routes (/admin, /admin/users, /admin/settings, /admin/api/*) BEFORE UI /:owner
registerSystemAdminRoutes(app);

function resolveRequestOrigin(c: AppContext): string {
  const url = new URL(c.req.url);
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host")?.trim();
  return forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : url.origin;
}

async function ensureDemoWorkspaceOnPublicEntry(c: AppContext): Promise<void> {
  if (!isDemoModeEnabled(c.env)) return;
  const existing = await findNamespaceBySlug(c.var.db, DEFAULT_DEMO_USER_USERNAME);
  if (existing) return;
  const primaryDb = createDb(c.env.DB.withSession("first-primary"));
  await ensureDemoTestUserSeeded({
    env: c.env,
    db: primaryDb,
    limiter: c.var.limiter,
    log: c.var.logFor({ service: "DemoSeed" }),
  });
}

app.get("/", async (c) => {
  await ensureDemoWorkspaceOnPublicEntry(c);
  const [viewer, branding] = await Promise.all([loadViewer(c), loadSiteBranding(c.env)]);
  const origin = resolveRequestOrigin(c);
  const [publicRows, primaryAdminNs] = await Promise.all([
    listPublicRepositoriesWithNamespaces(c.var.db),
    findPrimaryAdminNamespace(
      c.var.db,
      buildLocalAccountSubject(resolveAdminAuthConfig(c.env).username)
    ),
  ]);
  const primaryAdminSlug = primaryAdminNs?.slug ?? resolveInitialAdminNamespaceSlug(c.env);

  if (!viewer) {
    const [publicMeta, publicNamespaces] = await Promise.all([
      listRepositoryMetaMap(
        c.env.DB,
        publicRows.map((row) => row.repository.id)
      ),
      listPublicNamespaceSummaries(c.env.DB, publicRows, primaryAdminSlug),
    ]);
    const publicRepositories = publicRows.map((row) => ({
      id: row.repository.id,
      slug: row.repository.slug,
      namespaceSlug: row.namespace.slug,
      visibility: row.repository.visibility,
      description: publicMeta.get(row.repository.id)?.description ?? "",
      pinned: publicMeta.get(row.repository.id)?.pinned ?? false,
      homePinned: publicMeta.get(row.repository.id)?.homePinned ?? false,
      updatedAt: row.repository.updatedAt,
    }));
    return renderUiDocumentResponse(
      c.env,
      "home",
      {
        signedIn: false,
        origin,
        branding,
        publicNamespaces,
        publicRepositories,
      },
      { failureBody: "Failed to render page\n", viewer: null, branding, origin }
    );
  }

  const [repositoryRows, namespaces, publicNamespaces] = await Promise.all([
    listRepositoriesForUser(c.var.db, viewer.userId),
    listNamespacesForUser(c.var.db, viewer.userId),
    listPublicNamespaceSummaries(c.env.DB, publicRows, primaryAdminSlug),
  ]);
  const allRepoIds = Array.from(
    new Set([
      ...publicRows.map((row) => row.repository.id),
      ...repositoryRows.map((row) => row.repository.id),
    ])
  );
  const repoMeta = await listRepositoryMetaMap(c.env.DB, allRepoIds);
  const publicRepositories = publicRows.map((row) => ({
    id: row.repository.id,
    slug: row.repository.slug,
    namespaceSlug: row.namespace.slug,
    visibility: row.repository.visibility,
    description: repoMeta.get(row.repository.id)?.description ?? "",
    pinned: repoMeta.get(row.repository.id)?.pinned ?? false,
    homePinned: repoMeta.get(row.repository.id)?.homePinned ?? false,
    updatedAt: row.repository.updatedAt,
  }));

  return renderUiDocumentResponse(
    c.env,
    "home",
    {
      signedIn: true,
      origin,
      branding,
      primaryNamespaceSlug: viewer.primaryNamespaceSlug,
      displayName: viewer.displayName,
      viewerRole: viewer.role,
      namespaces: namespaces.map((ns) => ({ id: ns.id, slug: ns.slug })),
      publicNamespaces,
      repositories: repositoryRows.map((row) => ({
        id: row.repository.id,
        slug: row.repository.slug,
        namespaceSlug: row.namespace.slug,
        visibility: row.repository.visibility,
        description: repoMeta.get(row.repository.id)?.description ?? "",
        pinned: repoMeta.get(row.repository.id)?.pinned ?? false,
        homePinned: repoMeta.get(row.repository.id)?.homePinned ?? false,
        updatedAt: row.repository.updatedAt,
      })),
      publicRepositories,
    },
    { failureBody: "Failed to render page\n", viewer, branding, origin }
  );
});

app.get("/explore", async (c) => {
  await ensureDemoWorkspaceOnPublicEntry(c);
  const [viewer, branding] = await Promise.all([loadViewer(c), loadSiteBranding(c.env)]);
  const origin = resolveRequestOrigin(c);
  const [publicRows, primaryAdminNs] = await Promise.all([
    listPublicRepositoriesWithNamespaces(c.var.db),
    findPrimaryAdminNamespace(
      c.var.db,
      buildLocalAccountSubject(resolveAdminAuthConfig(c.env).username)
    ),
  ]);
  const primaryAdminSlug = primaryAdminNs?.slug ?? resolveInitialAdminNamespaceSlug(c.env);
  const [publicMeta, publicNamespaces] = await Promise.all([
    listRepositoryMetaMap(
      c.env.DB,
      publicRows.map((row) => row.repository.id)
    ),
    listPublicNamespaceSummaries(c.env.DB, publicRows, primaryAdminSlug),
  ]);
  const publicRepositories = publicRows.map((row) => ({
    id: row.repository.id,
    slug: row.repository.slug,
    namespaceSlug: row.namespace.slug,
    visibility: row.repository.visibility,
    description: publicMeta.get(row.repository.id)?.description ?? "",
    pinned: publicMeta.get(row.repository.id)?.pinned ?? false,
    homePinned: publicMeta.get(row.repository.id)?.homePinned ?? false,
    updatedAt: row.repository.updatedAt,
  }));

  return renderUiDocumentResponse(
    c.env,
    "explore",
    {
      signedIn: Boolean(viewer),
      exploreOnly: true,
      origin,
      branding,
      primaryNamespaceSlug: viewer?.primaryNamespaceSlug,
      displayName: viewer?.displayName,
      viewerRole: viewer?.role,
      publicNamespaces,
      repositories: [],
      publicRepositories,
    },
    { failureBody: "Failed to render page\n", viewer, branding, origin }
  );
});

app.get("/namespaces", async (c) => {
  await ensureDemoWorkspaceOnPublicEntry(c);
  const [viewer, branding] = await Promise.all([loadViewer(c), loadSiteBranding(c.env)]);
  const origin = resolveRequestOrigin(c);
  const query = (c.req.query("q") ?? "").trim().slice(0, 80);

  const [publicRows, primaryAdminNs] = await Promise.all([
    listPublicRepositoriesWithNamespaces(c.var.db),
    findPrimaryAdminNamespace(
      c.var.db,
      buildLocalAccountSubject(resolveAdminAuthConfig(c.env).username)
    ),
  ]);
  const primaryAdminSlug = primaryAdminNs?.slug ?? resolveInitialAdminNamespaceSlug(c.env);
  const allNamespaces = await listAllPublicNamespaceDirectory(
    c.env.DB,
    c.var.db,
    publicRows,
    primaryAdminSlug
  );
  const totals = computeNamespaceDirectoryTotals(allNamespaces);
  const filteredNamespaces = filterNamespaceDirectoryItems(allNamespaces, query);

  return renderUiDocumentResponse(
    c.env,
    "namespaces",
    {
      namespaces: filteredNamespaces,
      totalNamespacesCount: totals.totalNamespaces,
      totalPublicReposCount: totals.totalPublicRepos,
      totalOpenSourceReposCount: totals.totalOpenSourceRepos,
      query,
    },
    { failureBody: "Failed to render page\n", viewer, branding, origin }
  );
});

// Register UI routes AFTER static/auth/admin so that /:owner doesn't shadow them
registerUiRoutes(app);

async function renderNotFound(c: AppContext): Promise<Response> {
  const viewer = await loadViewer(c);
  return renderUiDocumentResponse(
    c.env,
    "404",
    {},
    {
      status: 404,
      failureBody: "Not found\n",
      failureStatus: 404,
      viewer,
    }
  );
}

app.notFound((c) => renderNotFound(c));

function wantsJsonErrorResponse(c: AppContext): boolean {
  const pathname = new URL(c.req.url).pathname;
  if (
    pathname.includes("/api/") ||
    pathname.includes("/commits/fragments/") ||
    /\/commit\/[^/]+\/diff$/.test(pathname) ||
    pathname.endsWith("/info/refs") ||
    pathname.endsWith("/git-upload-pack") ||
    pathname.endsWith("/git-receive-pack") ||
    /\/admin\/(status|storage|debug-state|compaction|pack-refs|refs-kv|purge)$/.test(pathname)
  ) {
    return true;
  }

  const accept = (c.req.header("accept") || "").toLowerCase();
  if (accept.includes("text/html")) {
    return false;
  }
  if (accept.includes("application/json")) {
    return true;
  }
  return c.req.method !== "GET" && c.req.method !== "HEAD";
}

app.onError(async (error, c) => {
  const status = resolveErrorStatus(error);
  const message = getErrorMessage(error);
  const pathname = new URL(c.req.url).pathname;
  const log =
    typeof c.var.logFor === "function"
      ? c.var.logFor({ service: "Worker" })
      : createLogger(c.env.LOG_LEVEL, { service: "Worker" });
  log.error("worker:unhandled-error", { status, path: pathname, error: message });

  if (wantsJsonErrorResponse(c)) {
    return json({ error: message || "Internal Server Error" }, status, {
      "Content-Type": "application/json; charset=utf-8",
    });
  }

  const debug = String(c.env.LOG_LEVEL || "").toLowerCase() === "debug";
  const publicMessage =
    status >= 500 && !debug
      ? "An unexpected internal error occurred. Please try again shortly."
      : message;
  const stack = debug ? getErrorStack(error) : undefined;
  const viewer = await loadViewer(c).catch(() => null);

  try {
    return await renderUiDocumentResponse(
      c.env,
      "error",
      {
        title: "Error · gitra",
        message: publicMessage,
        stack,
      },
      {
        status,
        failureBody: buildEscapedErrorHtmlDocument("Error · gitra", publicMessage),
        failureStatus: status,
        viewer,
      }
    );
  } catch {
    return new Response(buildEscapedErrorHtmlDocument("Error · gitra", publicMessage), {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    return await handleRepoTaskQueue(batch, env, ctx);
  },
};

export { RepoDurableObject } from "./do/repo/repoDO";
