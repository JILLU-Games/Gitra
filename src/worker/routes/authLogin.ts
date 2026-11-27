import {
  canAccessAdminPanel,
  normalizeNamespaceHandle,
  sanitizeDisplayName,
  validateCommitEmailInput,
  validateUserPassword,
} from "@/shared/admin/panel";
import { safeParseJsonRequest } from "@/shared/web";
import {
  buildLocalAccountSubject,
  DEFAULT_DEMO_ADMIN_PASSWORD,
  DEFAULT_DEMO_USER_PASSWORD,
  DEFAULT_DEMO_USER_USERNAME,
  DEFAULT_POST_LOGIN_REDIRECT,
  isDemoModeEnabled,
  isProductionRuntime,
  resolveAdminAuthConfig,
  resolveInitialAdminNamespaceSlug,
  sanitizeNextRedirect,
  verifyAdminCredentials,
} from "@/worker/auth/adminAuth";
import { ensureDemoRepositoriesSeeded, ensureDemoTestUserSeeded } from "@/worker/auth/demoSeed";
import { sameOriginViolation } from "@/worker/auth/origin";
import { hashPassword, verifyPassword } from "@/worker/auth/passwords";
import {
  buildAuthRateLimitKey,
  bumpAuthRateLimitFailure,
  checkAuthRateLimit,
  clearAuthRateLimit,
  extractClientIp,
} from "@/worker/auth/rateLimit";
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
  findPrimaryAdminNamespace,
  findUserBySubject,
  hasAnyRegisteredUsers,
  insertMembershipIfMissing,
  insertUserIfNew,
  resolvePrimaryAdminUser,
  touchDirectoryLastActive,
  updateDirectoryDisplayName,
  updateDirectoryPasswordHash,
} from "@/worker/db/d1/dal";
import { upsertNamespaceProfileMeta } from "@/worker/db/d1/dal";
import type { AppContext, AppRouter } from "./hono";
import {
  AdminLoginRequestSchema,
  ChangePasswordRequestSchema,
  ProductionSetupRequestSchema,
  ProfileMetaUpdateRequestSchema,
} from "./requestSchemas";
import { safeRedirect } from "./authShared";
import { renderUiDocumentResponse } from "./uiResponse";

function authErrorRedirect(
  c: AppContext,
  code: string,
  nextPath?: string,
  extraHeaders?: Record<string, string>
): Response {
  const params = new URLSearchParams({ error: code });
  if (nextPath && nextPath !== DEFAULT_POST_LOGIN_REDIRECT) {
    params.set("next", nextPath);
  }
  const response = safeRedirect(c, `/auth?${params.toString()}`, 303);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

function wantsJsonAuthResponse(c: AppContext): boolean {
  const accept = (c.req.header("accept") || "").toLowerCase();
  return accept.includes("application/json") && !accept.includes("text/html");
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

async function readSetupPayload(c: AppContext): Promise<{
  username: string;
  displayName?: string;
  password: string;
  confirmPassword: string;
  next: string;
}> {
  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = ProductionSetupRequestSchema.safeParse(rawBody);
    if (parsed.success) return parsed.data;
    return { username: "", password: "", confirmPassword: "", next: "" };
  }
  try {
    const form = await c.req.parseBody();
    const parsed = ProductionSetupRequestSchema.safeParse(form);
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to empty payload so field validation surfaces invalid_username.
  }
  return { username: "", password: "", confirmPassword: "", next: "" };
}

async function provisionAdminSession(args: {
  c: AppContext;
  subject: string;
  initialNamespaceSlug: string;
  seedDemoRepos: boolean;
}): Promise<{ ok: true; userId: string } | { ok: false; reason: "session_create_failed" }> {
  const { c, subject, initialNamespaceSlug, seedDemoRepos } = args;
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

  // Reuse the primary admin's existing namespace (preserving renames such as
  // `@vibtools`), only claiming `initialNamespaceSlug` if none exists yet.
  let namespaceId: string | null = null;
  let effectiveNamespaceSlug = initialNamespaceSlug;
  const existingOwnedNamespace = await findPrimaryAdminNamespace(db, subject);
  if (existingOwnedNamespace) {
    namespaceId = existingOwnedNamespace.id;
    effectiveNamespaceSlug = existingOwnedNamespace.slug;
  } else {
    const claimed = await claimNamespace(db, {
      id: generateNamespaceId(),
      slug: initialNamespaceSlug,
      createdBy: userId,
      createdAt: now,
    });
    if (claimed) {
      namespaceId = claimed.id;
      effectiveNamespaceSlug = claimed.slug;
    } else {
      const existingNamespace = await findNamespaceBySlug(db, initialNamespaceSlug);
      if (existingNamespace && existingNamespace.createdBy === userId) {
        namespaceId = existingNamespace.id;
        effectiveNamespaceSlug = existingNamespace.slug;
      }
    }
  }

  if (namespaceId) {
    await insertMembershipIfMissing(db, {
      namespaceId,
      userId,
      createdAt: now,
    });

    if (!import.meta.env.PROD && seedDemoRepos) {
      await ensureDemoRepositoriesSeeded({
        env: c.env,
        db,
        limiter: c.var.limiter,
        log,
        userId,
        namespaceId,
        namespaceSlug: effectiveNamespaceSlug,
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

  log.info("auth:login-success", {
    userId,
    namespaceSlug: effectiveNamespaceSlug,
    seedDemoRepos,
  });
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
      const demoMode = !import.meta.env.PROD && authConfig.mode === "demo";
      const productionRuntime = !demoMode && isProductionRuntime(c.env);
      const sessionOk = loadSessionConfig(c.env).ok;
      const needsSetup =
        productionRuntime &&
        authConfig.password === null &&
        sessionOk &&
        !(await hasAnyRegisteredUsers(c.env.DB));
      const sessionMissing = productionRuntime && !sessionOk;

      return await renderUiDocumentResponse(
        c.env,
        "auth-signin",
        {
          errorCode,
          demoMode,
          needsSetup,
          sessionMissing,
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

    const clientIp = extractClientIp(c.req.raw);
    const rateLimitKey = buildAuthRateLimitKey("login", clientIp, body.username);
    const rateLimit = await checkAuthRateLimit(c.env, rateLimitKey, Date.now(), log);
    if (!rateLimit.allowed) {
      log.warn("auth:login-rate-limited", {
        ip: clientIp,
        retryAfter: rateLimit.retryAfterSeconds,
      });
      if (wantsJsonAuthResponse(c)) {
        return json(
          { error: "Too many failed sign-in attempts", retryAfter: rateLimit.retryAfterSeconds },
          429,
          { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" }
        );
      }
      return authErrorRedirect(c, "rate_limited", nextPath, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    // 1. Primary admin credential path (demo mode or configured env secret)
    const verifiedAdmin = await verifyAdminCredentials(c.env, body.username, body.password);
    if (verifiedAdmin.ok) {
      const sessionResult = await provisionAdminSession({
        c,
        subject: verifiedAdmin.subject,
        initialNamespaceSlug: verifiedAdmin.namespaceSlug,
        seedDemoRepos: !import.meta.env.PROD && verifiedAdmin.mode === "demo",
      });

      if (!sessionResult.ok) {
        return authErrorRedirect(c, sessionResult.reason, nextPath);
      }
      await clearAuthRateLimit(c.env, rateLimitKey, log);
      return safeRedirect(c, nextPath, 303);
    }

    // 2. Directory user account lookup by handle (`@slug` or `slug`).
    // When `ADMIN_PASSWORD` is configured in env (or demo mode), primary admin
    // accounts cannot sign in via their public `@namespace` handle—only via
    // `ADMIN_USERNAME` above. When `ADMIN_PASSWORD` is unset in production and
    // the initial admin was claimed in D1 via `/auth/setup`, D1 PBKDF2 auth
    // authorizes that account.
    const normalizedHandle = body.username.trim().replace(/^@+/, "").toLowerCase();
    if (
      !import.meta.env.PROD &&
      normalizedHandle === DEFAULT_DEMO_USER_USERNAME &&
      isDemoModeEnabled(c.env)
    ) {
      await ensureDemoTestUserSeeded({
        env: c.env,
        db: c.var.db,
        limiter: c.var.limiter,
        log,
      });
    }
    const authConfig = resolveAdminAuthConfig(c.env);
    const [account, primaryAdminUser] = await Promise.all([
      normalizedHandle
        ? findDirectoryAccountBySlug(c.env.DB, c.var.db, normalizedHandle)
        : Promise.resolve(null),
      resolvePrimaryAdminUser(c.env.DB, c.var.db, c.env),
    ]);
    const isPrimaryAdminAccount = Boolean(
      account && primaryAdminUser && account.userId === primaryAdminUser.id
    );
    const allowD1AdminPassword = authConfig.password === null;

    if (account && (!isPrimaryAdminAccount || allowD1AdminPassword) && account.passwordHash) {
      const passwordOk = await verifyPassword(body.password, account.passwordHash);
      if (passwordOk) {
        if (account.status === "disabled") {
          await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
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
          await createSessionForUser(c.env, c, account.userId, now, account.sessionEpoch);
        } catch (error) {
          log.error("auth:login-session-create-failed", { error: String(error) });
          return authErrorRedirect(c, "session_create_failed", nextPath);
        }

        await clearAuthRateLimit(c.env, rateLimitKey, log);
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

    await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
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

    if (viewer.isPrimaryAdmin && resolveAdminAuthConfig(c.env).password !== null) {
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

    const clientIp = extractClientIp(c.req.raw);
    const rateLimitKey = buildAuthRateLimitKey("change-password", clientIp, viewer.userId);
    const rateLimit = await checkAuthRateLimit(c.env, rateLimitKey, Date.now(), log);
    if (!rateLimit.allowed) {
      log.warn("auth:change-password-rate-limited", {
        userId: viewer.userId,
        retryAfter: rateLimit.retryAfterSeconds,
      });
      return json(
        {
          ok: false,
          reason: "rate-limited",
          retryAfter: rateLimit.retryAfterSeconds,
        } as const,
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" }
      );
    }

    const matchesCurrent = await verifyPassword(currentPassword, account.passwordHash);
    if (!matchesCurrent) {
      await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
      log.warn("auth:change-password-invalid-current", { userId: viewer.userId });
      return json({ ok: false, reason: "invalid-current-password" } as const, 400);
    }

    await clearAuthRateLimit(c.env, rateLimitKey, log);
    const now = Date.now();
    const nextHash = await hashPassword(newValidation.password);
    const { sessionEpoch } = await updateDirectoryPasswordHash(
      c.env.DB,
      account.namespaceId,
      nextHash,
      now
    );

    // Refresh the caller's session cookie with the bumped sessionEpoch while
    // invalidating all prior session cookies for this account.
    try {
      await createSessionForUser(c.env, c, viewer.userId, now, sessionEpoch);
    } catch (error) {
      log.warn("auth:change-password-session-refresh-failed", {
        userId: viewer.userId,
        error: String(error),
      });
    }

    log.info("auth:change-password-success", {
      userId: viewer.userId,
      namespaceId: account.namespaceId,
      sessionEpoch,
    });

    const response = json({ ok: true } as const);
    c.res.headers.forEach((value, key) => {
      response.headers.append(key, value);
    });
    return response;
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

    let validatedCommitEmail: string | undefined;
    if (parsed.data.commitEmail !== undefined) {
      const emailCheck = validateCommitEmailInput(parsed.data.commitEmail);
      if (!emailCheck.ok) {
        return json({ ok: false, reason: emailCheck.reason } as const, 400);
      }
      validatedCommitEmail = emailCheck.email;
    }

    const now = Date.now();
    const nextDisplayName = sanitizeDisplayName(
      parsed.data.displayName ?? viewer.displayName ?? namespace.slug,
      namespace.slug
    );
    const fallbackRole = viewer.isPrimaryAdmin ? "admin" : viewer.role;
    const fallbackStatus = "active";

    await updateDirectoryDisplayName(c.env.DB, namespace.id, {
      displayName: nextDisplayName,
      fallbackRole,
      fallbackStatus,
      lastActiveAt: now,
      now,
    });

    const profileMeta = await upsertNamespaceProfileMeta(c.env.DB, namespace.id, {
      bio: parsed.data.bio,
      location: parsed.data.location,
      website: parsed.data.website,
      commitEmail: validatedCommitEmail,
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
      commitEmail: profileMeta.commitEmail,
    } as const);
  });

  // POST /auth/setup: one-time initial Production Admin claim when running in
  // Production Mode without an env `ADMIN_PASSWORD` and with an empty D1 users
  // table. Locks itself permanently as soon as any user exists in D1.
  router.post(`/auth/setup`, async (c) => {
    const log = c.var.logFor({ service: "AuthSetup" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("auth:setup-same-origin-violation");
      return violation;
    }

    const authConfig = resolveAdminAuthConfig(c.env);
    if (!isProductionRuntime(c.env) || authConfig.password !== null) {
      return json({ error: "Initial production setup is unavailable" }, 403);
    }

    const body = await readSetupPayload(c);
    const nextPath = sanitizeNextRedirect(body.next);

    const sessionConfig = loadSessionConfig(c.env);
    if (!sessionConfig.ok) {
      log.warn("auth:setup-session-config-missing", { reason: sessionConfig.reason });
      return authErrorRedirect(c, "session_create_failed", nextPath);
    }

    const clientIp = extractClientIp(c.req.raw);
    const rateLimitKey = buildAuthRateLimitKey("setup", clientIp, "initial-admin");
    const rateLimit = await checkAuthRateLimit(c.env, rateLimitKey, Date.now(), log);
    if (!rateLimit.allowed) {
      return authErrorRedirect(c, "rate_limited", nextPath, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    if (await hasAnyRegisteredUsers(c.env.DB)) {
      await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
      log.warn("auth:setup-already-claimed");
      return authErrorRedirect(c, "setup_locked", nextPath);
    }

    const handleCheck = normalizeNamespaceHandle(body.username);
    if (!handleCheck.ok) {
      await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
      return authErrorRedirect(c, "invalid_username", nextPath);
    }

    if (body.password !== body.confirmPassword) {
      await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
      return authErrorRedirect(c, "password_mismatch", nextPath);
    }

    const pwValidation = validateUserPassword(body.password);
    if (!pwValidation.ok) {
      await bumpAuthRateLimitFailure(c.env, rateLimitKey, Date.now(), log);
      return authErrorRedirect(c, "weak_password", nextPath);
    }

    const now = Date.now();
    const userId = generateUserId();
    const namespaceId = generateNamespaceId();
    const subject = buildLocalAccountSubject(handleCheck.slug);
    const passwordHash = await hashPassword(pwValidation.password);
    const displayName = sanitizeDisplayName(body.displayName || handleCheck.slug, handleCheck.slug);

    // Execute all initial-admin D1 inserts in a single atomic batch so a
    // mid-flight error rolls back cleanly and never strands a partial user row
    // that permanently locks `/auth/setup`.
    try {
      const results = await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO users (id, tessera_sub, created_at)
           SELECT ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1)`
        ).bind(userId, subject, now),
        c.env.DB.prepare(
          `INSERT INTO namespaces (id, slug, created_by, created_at)
           VALUES (?, ?, ?, ?)`
        ).bind(namespaceId, handleCheck.slug, userId, now),
        c.env.DB.prepare(
          `INSERT INTO namespace_memberships (namespace_id, user_id, created_at)
           VALUES (?, ?, ?)`
        ).bind(namespaceId, userId, now),
        c.env.DB.prepare(
          `INSERT INTO namespace_directory_meta (
             namespace_id, display_name, role, status, password_hash, session_epoch, last_active_at, updated_at
           ) VALUES (?, ?, 'admin', 'active', ?, 1, ?, ?)`
        ).bind(namespaceId, displayName, passwordHash, now, now),
      ]);
      if ((results[0]?.meta?.changes ?? 0) === 0) {
        log.warn("auth:setup-concurrent-claim");
        return authErrorRedirect(c, "setup_locked", nextPath);
      }
    } catch (error) {
      const alreadyClaimed = await hasAnyRegisteredUsers(c.env.DB).catch(() => false);
      if (alreadyClaimed) {
        log.warn("auth:setup-already-claimed-batch", { error: String(error) });
        return authErrorRedirect(c, "setup_locked", nextPath);
      }
      log.error("auth:setup-batch-failed", { error: String(error) });
      return authErrorRedirect(c, "setup_failed", nextPath);
    }

    try {
      await createSessionForUser(c.env, c, userId, now, 1);
    } catch (error) {
      log.error("auth:setup-session-create-failed", { error: String(error) });
      return authErrorRedirect(c, "session_create_failed", nextPath);
    }

    await clearAuthRateLimit(c.env, rateLimitKey, log);
    log.info("auth:production-admin-claimed", {
      userId,
      namespaceSlug: handleCheck.slug,
    });
    return safeRedirect(c, nextPath, 303);
  });

  // POST /auth/demo-login: one-click local Development / Demo Mode sign-in.
  // Compile-time eliminated in Production builds (`import.meta.env.PROD`), and
  // disabled when `AUTH_MODE=production` or whenever `ADMIN_PASSWORD` is set.
  router.post(`/auth/demo-login`, async (c) => {
    const log = c.var.logFor({ service: "AuthLogin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("auth:demo-login-same-origin-violation");
      return violation;
    }

    if (import.meta.env.PROD || !isDemoModeEnabled(c.env)) {
      log.warn("auth:demo-login-disabled");
      return json({ error: "Demo login is disabled in production mode" }, 403);
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
      initialNamespaceSlug: resolveInitialAdminNamespaceSlug(c.env),
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
