import { validateSlugForRoute, type SlugValidation } from "@/shared/slugs";

export type DirectoryRole = "admin" | "member" | "viewer";
export type DirectoryStatus = "active" | "disabled";
export type AdminTokenScope = "read" | "read-write";
export type PatGrantLevel = "pull" | "push";
export type SidebarNavKey = "repositories" | "account" | "admin" | "admin-users";

export type AdminNamespaceEntry = {
  id: string;
  slug: string;
  displayName: string;
  role: DirectoryRole;
  status: DirectoryStatus;
  repoCount: number;
  createdAt: number;
  lastActiveAt: number;
  isPrimaryAdmin: boolean;
  hasPassword: boolean;
};

export type AdminRepositoryEntry = {
  id: string;
  slug: string;
  namespaceId: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  defaultBranch: string;
  pinned: boolean;
  homePinned: boolean;
  updatedAt: number;
};

export type AdminTokenEntry = {
  id: string;
  name: string;
  prefix: string;
  ownerSlug?: string;
  createdAt: number;
  revokedAt?: number;
  lastUsedAt?: number;
  scopeLabel: AdminTokenScope;
  targetLabel: string;
};

export type AdminOverviewMetrics = {
  totalRepositories: number;
  publicRepositories: number;
  privateRepositories: number;
  activeNamespaces: number;
  totalNamespaces: number;
  activeTokens: number;
  totalTokens: number;
};

export type AdminUserFilterCriteria = {
  query: string;
  role: "all" | DirectoryRole;
  status: "all" | DirectoryStatus;
};

export type AdminUserRoleCounts = {
  total: number;
  active: number;
  disabled: number;
  admins: number;
  members: number;
  viewers: number;
};

export type PasswordValidationResult =
  { ok: true; password: string } | { ok: false; reason: "too-short" | "too-long" };

export const DISPLAY_NAME_MAX_LENGTH = 80;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Normalizes a user-entered namespace handle (stripping leading `@`, trimming
 * whitespace, and lowercasing) and validates it against the shared slug policy.
 */
export function normalizeNamespaceHandle(raw: string): SlugValidation {
  const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
  return validateSlugForRoute(cleaned);
}

/**
 * Validates a user password length policy (8–128 characters).
 */
export function validateUserPassword(raw: string): PasswordValidationResult {
  if (typeof raw !== "string" || raw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "too-short" };
  }
  if (raw.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, password: raw };
}

const UPPER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER_CHARS = "abcdefghijkmnopqrstuvwxyz";
const DIGIT_CHARS = "23456789";
const SYMBOL_CHARS = "!@#$%^&*_-";
const ALL_PASSWORD_CHARS = `${UPPER_CHARS}${LOWER_CHARS}${DIGIT_CHARS}${SYMBOL_CHARS}`;

function pickRandomChar(alphabet: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return alphabet[buf[0]! % alphabet.length]!;
}

/**
 * Generates a strong, unambiguous temporary password using Web Crypto CSPRNG
 * suitable for one-time handoff from an administrator to a new user.
 */
export function generateTemporaryPassword(length: number = 16): string {
  const targetLen = Math.max(PASSWORD_MIN_LENGTH, Math.min(length, 32));
  const chars: string[] = [
    pickRandomChar(UPPER_CHARS),
    pickRandomChar(LOWER_CHARS),
    pickRandomChar(DIGIT_CHARS),
    pickRandomChar(SYMBOL_CHARS),
  ];
  while (chars.length < targetLen) {
    chars.push(pickRandomChar(ALL_PASSWORD_CHARS));
  }
  // Fisher-Yates shuffle using CSPRNG
  const rand = new Uint32Array(chars.length);
  crypto.getRandomValues(rand);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = rand[i]! % (i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}

/**
 * Role-based capability helpers shared across Worker routes and UI views.
 */
export function canAccessAdminPanel(role?: DirectoryRole): boolean {
  return role === "admin";
}

export function canWriteRepositories(role?: DirectoryRole): boolean {
  return role === "admin" || role === "member";
}

export type RepositoryPatchPolicyInput = {
  viewerRole?: DirectoryRole;
  isNamespaceMember: boolean;
  hasHomePinned: boolean;
  requestedHomePinned?: boolean;
  currentVisibility: "public" | "private";
  requestedVisibility?: "public" | "private";
};

export type RepositoryPatchPolicyResult =
  | { ok: true; effectiveVisibility: "public" | "private" }
  | {
      ok: false;
      status: 400 | 403;
      reason: "viewer-read-only" | "admin-required" | "not-member" | "private-repo-cannot-feature";
    };

/**
 * Authorizes repository metadata/visibility updates:
 * - Viewers are always read-only.
 * - Site admins (`role === "admin"`) can update any repository and manage
 *   main Public Homepage featuring (`homePinned`).
 * - Namespace members (`role === "member"`) can manage their own namespace
 *   repositories (`visibility`, `description`, `pinned`), but cannot modify
 *   `homePinned`.
 * - Private repositories cannot be pinned to the main Public Homepage.
 */
export function evaluateRepositoryPatchPolicy(
  input: RepositoryPatchPolicyInput
): RepositoryPatchPolicyResult {
  if (!canWriteRepositories(input.viewerRole)) {
    return { ok: false, status: 403, reason: "viewer-read-only" };
  }
  const isAdmin = canAccessAdminPanel(input.viewerRole);
  if (input.hasHomePinned && !isAdmin) {
    return { ok: false, status: 403, reason: "admin-required" };
  }
  if (!input.isNamespaceMember && !isAdmin) {
    return { ok: false, status: 403, reason: "not-member" };
  }
  const effectiveVisibility = input.requestedVisibility ?? input.currentVisibility;
  if (input.requestedHomePinned === true && effectiveVisibility === "private") {
    return { ok: false, status: 400, reason: "private-repo-cannot-feature" };
  }
  return { ok: true, effectiveVisibility };
}

export type HomeFeaturedCandidate = {
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  homePinned?: boolean;
  updatedAt: number;
};

/**
 * Selects repositories featured in the main Public Homepage "Pinned Repositories"
 * section. Only public repositories explicitly pinned for the homepage are
 * included, ordered most-recently-updated first with deterministic slug tie-break.
 */
export function selectHomeFeaturedRepositories<T extends HomeFeaturedCandidate>(
  repositories: readonly T[]
): T[] {
  return repositories
    .filter((repo) => repo.visibility === "public" && Boolean(repo.homePinned))
    .sort((a, b) => {
      const timeDiff = b.updatedAt - a.updatedAt;
      if (timeDiff !== 0) return timeDiff;
      return `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`);
    });
}

export function countHomeFeaturedRepositories(
  repositories: readonly HomeFeaturedCandidate[]
): number {
  let count = 0;
  for (const repo of repositories) {
    if (repo.visibility === "public" && repo.homePinned) {
      count += 1;
    }
  }
  return count;
}

/**
 * Derives a clean default display name when none has been explicitly set.
 */
export function defaultDisplayNameForSlug(slug: string): string {
  if (slug === "admin") return "Administrator";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Normalizes a user display name by trimming, collapsing internal whitespace,
 * stripping control characters, and capping length. Falls back to the derived
 * slug name when empty.
 */
export function sanitizeDisplayName(raw: string, fallbackSlug: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : defaultDisplayNameForSlug(fallbackSlug);
}

/**
 * Builds the canonical HTTPS Git clone URL for a repository.
 */
export function buildGitCloneUrl(origin: string, namespaceSlug: string, repoSlug: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return `${normalizedOrigin}/${namespaceSlug}/${repoSlug}.git`;
}

/**
 * Resolves the public profile URL for a namespace. Because `/admin` hosts Site
 * Administration, the `admin` namespace uses `/profile/admin` while all other
 * namespaces use their top-level `/:owner` path.
 */
export function buildNamespaceProfileHref(namespaceSlug: string): string {
  return namespaceSlug === "admin" ? "/profile/admin" : `/${encodeURIComponent(namespaceSlug)}`;
}

/**
 * Generates a starter `profile/README.md` template modeled after GitHub Org
 * `.github/profile/README.md` files for `.vibtools` repositories.
 */
export function buildDefaultProfileReadmeTemplate(
  namespaceSlug: string,
  displayName?: string
): string {
  const heading =
    displayName && displayName.trim().length > 0 ? displayName.trim() : `@${namespaceSlug}`;
  return [
    `# ${heading}`,
    "",
    `Welcome to **@${namespaceSlug}** — building and hosting projects on \`git-on-cloudflare\`.`,
    "",
    "## Highlights",
    "",
    "- **Core stack:** Cloudflare Workers, Durable Objects, R2 packs, and D1 metadata",
    "- **Repositories:** Browse public repositories below or clone directly over HTTPS",
    "",
    "## Getting Started",
    "",
    "```bash",
    `git clone https://example.com/${namespaceSlug}/<repo>.git`,
    "```",
    "",
  ].join("\n");
}

export const REPO_DESCRIPTION_MAX_LENGTH = 200;
export const PROFILE_BIO_MAX_LENGTH = 200;
export const PROFILE_LOCATION_MAX_LENGTH = 60;
export const PROFILE_WEBSITE_MAX_LENGTH = 160;
export const PROFILE_COMMIT_EMAIL_MAX_LENGTH = 120;

const COMMIT_EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function normalizeSingleLineText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeRepoDescription(raw: string): string {
  return normalizeSingleLineText(raw, REPO_DESCRIPTION_MAX_LENGTH);
}

export function sanitizeProfileBio(raw: string): string {
  return normalizeSingleLineText(raw, PROFILE_BIO_MAX_LENGTH);
}

export function sanitizeProfileLocation(raw: string): string {
  return normalizeSingleLineText(raw, PROFILE_LOCATION_MAX_LENGTH);
}

export function validateCommitEmailInput(
  raw: string
): { ok: true; email: string } | { ok: false; reason: "invalid-commit-email" } {
  if (typeof raw !== "string") {
    return { ok: true, email: "" };
  }
  if (/[\u0000-\u001f\u007f<>]/.test(raw)) {
    return { ok: false, reason: "invalid-commit-email" };
  }
  const trimmed = raw.trim().slice(0, PROFILE_COMMIT_EMAIL_MAX_LENGTH);
  if (!trimmed) {
    return { ok: true, email: "" };
  }
  if (!COMMIT_EMAIL_RE.test(trimmed)) {
    return { ok: false, reason: "invalid-commit-email" };
  }
  return { ok: true, email: trimmed };
}

export function sanitizeCommitEmail(raw: string): string {
  const checked = validateCommitEmailInput(raw);
  return checked.ok ? checked.email : "";
}

/**
 * Sanitizes an optional profile website URL, accepting only http/https schemes.
 */
export function sanitizeProfileWebsite(raw: string): string {
  const trimmed = normalizeSingleLineText(raw, PROFILE_WEBSITE_MAX_LENGTH);
  if (!trimmed) return "";
  if (
    /^(javascript|data|vbscript|file|mailto|tel):/i.test(trimmed) ||
    (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed))
  ) {
    return "";
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      return "";
    }
    return parsed.toString().replace(/\/$/, "") === parsed.origin
      ? parsed.origin
      : parsed.toString();
  } catch {
    return "";
  }
}

/**
 * Generates a starter `README.md` when creating a regular repository with
 * "Initialize with README.md" enabled.
 */
export function buildDefaultRepoReadmeTemplate(
  namespaceSlug: string,
  repoSlug: string,
  description?: string
): string {
  const cleanDesc = description ? sanitizeRepoDescription(description) : "";
  const lines = [`# ${repoSlug}`, ""];
  if (cleanDesc) {
    lines.push(cleanDesc, "");
  } else {
    lines.push(`Repository hosted under \`@${namespaceSlug}\`.`, "");
  }
  lines.push(
    "## Getting Started",
    "",
    "```bash",
    `# Clone this repository`,
    `git clone <clone-url>`,
    "```",
    ""
  );
  return lines.join("\n");
}

/**
 * Maps compact admin UI scope choices (`read` / `read-write`) to the D1 PAT
 * grant level (`pull` / `push`).
 */
export function mapScopeToPatLevel(scope: AdminTokenScope): PatGrantLevel {
  return scope === "read-write" ? "push" : "pull";
}

/**
 * Maps D1 PAT grant levels (`pull` / `push`) back to compact UI scope labels.
 */
export function formatPatScopeLabel(level: PatGrantLevel): AdminTokenScope {
  return level === "push" ? "read-write" : "read";
}

/**
 * Enforces guardrails on mutating directory entries:
 * - The currently signed-in primary admin cannot be disabled, demoted, or removed.
 * - Any non-primary user entry can be edited, toggled, or removed with confirmation.
 */
export function canToggleNamespaceStatus(entry: { id: string; isPrimaryAdmin: boolean }): boolean {
  return !entry.isPrimaryAdmin;
}

export function canRemoveNamespaceEntry(entry: {
  id: string;
  role: DirectoryRole;
  isPrimaryAdmin: boolean;
}): boolean {
  return !entry.isPrimaryAdmin;
}

export type PrimaryAdminPatchInput = {
  isPrimaryAdmin: boolean;
  status?: DirectoryStatus;
  role?: DirectoryRole;
  hasPasswordChange: boolean;
  passwordManagedByEnv?: boolean;
};

/**
 * Validates directory patch requests against primary-admin protections:
 * - Primary admin can rename their public `@namespace` handle and display name
 *   without altering their private env sign-in username.
 * - Primary admin cannot be disabled or demoted from `admin`.
 * - Password overrides are blocked when credentials come from env/demo, while
 *   D1-claimed primary admin credentials (`passwordManagedByEnv === false`) may
 *   update their D1 password hash.
 */
export function evaluatePrimaryAdminPatchPolicy(
  input: PrimaryAdminPatchInput
): { ok: true } | { ok: false; reason: "protected-admin" } {
  if (!input.isPrimaryAdmin) {
    return { ok: true };
  }
  const wantsDisable = input.status !== undefined && input.status !== "active";
  const wantsDemote = input.role !== undefined && input.role !== "admin";
  const blockPassword = input.passwordManagedByEnv ?? true;
  if (wantsDisable || wantsDemote || (blockPassword && input.hasPasswordChange)) {
    return { ok: false, reason: "protected-admin" };
  }
  return { ok: true };
}

/**
 * Filters users by free-text query (matching `@handle`, `handle`, or display name),
 * role, and active/disabled status.
 */
export function filterAdminUsers(
  users: readonly AdminNamespaceEntry[],
  criteria: AdminUserFilterCriteria
): AdminNamespaceEntry[] {
  const q = criteria.query.trim().toLowerCase().replace(/^@+/, "");
  return users.filter((user) => {
    if (criteria.role !== "all" && user.role !== criteria.role) return false;
    if (criteria.status !== "all" && user.status !== criteria.status) return false;
    if (!q) return true;
    const slugMatch = user.slug.toLowerCase().includes(q);
    const nameMatch = user.displayName.toLowerCase().includes(q);
    return slugMatch || nameMatch;
  });
}

/**
 * Computes summary counters for the dedicated Users workspace.
 */
export function computeUserRoleCounts(
  users: readonly Pick<AdminNamespaceEntry, "role" | "status">[]
): AdminUserRoleCounts {
  let active = 0;
  let disabled = 0;
  let admins = 0;
  let members = 0;
  let viewers = 0;

  for (const user of users) {
    if (user.status === "active") active += 1;
    else disabled += 1;

    if (user.role === "admin") admins += 1;
    else if (user.role === "member") members += 1;
    else viewers += 1;
  }

  return {
    total: users.length,
    active,
    disabled,
    admins,
    members,
    viewers,
  };
}

/**
 * Computes the compact overview strip counters from live repository,
 * namespace, and PAT lists.
 */
export function computeAdminMetrics(
  repositories: readonly Pick<AdminRepositoryEntry, "visibility">[],
  namespaces: readonly Pick<AdminNamespaceEntry, "status">[],
  tokens: readonly Pick<AdminTokenEntry, "revokedAt">[]
): AdminOverviewMetrics {
  let publicRepositories = 0;
  let privateRepositories = 0;
  for (const repo of repositories) {
    if (repo.visibility === "public") publicRepositories += 1;
    else privateRepositories += 1;
  }

  let activeNamespaces = 0;
  for (const ns of namespaces) {
    if (ns.status === "active") activeNamespaces += 1;
  }

  let activeTokens = 0;
  for (const token of tokens) {
    if (!token.revokedAt) activeTokens += 1;
  }

  return {
    totalRepositories: repositories.length,
    publicRepositories,
    privateRepositories,
    activeNamespaces,
    totalNamespaces: namespaces.length,
    activeTokens,
    totalTokens: tokens.length,
  };
}

/**
 * Maps SSR view identifiers to the active item in the persistent left sidebar.
 */
export function resolveActiveSidebarItem(currentView?: string): SidebarNavKey | null {
  switch (currentView) {
    case "home":
    case "owner":
    case "overview":
    case "tree":
    case "blob":
    case "commit":
    case "commits":
    case "admin":
      return "repositories";
    case "account":
      return "account";
    case "system-admin":
    case "system-admin-repositories":
    case "system-admin-tokens":
    case "system-admin-settings":
    case "system-admin-security":
      return "admin";
    case "system-admin-users":
      return "admin-users";
    default:
      return null;
  }
}

export const GLOBAL_PAT_TARGET_VALUE = "__global__";
export const GLOBAL_PAT_TARGET_LABEL = "All namespaces";

/**
 * Only active `admin` accounts are permitted to mint or exercise
 * global ("All namespaces") Personal Access Tokens.
 */
export function canIssueGlobalPat(
  role: DirectoryRole,
  status: DirectoryStatus = "active"
): boolean {
  return role === "admin" && status === "active";
}

/**
 * Validates the HTTP Basic username presented alongside a global admin PAT.
 * Accepts either the target repository's namespace slug or any of the PAT
 * owner's own namespace slugs (case-insensitive), rejecting unrelated handles.
 */
export function isGlobalPatUsernameAllowed(args: {
  presentedUsername: string;
  targetNamespaceSlug?: string;
  ownerNamespaceSlugs: readonly string[];
}): boolean {
  const normalized = args.presentedUsername.trim().toLowerCase();
  if (!normalized) return false;
  if (args.targetNamespaceSlug && normalized === args.targetNamespaceSlug.trim().toLowerCase()) {
    return true;
  }
  return args.ownerNamespaceSlugs.some((slug) => slug.trim().toLowerCase() === normalized);
}
