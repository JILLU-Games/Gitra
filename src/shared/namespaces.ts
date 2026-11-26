export type PublicNamespaceDirectoryItem = {
  slug: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  publicRepoCount: number;
  projectRepoCount: number;
};

export type NamespaceDirectoryTotals = {
  totalNamespaces: number;
  activeOpenSourceNamespaces: number;
  totalPublicRepos: number;
  totalOpenSourceRepos: number;
};

/**
 * Orders public namespaces by open-source project repository count first, then
 * total public repositories (including `.vibtools` profile repos), and finally
 * alphabetically by slug for deterministic display.
 */
export function sortNamespaceDirectoryItems(
  items: readonly PublicNamespaceDirectoryItem[]
): PublicNamespaceDirectoryItem[] {
  return [...items].sort(
    (a, b) =>
      b.projectRepoCount - a.projectRepoCount ||
      b.publicRepoCount - a.publicRepoCount ||
      a.slug.localeCompare(b.slug)
  );
}

/**
 * Filters namespace directory entries against a normalized search query across
 * slug, display name, bio, and location.
 */
export function filterNamespaceDirectoryItems(
  items: readonly PublicNamespaceDirectoryItem[],
  rawQuery: string | undefined | null
): PublicNamespaceDirectoryItem[] {
  const query = (rawQuery ?? "").trim().toLowerCase();
  if (!query) return [...items];

  return items.filter((item) => {
    const haystack = `${item.slug} ${item.displayName} ${item.bio} ${item.location}`.toLowerCase();
    return haystack.includes(query);
  });
}

/**
 * Computes compact directory summary totals across all active namespaces.
 */
export function computeNamespaceDirectoryTotals(
  items: readonly PublicNamespaceDirectoryItem[]
): NamespaceDirectoryTotals {
  let activeOpenSourceNamespaces = 0;
  let totalPublicRepos = 0;
  let totalOpenSourceRepos = 0;

  for (const item of items) {
    if (item.publicRepoCount > 0) {
      activeOpenSourceNamespaces += 1;
    }
    totalPublicRepos += item.publicRepoCount;
    totalOpenSourceRepos += item.projectRepoCount;
  }

  return {
    totalNamespaces: items.length,
    activeOpenSourceNamespaces,
    totalPublicRepos,
    totalOpenSourceRepos,
  };
}

export function formatNamespaceWebsiteHost(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
