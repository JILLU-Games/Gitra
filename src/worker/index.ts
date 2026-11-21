import { Hono } from "hono";
import { registerGitRoutes } from "./routes/git";
import { registerAdminRoutes } from "./routes/admin";
import { registerSystemAdminRoutes } from "./routes/systemAdmin";
import { registerUiRoutes } from "./routes/ui";
import { registerAuthRoutes } from "./routes/auth";
import { requestServicesMiddleware, type AppBindings, type AppContext } from "./routes/hono";
import { renderUiDocumentResponse } from "./routes/uiResponse";
import { loadViewer } from "./auth/session";
import {
  listNamespacesForUser,
  listPublicRepositoriesWithNamespaces,
  listRepositoriesForUser,
} from "./db/d1/dal";
import { json } from "./common";
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

app.get("/", async (c) => {
  const viewer = await loadViewer(c);
  const origin = resolveRequestOrigin(c);
  const publicRows = await listPublicRepositoriesWithNamespaces(c.var.db);
  const publicRepositories = publicRows.map((row) => ({
    id: row.repository.id,
    slug: row.repository.slug,
    namespaceSlug: row.namespace.slug,
    visibility: row.repository.visibility,
    updatedAt: row.repository.updatedAt,
  }));

  if (!viewer) {
    return renderUiDocumentResponse(
      c.env,
      "home",
      {
        signedIn: false,
        origin,
        publicRepositories,
      },
      { failureBody: "Failed to render page\n", viewer: null }
    );
  }

  const [repositoryRows, namespaces] = await Promise.all([
    listRepositoriesForUser(c.var.db, viewer.userId),
    listNamespacesForUser(c.var.db, viewer.userId),
  ]);

  return renderUiDocumentResponse(
    c.env,
    "home",
    {
      signedIn: true,
      origin,
      primaryNamespaceSlug: viewer.primaryNamespaceSlug,
      displayName: viewer.displayName,
      viewerRole: viewer.role,
      namespaces: namespaces.map((ns) => ({ id: ns.id, slug: ns.slug })),
      repositories: repositoryRows.map((row) => ({
        id: row.repository.id,
        slug: row.repository.slug,
        namespaceSlug: row.namespace.slug,
        visibility: row.repository.visibility,
        updatedAt: row.repository.updatedAt,
      })),
      publicRepositories,
    },
    { failureBody: "Failed to render page\n", viewer }
  );
});

app.get("/explore", async (c) => {
  const viewer = await loadViewer(c);
  const origin = resolveRequestOrigin(c);
  const publicRows = await listPublicRepositoriesWithNamespaces(c.var.db);
  const publicRepositories = publicRows.map((row) => ({
    id: row.repository.id,
    slug: row.repository.slug,
    namespaceSlug: row.namespace.slug,
    visibility: row.repository.visibility,
    updatedAt: row.repository.updatedAt,
  }));

  return renderUiDocumentResponse(
    c.env,
    "explore",
    {
      signedIn: Boolean(viewer),
      exploreOnly: true,
      origin,
      primaryNamespaceSlug: viewer?.primaryNamespaceSlug,
      displayName: viewer?.displayName,
      viewerRole: viewer?.role,
      repositories: [],
      publicRepositories,
    },
    { failureBody: "Failed to render page\n", viewer }
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

function errorStatus(error: Error): number {
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  return 500;
}

app.onError((error) => {
  // The previous router converted uncaught handler failures into JSON. Most
  // routes catch expected failures themselves, but keep this last-resort shape
  // stable for truly unexpected errors.
  const status = errorStatus(error);
  return json({ error: error.message || "Internal Server Error" }, status, {
    "Content-Type": "application/json; charset=utf-8",
  });
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
