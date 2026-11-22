import {
  canAccessAdminPanel,
  sanitizeDisplayName,
  validateUserPassword,
} from "@/shared/admin/panel";
import { safeParseJsonRequest } from "@/shared/web";
import {
  buildLocalAccountSubject,
  DEFAULT_DEMO_ADMIN_PASSWORD,
  DEFAULT_DEMO_USER_PASSWORD,
  DEFAULT_DEMO_USER_USERNAME,
  DEFAULT_POST_LOGIN_REDIRECT,
  deriveNamespaceSlugForAdmin,
  isDemoModeEnabled,
  resolveAdminAuthConfig,
  sanitizeNextRedirect,
  verifyAdminCredentials,
} from "@/worker/auth/adminAuth";
import { ensureDemoRepositoriesSeeded, ensureDemoTestUserSeeded } from "@/worker/auth/demoSeed";
import { sameOriginViolation } from "@/worker/auth/origin";
import { hashPassword, verifyPassword } from "@/worker/auth/passwords";
import {
  createSessionForUser,
  endSession,
  generateNamespaceId,
  generateUserId,
  loadSessionConfig,
  loadViewer,
} from "@/worker/auth/session";
import { json } from "@/worker/common";
import {
  claimNamespace,
  findDirectoryAccountBySlug,
  findDirectoryAccountByUserId,
  findNamespaceBySlug,
  findNamespaceDirectoryMeta,
  findUserBySubject,
  insertMembershipIfMissing,
  insertUserIfNew,
  touchDirectoryLastActive,
  updateDirectoryPasswordHash,
  upsertNamespaceDirectoryMeta,
  upsertNamespaceProfileMeta,
} from "@/worker/db/d1/dal";
import type { AppContext, AppRouter } from "./hono";
import {
  AdminLoginRequestSchema,
  ChangePasswordRequestSchema,
  ProfileMetaUpdateRequestSchema,
} from "./requestSchemas";
import { safeRedirect } from "./authShared";
import { renderUiDocumentResponse } from "./uiResponse";

function authErrorRedirect(c: AppContext, code: string, nextPath?: string): Response {
  const params = new URLSearchParams({ error: code });
  if (nextPath && nextPath !== DEFAULT_POST_LOGIN_REDIRECT) {
    params.set("next", nextPath);
  }
  return safeRedirect(c, `/auth?${params.toString()}`, 303);
}

async function readLoginPayload(c: AppContext): Promise<{
  username: string;
  password: string;
  next: string;
  account?: string;
}> {
  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = AdminLoginRequestSchema.safeParse(rawBody);
    if (parsed.success) return parsed.data;
    return { username: "", password: "", next: "" };
  }
  try {
    const form = await c.req.parseBody();
    const parsed = AdminLoginRequestSchema.safeParse(form);
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to empty payload so field validation surfaces missing_credentials.
  }
  return { username: "", password: "", next: "" };
}

async function provisionAdminSession(args: {
  c: AppContext;
  subject: string;
  namespaceSlug: string;
  seedDemoRepos: boolean;
}): Promise<{ ok: true; userId: string } | { ok: false; reason: "session_create_failed" }> {
  const { c, subject, namespaceSlug, seedDemoRepos } = args;
  const log = c.var.logFor({ service: "AuthLogin" });
  const sessionConfig = loadSessionConfig(c.env);
  if (!sessionConfig.ok) {
    log.warn("auth:login-session-config-missing", { reason: sessionConfig.reason });
    return { ok: false, reason: "session_create_failed" };
  }

  const db = c.var.db;
  const now = Date.now();
  const inserted = await insertUserIfNew(db, {
    id: generateUserId(),
    tesseraSub: subject,
    createdAt: now,
  });

  let userId: string;
  if (inserted) {
    userId = inserted.id;
  } else {
    const existing = await findUserBySubject(db, subject);
    if (!existing) {
      log.error("auth:login-user-upsert-failed", { subject });
      return { ok: false, reason: "session_create_failed" };
    }
    userId = existing.id;
  }

  // Ensure the admin owns their default namespace (e.g. `@admin`) so they can
  // immediately browse, create, and customize repositories on the dashboard.
  let namespaceId: string | null = null;
  const claimed = await claimNamespace(db, {
    id: generateNamespaceId(),
    slug: namespaceSlug,
    createdBy: userId,
    createdAt: now,
  });
  if (claimed) {
    namespaceId = claimed.id;
  } else {
    const existingNamespace = await findNamespaceBySlug(db, namespaceSlug);
    if (existingNamespace && existingNamespace.createdBy === userId) {
      namespaceId = existingNamespace.id;
    }
  }

  if (namespaceId) {
    await insertMembershipIfMissing(db, {
      namespaceId,
      userId,
      createdAt: now,
    });

    if (seedDemoRepos) {
      await ensureDemoRepositoriesSeeded({
        env: c.env,
        db,
        limiter: c.var.limiter,
        log,
        userId,
        namespaceId,
        namespaceSlug,
        now,
      });
    }

    await touchDirectoryLastActive(c.env.DB, namespaceId, now);
  }

  try {
    await createSessionForUser(c.env, c, userId, now);
  } catch (error) {
    log.error("auth:login-session-create-failed", { error: String(error) });
    return { ok: false, reason: "session_create_failed" };
  }

  log.info("auth:login-success", { userId, namespaceSlug, seedDemoRepos });
  return { ok: true, userId };
}

export function registerAuthLoginRoutes(router: AppRouter) {
  // GET /auth: signed-in users go straight to their destination; anonymous
  // users see the clean Sign-in form.
  router.get(`/auth`, async (c) => {
    try {
      const nextPath = sanitizeNextRedirect(c.req.query("next"));
      const viewer = await loadViewer(c);
      if (viewer) {
        const target =
          (nextPath === "/admin" || nextPath.startsWith("/admin/")) &&
          !canAccessAdminPanel(viewer.role)
            ? "/"
            : nextPath;
        return safeRedirect(c, target);
      }

      const errorCode = c.req.query("error") ?? undefined;
      const authConfig = resolveAdminAuthConfig(c.env);
      const demoMode = authConfig.mode === "demo";

      return await renderUiDocumentResponse(
        c.env,
        "auth-signin",
        {
          errorCode,
          demoMode,
          demoUsername: demoMode ? authConfig.username : undefined,
          demoPassword: demoMode ? DEFAULT_DEMO_ADMIN_PASSWORD : undefined,
          demoUserUsername: demoMode ? DEFAULT_DEMO_USER_USERNAME : undefined,
          demoUserPassword: demoMode ? DEFAULT_DEMO_USER_PASSWORD : undefined,
          nextPath: nextPath !== DEFAULT_POST_LOGIN_REDIRECT ? nextPath : undefined,
        },
        { failureBody: "Failed to render page\n", viewer: null }
      );
    } catch {
      return new Response("Failed to render page\n", { status: 500 });
    }
  });

  // POST /auth/login: verify either primary admin credentials or a D1
  // directory user's `@handle` + PBKDF2 password hash, enforce active status,
  // establish the sealed session cookie, and redirect cleanly.
  router.post(`/auth/login`, async (c) => {
    const log = c.var.logFor({ service: "AuthLogin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("auth:login-same-origin-violation");
      return violation;
    }

    const body = await readLoginPayload(c);
    const nextPath = sanitizeNextRedirect(body.next);

    if (!body.username.trim() || !body.password) {
      log.info("auth:login-rejected", { reason: "missing_credentials" });
      return authErrorRedirect(c, "missing_credentials", nextPath);
    }

    // 1. Primary admin credential path (demo mode or configured env secret)
    const verifiedAdmin = await verifyAdminCredentials(c.env, body.username, body.password);
    if (verifiedAdmin.ok) {
      const sessionResult = await provisionAdminSession({
        c,
        subject: verifiedAdmin.subject,
        namespaceSlug: verifiedAdmin.namespaceSlug,
        seedDemoRepos: verifiedAdmin.mode === "demo",
      });

      if (!sessionResult.ok) {
        return authErrorRedirect(c, sessionResult.reason, nextPath);
      }
      return safeRedirect(c, nextPath, 303);
    }

    // 2. Directory user account lookup by handle (`@slug` or `slug`)
    const normalizedHandle = body.username.trim().replace(/^@+/, "").toLowerCase();
    if (normalizedHandle === DEFAULT_DEMO_USER_USERNAME && isDemoModeEnabled(c.env)) {
      await ensureDemoTestUserSeeded({
        env: c.env,
        db: c.var.db,
        limiter: c.var.limiter,
        log,
      });
    }
    const account = normalizedHandle
      ? await findDirectoryAccountBySlug(c.env.DB, c.var.db, normalizedHandle)
      : null;

    if (account && account.passwordHash) {
      const passwordOk = await verifyPassword(body.password, account.passwordHash);
      if (passwordOk) {
        if (account.status === "disabled") {
          log.warn("auth:login-account-disabled", {
            userId: account.userId,
            slug: account.slug,
          });
          return authErrorRedirect(c, "account_disabled", nextPath);
        }

        const sessionConfig = loadSessionConfig(c.env);
        if (!sessionConfig.ok) {
          log.warn("auth:login-session-config-missing", { reason: sessionConfig.reason });
          return authErrorRedirect(c, "session_create_failed", nextPath);
        }

        const now = Date.now();
        await touchDirectoryLastActive(c.env.DB, account.namespaceId, now);
        try {
          await createSessionForUser(c.env, c, account.userId, now);
        } catch (error) {
          log.error("auth:login-session-create-failed", { error: String(error) });
          return authErrorRedirect(c, "session_create_failed", nextPath);
        }

        log.info("auth:directory-user-login-success", {
          userId: account.userId,
          slug: account.slug,
          role: account.role,
        });

        const destination =
          (nextPath === "/admin" || nextPath.startsWith("/admin/")) &&
          !canAccessAdminPanel(account.role)
            ? "/"
            : nextPath;
        return safeRedirect(c, destination, 303);
      }
    }

    log.info("auth:login-rejected", { reason: "invalid_credentials" });
    return authErrorRedirect(c, "invalid_credentials", nextPath);
  });

  // POST /auth/api/change-password: allow signed-in directory users to change
  // their own password after verifying their current password.
  router.post(`/auth/api/change-password`, async (c) => {
    const log = c.var.logFor({ service: "AuthPassword" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("auth:change-password-same-origin-violation");
      return violation;
    }

    const viewer = await loadViewer(c);
    if (!viewer) return json({ ok: false, reason: "unauthorized" } as const, 401);

    if (viewer.isPrimaryAdmin) {
      return json({ ok: false, reason: "managed-by-env" } as const, 400);
    }

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = ChangePasswordRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, reason: "invalid-payload" } as const, 400);
    }

    const { currentPassword, newPassword } = parsed.data;
    const newValidation = validateUserPassword(newPassword);
    if (!newValidation.ok) {
      return json({ ok: false, reason: newValidation.reason } as const, 400);
    }

    const account = await findDirectoryAccountByUserId(c.env.DB, c.var.db, viewer.userId);
    if (!account || !account.passwordHash) {
      return json({ ok: false, reason: "password-not-set" } as const, 400);
    }

    const matchesCurrent = await verifyPassword(currentPassword, account.passwordHash);
    if (!matchesCurrent) {
      log.warn("auth:change-password-invalid-current", { userId: viewer.userId });
      return json({ ok: false, reason: "invalid-current-password" } as const, 400);
    }

    const nextHash = await hashPassword(newValidation.password);
    await updateDirectoryPasswordHash(c.env.DB, account.namespaceId, nextHash, Date.now());
    log.info("auth:change-password-success", {
      userId: viewer.userId,
      namespaceId: account.namespaceId,
    });

    return json({ ok: true } as const);
  });

  // PUT /auth/api/profile: allow signed-in users to edit their display name,
  // bio, location, and website metadata on their primary namespace profile.
  router.put(`/auth/api/profile`, async (c) => {
    const log = c.var.logFor({ service: "UserProfile" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("profile:same-origin-violation");
      return violation;
    }

    const viewer = await loadViewer(c);
    if (!viewer) return json({ ok: false, reason: "unauthorized" } as const, 401);

    if (!viewer.primaryNamespaceSlug) {
      return json({ ok: false, reason: "namespace-not-found" } as const, 404);
    }

    const namespace = await findNamespaceBySlug(c.var.db, viewer.primaryNamespaceSlug);
    if (!namespace) {
      return json({ ok: false, reason: "namespace-not-found" } as const, 404);
    }

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = ProfileMetaUpdateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, reason: "invalid-payload" } as const, 400);
    }

    const now = Date.now();
    const existingMeta = await findNamespaceDirectoryMeta(c.env.DB, namespace.id);
    const nextDisplayName = sanitizeDisplayName(
      parsed.data.displayName ?? viewer.displayName ?? namespace.slug,
      namespace.slug
    );
    const role = viewer.isPrimaryAdmin ? "admin" : (existingMeta?.role ?? viewer.role);
    const status = viewer.isPrimaryAdmin ? "active" : (existingMeta?.status ?? "active");

    await upsertNamespaceDirectoryMeta(c.env.DB, namespace.id, {
      displayName: nextDisplayName,
      role,
      status,
      lastActiveAt: existingMeta?.last_active_at ?? now,
      now,
    });

    const profileMeta = await upsertNamespaceProfileMeta(c.env.DB, namespace.id, {
      bio: parsed.data.bio,
      location: parsed.data.location,
      website: parsed.data.website,
      now,
    });

    log.info("profile:updated", {
      userId: viewer.userId,
      namespaceId: namespace.id,
      slug: namespace.slug,
    });

    return json({
      ok: true,
      displayName: nextDisplayName,
      bio: profileMeta.bio,
      location: profileMeta.location,
      website: profileMeta.website,
    } as const);
  });

  // POST /auth/demo-login: one-click Live Preview / Mock Mode admin sign-in.
  // Automatically disabled whenever `ADMIN_PASSWORD` is configured in env.
  router.post(`/auth/demo-login`, async (c) => {
    const log = c.var.logFor({ service: "AuthLogin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("auth:demo-login-same-origin-violation");
      return violation;
    }

    if (!isDemoModeEnabled(c.env)) {
      log.warn("auth:demo-login-disabled");
      return json({ error: "Demo login is disabled when ADMIN_PASSWORD is configured" }, 403);
    }

    const body = await readLoginPayload(c);
    const nextPath = sanitizeNextRedirect(body.next);
    const targetAccount = body.account === "user" ? "user" : "admin";

    const testUser = await ensureDemoTestUserSeeded({
      env: c.env,
      db: c.var.db,
      limiter: c.var.limiter,
      log,
    });

    if (targetAccount === "user") {
      const sessionConfig = loadSessionConfig(c.env);
      if (!sessionConfig.ok) {
        log.warn("auth:demo-user-session-config-missing", { reason: sessionConfig.reason });
        return authErrorRedirect(c, "session_create_failed", nextPath);
      }
      const now = Date.now();
      await touchDirectoryLastActive(c.env.DB, testUser.namespaceId, now);
      try {
        await createSessionForUser(c.env, c, testUser.userId, now);
      } catch (error) {
        log.error("auth:demo-user-session-create-failed", { error: String(error) });
        return authErrorRedirect(c, "session_create_failed", nextPath);
      }
      const destination =
        nextPath === "/admin" || nextPath.startsWith("/admin/") ? "/user/profile" : nextPath;
      log.info("auth:demo-user-login-success", {
        userId: testUser.userId,
        namespaceSlug: testUser.namespaceSlug,
      });
      return safeRedirect(c, destination, 303);
    }

    const config = resolveAdminAuthConfig(c.env);

    const sessionResult = await provisionAdminSession({
      c,
      subject: buildLocalAccountSubject(config.username),
      namespaceSlug: deriveNamespaceSlugForAdmin(config.username),
      seedDemoRepos: true,
    });

    if (!sessionResult.ok) {
      return authErrorRedirect(c, sessionResult.reason, nextPath);
    }

    return safeRedirect(c, nextPath, 303);
  });

  router.post(`/auth/sign-out`, async (c) => {
    const violation = sameOriginViolation(c);
    if (violation) return violation;
    await endSession(c);
    return safeRedirect(c, "/", 303);
  });
}
