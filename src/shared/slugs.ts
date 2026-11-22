// Shared slug policy used by namespace and repository slugs. Browser-safe so
// the same validator runs in SSR pages and Worker validation paths.
//
// Namespace handles enforce lowercase ASCII alphanumerics with internal dashes.
// Repository slugs allow lowercase ASCII alphanumerics, internal dashes, dots,
// underscores, and a single leading dot (e.g. `.vibtools` namespace profile
// repositories), while blocking path-traversal shapes and `.git` suffixes.

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const REPO_SLUG_PATTERN = /^\.?[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/;
export const SLUG_MAX_LENGTH = 40;

export const PROFILE_REPO_SLUG = ".vibtools";
export const PROFILE_README_PATH = "profile/README.md";
export const PROFILE_README_CANDIDATES: readonly string[] = [
  "profile/README.md",
  "profile/readme.md",
  "profile/README.MD",
  "profile/Readme.md",
  "profile/README",
  "profile/readme",
];

export const RESERVED_SLUGS: readonly string[] = [
  "auth",
  "user",
  "profile",
  "explore",
  "repo",
  "sign-in",
  "sign-out",
  "api",
  "assets",
  "_cache",
  "_routes",
  "favicon.ico",
  "robots.txt",
];

const reservedSet: ReadonlySet<string> = new Set(RESERVED_SLUGS);

export function isValidSlug(input: string): boolean {
  if (typeof input !== "string") return false;
  if (input.length === 0 || input.length > SLUG_MAX_LENGTH) return false;
  if (!SLUG_PATTERN.test(input)) return false;
  if (reservedSet.has(input)) return false;
  return true;
}

export type SlugValidation =
  { ok: true; slug: string } | { ok: false; reason: "format" | "reserved" | "length" };

// Granular result so the route handler can decide which message to surface
// (taken vs format vs reserved) without re-checking the regex.
export function validateSlugForRoute(input: string): SlugValidation {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, reason: "length" };
  }
  if (input.length > SLUG_MAX_LENGTH) return { ok: false, reason: "length" };
  if (reservedSet.has(input)) return { ok: false, reason: "reserved" };
  if (!SLUG_PATTERN.test(input)) return { ok: false, reason: "format" };
  return { ok: true, slug: input };
}

/**
 * Validates repository slugs. Permits dot-prefixed namespace profile
 * repositories (such as `.vibtools`) and dotted names while rejecting
 * traversal segments (`..`), trailing dots, `.git` suffixes, and reserved paths.
 */
export function validateRepoSlugForRoute(input: string): SlugValidation {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, reason: "length" };
  }
  if (input.length > SLUG_MAX_LENGTH) return { ok: false, reason: "length" };
  if (reservedSet.has(input)) return { ok: false, reason: "reserved" };
  if (input.includes("..") || input.endsWith(".git") || !REPO_SLUG_PATTERN.test(input)) {
    return { ok: false, reason: "format" };
  }
  return { ok: true, slug: input };
}

export function isValidRepoSlug(input: string): boolean {
  return validateRepoSlugForRoute(input).ok;
}

export function isProfileRepoSlug(slug: string): boolean {
  return slug === PROFILE_REPO_SLUG;
}
