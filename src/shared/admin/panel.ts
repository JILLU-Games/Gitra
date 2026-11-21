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
  updatedAt: number;
};

export type AdminTokenEntry = {
  id: string;
  name: string;
  prefix: string;
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
  | { ok: true; password: string }
  | { ok: false; reason: "too-short" | "too-long" };

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
export function canToggleNamespaceStatus(entry: {
  id: string;
  isPrimaryAdmin: boolean;
}): boolean {
  return !entry.isPrimaryAdmin;
}

export function canRemoveNamespaceEntry(entry: {
  id: string;
  role: DirectoryRole;
  isPrimaryAdmin: boolean;
}): boolean {
  return !entry.isPrimaryAdmin;
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
      return "admin";
    case "system-admin-users":
      return "admin-users";
    default:
      return null;
  }
}
