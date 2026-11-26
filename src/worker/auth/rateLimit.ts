export const AUTH_RATE_LIMIT_MAX_FAILURES = 8;
export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 300;
const MIN_KV_TTL_SECONDS = 60;

export type AuthRateLimitScope = "login" | "change-password";

export type AuthRateLimitState = {
  failures: number;
  windowStartedAt: number;
};

export type AuthRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

/**
 * Evaluates whether an authentication attempt should be allowed under the
 * fixed sliding window starting at `windowStartedAt`.
 */
export function evaluateAuthRateLimit(
  state: AuthRateLimitState | null,
  nowMs: number,
  options?: {
    maxFailures?: number;
    windowSeconds?: number;
  }
): AuthRateLimitDecision {
  const maxFailures = options?.maxFailures ?? AUTH_RATE_LIMIT_MAX_FAILURES;
  const windowMs = (options?.windowSeconds ?? AUTH_RATE_LIMIT_WINDOW_SECONDS) * 1000;

  if (!state || !Number.isFinite(state.failures) || !Number.isFinite(state.windowStartedAt)) {
    return { allowed: true, retryAfterSeconds: 0, remaining: maxFailures };
  }

  const elapsedMs = nowMs - state.windowStartedAt;
  if (elapsedMs < 0 || elapsedMs >= windowMs) {
    return { allowed: true, retryAfterSeconds: 0, remaining: maxFailures };
  }

  if (state.failures >= maxFailures) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));
    return { allowed: false, retryAfterSeconds, remaining: 0 };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, maxFailures - state.failures),
  };
}

/**
 * Increments a failure counter inside the current window or starts a fresh
 * window when expired or absent.
 */
export function recordAuthRateLimitFailure(
  state: AuthRateLimitState | null,
  nowMs: number,
  options?: {
    windowSeconds?: number;
  }
): AuthRateLimitState {
  const windowMs = (options?.windowSeconds ?? AUTH_RATE_LIMIT_WINDOW_SECONDS) * 1000;
  if (
    !state ||
    !Number.isFinite(state.failures) ||
    !Number.isFinite(state.windowStartedAt) ||
    nowMs < state.windowStartedAt ||
    nowMs - state.windowStartedAt >= windowMs
  ) {
    return { failures: 1, windowStartedAt: nowMs };
  }
  return {
    failures: state.failures + 1,
    windowStartedAt: state.windowStartedAt,
  };
}

export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;
  return "unknown";
}

export function buildAuthRateLimitKey(
  scope: AuthRateLimitScope,
  ip: string,
  target: string
): string {
  const cleanIp = ip.trim().toLowerCase() || "unknown";
  const cleanTarget = target.trim().replace(/^@+/, "").toLowerCase() || "_";
  return `auth-rl:${scope}:${cleanIp}:${cleanTarget}`;
}

function parseState(raw: string | null): AuthRateLimitState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "failures" in parsed &&
      "windowStartedAt" in parsed &&
      typeof parsed.failures === "number" &&
      typeof parsed.windowStartedAt === "number"
    ) {
      return { failures: parsed.failures, windowStartedAt: parsed.windowStartedAt };
    }
  } catch {
    // Corrupted KV entry resets cleanly to allow normal evaluation.
  }
  return null;
}

export async function checkAuthRateLimit(
  env: Pick<Partial<Env>, "ROUTES">,
  key: string,
  nowMs: number = Date.now()
): Promise<AuthRateLimitDecision> {
  const kv = env.ROUTES;
  if (!kv || typeof kv.get !== "function") {
    return evaluateAuthRateLimit(null, nowMs);
  }
  try {
    const raw = await kv.get(key);
    return evaluateAuthRateLimit(parseState(raw), nowMs);
  } catch {
    return evaluateAuthRateLimit(null, nowMs);
  }
}

export async function bumpAuthRateLimitFailure(
  env: Pick<Partial<Env>, "ROUTES">,
  key: string,
  nowMs: number = Date.now()
): Promise<void> {
  const kv = env.ROUTES;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return;
  }
  try {
    const current = parseState(await kv.get(key));
    const next = recordAuthRateLimitFailure(current, nowMs);
    const expirationTtl = Math.max(MIN_KV_TTL_SECONDS, AUTH_RATE_LIMIT_WINDOW_SECONDS);
    await kv.put(key, JSON.stringify(next), { expirationTtl });
  } catch {
    // Best-effort throttling should not crash request handling if KV blips.
  }
}

export async function clearAuthRateLimit(
  env: Pick<Partial<Env>, "ROUTES">,
  key: string
): Promise<void> {
  const kv = env.ROUTES;
  if (!kv || typeof kv.delete !== "function") {
    return;
  }
  try {
    await kv.delete(key);
  } catch {
    // Best-effort cleanup.
  }
}
