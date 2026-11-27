import type { Logger } from "@/worker/common/logger";

export const AUTH_RATE_LIMIT_MAX_FAILURES = 8;
export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 300;
const MIN_KV_TTL_SECONDS = 60;
const MAX_LOCAL_RATE_LIMIT_ENTRIES = 2048;

export type AuthRateLimitScope = "login" | "setup" | "change-password";

export type AuthRateLimitState = {
  failures: number;
  windowStartedAt: number;
};

export type AuthRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

const localRateLimitStates = new Map<string, AuthRateLimitState>();

function isWindowActive(
  state: AuthRateLimitState | null,
  nowMs: number,
  windowMs: number
): boolean {
  if (!state || !Number.isFinite(state.failures) || !Number.isFinite(state.windowStartedAt)) {
    return false;
  }
  const elapsedMs = nowMs - state.windowStartedAt;
  return elapsedMs >= 0 && elapsedMs < windowMs;
}

/**
 * Merges two active rate-limit snapshots (for example isolate-local and KV)
 * without resetting accumulated failures during concurrent bursts.
 */
export function mergeRateLimitStates(
  first: AuthRateLimitState | null,
  second: AuthRateLimitState | null,
  nowMs: number,
  options?: { windowSeconds?: number }
): AuthRateLimitState | null {
  const windowMs = (options?.windowSeconds ?? AUTH_RATE_LIMIT_WINDOW_SECONDS) * 1000;
  const firstActive = isWindowActive(first, nowMs, windowMs) ? first : null;
  const secondActive = isWindowActive(second, nowMs, windowMs) ? second : null;
  if (!firstActive) return secondActive;
  if (!secondActive) return firstActive;
  return {
    failures: Math.max(firstActive.failures, secondActive.failures),
    windowStartedAt: Math.min(firstActive.windowStartedAt, secondActive.windowStartedAt),
  };
}

function readLocalRateLimitState(key: string, nowMs: number): AuthRateLimitState | null {
  const state = localRateLimitStates.get(key) ?? null;
  if (!state) return null;
  const windowMs = AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000;
  if (!isWindowActive(state, nowMs, windowMs)) {
    localRateLimitStates.delete(key);
    return null;
  }
  return state;
}

function writeLocalRateLimitState(key: string, state: AuthRateLimitState, nowMs: number): void {
  if (localRateLimitStates.size >= MAX_LOCAL_RATE_LIMIT_ENTRIES && !localRateLimitStates.has(key)) {
    const windowMs = AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000;
    for (const [candidateKey, candidateState] of localRateLimitStates) {
      if (!isWindowActive(candidateState, nowMs, windowMs)) {
        localRateLimitStates.delete(candidateKey);
      }
      if (localRateLimitStates.size < MAX_LOCAL_RATE_LIMIT_ENTRIES) break;
    }
    if (localRateLimitStates.size >= MAX_LOCAL_RATE_LIMIT_ENTRIES) {
      const oldestKey = localRateLimitStates.keys().next().value;
      if (oldestKey !== undefined) {
        localRateLimitStates.delete(oldestKey);
      }
    }
  }
  localRateLimitStates.set(key, state);
}

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
  nowMs: number = Date.now(),
  log?: Logger
): Promise<AuthRateLimitDecision> {
  const localState = readLocalRateLimitState(key, nowMs);
  const kv = env.ROUTES;
  if (!kv || typeof kv.get !== "function") {
    return evaluateAuthRateLimit(localState, nowMs);
  }
  try {
    const kvState = parseState(await kv.get(key));
    const merged = mergeRateLimitStates(localState, kvState, nowMs);
    if (merged) {
      writeLocalRateLimitState(key, merged, nowMs);
    }
    return evaluateAuthRateLimit(merged, nowMs);
  } catch (error) {
    log?.warn("auth:rate-limit-kv-read-failed", { key, error: String(error) });
    return evaluateAuthRateLimit(localState, nowMs);
  }
}

export async function bumpAuthRateLimitFailure(
  env: Pick<Partial<Env>, "ROUTES">,
  key: string,
  nowMs: number = Date.now(),
  log?: Logger
): Promise<void> {
  // Increment the isolate-local counter synchronously before any await so
  // concurrent requests in the same isolate cannot race past read-modify-write.
  const localNext = recordAuthRateLimitFailure(readLocalRateLimitState(key, nowMs), nowMs);
  writeLocalRateLimitState(key, localNext, nowMs);

  const kv = env.ROUTES;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return;
  }
  try {
    const kvCurrent = parseState(await kv.get(key));
    const kvNext = kvCurrent ? recordAuthRateLimitFailure(kvCurrent, nowMs) : null;
    const latestLocal = readLocalRateLimitState(key, nowMs);
    const mergedNext = mergeRateLimitStates(latestLocal, kvNext, nowMs) ?? localNext;
    writeLocalRateLimitState(key, mergedNext, nowMs);
    const expirationTtl = Math.max(MIN_KV_TTL_SECONDS, AUTH_RATE_LIMIT_WINDOW_SECONDS);
    await kv.put(key, JSON.stringify(mergedNext), { expirationTtl });
  } catch (error) {
    log?.warn("auth:rate-limit-kv-write-failed", { key, error: String(error) });
  }
}

export async function clearAuthRateLimit(
  env: Pick<Partial<Env>, "ROUTES">,
  key: string,
  log?: Logger
): Promise<void> {
  localRateLimitStates.delete(key);
  const kv = env.ROUTES;
  if (!kv || typeof kv.delete !== "function") {
    return;
  }
  try {
    await kv.delete(key);
  } catch (error) {
    log?.warn("auth:rate-limit-kv-delete-failed", { key, error: String(error) });
  }
}
