import {
  sanitizeCommitEmail,
  sanitizeDisplayName,
  sanitizeProfileBio,
  sanitizeProfileLocation,
  sanitizeProfileWebsite,
  sanitizeRepoDescription,
} from "@/shared/admin/panel";
import {
  sortNamespaceDirectoryItems,
  type PublicNamespaceDirectoryItem,
} from "@/shared/namespaces";
import { PROFILE_REPO_SLUG } from "@/shared/slugs";
import type { Db } from "@/worker/db/d1/client";
import { namespaces } from "@/worker/db/d1/schema/namespaces";
import type { RepositoryListing } from "./repositories";

export type NamespaceProfileMeta = {
  bio: string;
  location: string;
  website: string;
  commitEmail: string;
};

export type RepositoryMeta = {
  description: string;
  pinned: boolean;
  homePinned: boolean;
};

export type PublicNamespaceSummary = {
  slug: string;
  displayName: string;
  bio: string;
  website: string;
  publicRepoCount: number;
  projectRepoCount: number;
};

type NamespaceProfileMetaRow = {
  namespace_id: string;
  bio: string;
  location: string;
  website: string;
  commit_email: string;
  updated_at: number;
};

type RepositoryMetaRow = {
  repository_id: string;
  description: string;
  pinned: number;
  home_pinned: number;
  updated_at: number;
};

export async function getNamespaceProfileMeta(
  d1: D1Database,
  namespaceId: string
): Promise<NamespaceProfileMeta> {
  const row = await d1
    .prepare(
      `SELECT namespace_id, bio, location, website, commit_email, updated_at
       FROM namespace_profile_meta
       WHERE namespace_id = ?
       LIMIT 1`
    )
    .bind(namespaceId)
    .first<NamespaceProfileMetaRow>();

  return {
    bio: row?.bio ?? "",
    location: row?.location ?? "",
    website: row?.website ?? "",
    commitEmail: row?.commit_email ?? "",
  };
}

export async function upsertNamespaceProfileMeta(
  d1: D1Database,
  namespaceId: string,
  meta: {
    bio: string;
    location: string;
    website: string;
    commitEmail?: string;
    now: number;
  }
): Promise<NamespaceProfileMeta> {
  const bio = sanitizeProfileBio(meta.bio);
  const location = sanitizeProfileLocation(meta.location);
  const website = sanitizeProfileWebsite(meta.website);
  const commitEmail =
    meta.commitEmail !== undefined
      ? sanitizeCommitEmail(meta.commitEmail)
      : (await getNamespaceProfileMeta(d1, namespaceId)).commitEmail;

  await d1
    .prepare(
      `INSERT INTO namespace_profile_meta (
         namespace_id, bio, location, website, commit_email, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace_id) DO UPDATE SET
         bio = excluded.bio,
         location = excluded.location,
         website = excluded.website,
         commit_email = excluded.commit_email,
         updated_at = excluded.updated_at`
    )
    .bind(namespaceId, bio, location, website, commitEmail, meta.now)
    .run();

  return { bio, location, website, commitEmail };
}

export async function getRepositoryMeta(
  d1: D1Database,
  repositoryId: string
): Promise<RepositoryMeta> {
  const row = await d1
    .prepare(
      `SELECT repository_id, description, pinned, home_pinned, updated_at
       FROM repository_meta
       WHERE repository_id = ?
       LIMIT 1`
    )
    .bind(repositoryId)
    .first<RepositoryMetaRow>();

  return {
    description: row?.description ?? "",
    pinned: Boolean(row?.pinned),
    homePinned: Boolean(row?.home_pinned),
  };
}

export async function listRepositoryMetaMap(
  d1: D1Database,
  repositoryIds: readonly string[]
): Promise<Map<string, RepositoryMeta>> {
  const map = new Map<string, RepositoryMeta>();
  if (repositoryIds.length === 0) return map;

  // Chunk IN clauses safely under SQLite variable limits
  const chunkSize = 80;
  for (let i = 0; i < repositoryIds.length; i += chunkSize) {
    const slice = repositoryIds.slice(i, i + chunkSize);
    const placeholders = slice.map(() => "?").join(", ");
    const result = await d1
      .prepare(
        `SELECT repository_id, description, pinned, home_pinned, updated_at
         FROM repository_meta
         WHERE repository_id IN (${placeholders})`
      )
      .bind(...slice)
      .all<RepositoryMetaRow>();
    for (const row of result.results ?? []) {
      map.set(row.repository_id, {
        description: row.description ?? "",
        pinned: Boolean(row.pinned),
        homePinned: Boolean(row.home_pinned),
      });
    }
  }
  return map;
}

export async function upsertRepositoryMeta(
  d1: D1Database,
  repositoryId: string,
  patch: {
    description?: string;
    pinned?: boolean;
    homePinned?: boolean;
    now: number;
  }
): Promise<RepositoryMeta> {
  const current = await getRepositoryMeta(d1, repositoryId);
  const nextDescription =
    patch.description !== undefined
      ? sanitizeRepoDescription(patch.description)
      : current.description;
  const nextPinned = patch.pinned !== undefined ? patch.pinned : current.pinned;
  const nextHomePinned = patch.homePinned !== undefined ? patch.homePinned : current.homePinned;

  await d1
    .prepare(
      `INSERT INTO repository_meta (repository_id, description, pinned, home_pinned, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(repository_id) DO UPDATE SET
         description = excluded.description,
         pinned = excluded.pinned,
         home_pinned = excluded.home_pinned,
         updated_at = excluded.updated_at`
    )
    .bind(repositoryId, nextDescription, nextPinned ? 1 : 0, nextHomePinned ? 1 : 0, patch.now)
    .run();

  return { description: nextDescription, pinned: nextPinned, homePinned: nextHomePinned };
}

export async function listPublicNamespaceSummaries(
  d1: D1Database,
  publicRows: readonly RepositoryListing[],
  primaryAdminSlug?: string
): Promise<PublicNamespaceSummary[]> {
  if (publicRows.length === 0) return [];

  const countsByNamespaceId = new Map<
    string,
    { slug: string; publicRepoCount: number; projectRepoCount: number }
  >();
  for (const row of publicRows) {
    const existing = countsByNamespaceId.get(row.namespace.id);
    const isProjectRepo = row.repository.slug !== PROFILE_REPO_SLUG;
    if (existing) {
      existing.publicRepoCount += 1;
      if (isProjectRepo) existing.projectRepoCount += 1;
    } else {
      countsByNamespaceId.set(row.namespace.id, {
        slug: row.namespace.slug,
        publicRepoCount: 1,
        projectRepoCount: isProjectRepo ? 1 : 0,
      });
    }
  }

  const namespaceIds = Array.from(countsByNamespaceId.keys());

  const directoryById = new Map<string, { displayName: string; status: string }>();
  const profileById = new Map<string, { bio: string; website: string }>();

  const chunkSize = 80;
  for (let i = 0; i < namespaceIds.length; i += chunkSize) {
    const slice = namespaceIds.slice(i, i + chunkSize);
    const placeholders = slice.map(() => "?").join(", ");
    const [dirResult, profResult] = await Promise.all([
      d1
        .prepare(
          `SELECT namespace_id, display_name, status
           FROM namespace_directory_meta
           WHERE namespace_id IN (${placeholders})`
        )
        .bind(...slice)
        .all<{ namespace_id: string; display_name: string; status: string }>(),
      d1
        .prepare(
          `SELECT namespace_id, bio, website
           FROM namespace_profile_meta
           WHERE namespace_id IN (${placeholders})`
        )
        .bind(...slice)
        .all<{ namespace_id: string; bio: string; website: string }>(),
    ]);

    for (const row of dirResult.results ?? []) {
      directoryById.set(row.namespace_id, {
        displayName: row.display_name ?? "",
        status: row.status ?? "active",
      });
    }
    for (const row of profResult.results ?? []) {
      profileById.set(row.namespace_id, {
        bio: row.bio ?? "",
        website: row.website ?? "",
      });
    }
  }

  const summaries: PublicNamespaceSummary[] = [];
  for (const [namespaceId, counts] of countsByNamespaceId.entries()) {
    const dir = directoryById.get(namespaceId);
    const prof = profileById.get(namespaceId);
    const isPrimaryAdmin = Boolean(primaryAdminSlug && counts.slug === primaryAdminSlug);
    if (!isPrimaryAdmin && dir?.status === "disabled") {
      continue;
    }
    const fallbackName = isPrimaryAdmin ? "Administrator" : counts.slug;
    const displayName = dir?.displayName
      ? sanitizeDisplayName(dir.displayName, fallbackName)
      : fallbackName;

    summaries.push({
      slug: counts.slug,
      displayName,
      bio: prof?.bio ?? "",
      website: prof?.website ?? "",
      publicRepoCount: counts.publicRepoCount,
      projectRepoCount: counts.projectRepoCount,
    });
  }

  return summaries.sort(
    (a, b) => b.projectRepoCount - a.projectRepoCount || a.slug.localeCompare(b.slug)
  );
}

/**
 * Lists every active namespace on the instance (including namespaces that
 * currently have 0 public repositories) along with its public and open-source
 * project repository counts and public profile metadata.
 */
export async function listAllPublicNamespaceDirectory(
  d1: D1Database,
  db: Db,
  publicRows: readonly RepositoryListing[],
  primaryAdminSlug?: string
): Promise<PublicNamespaceDirectoryItem[]> {
  const [allNamespaces, dirResult, profResult] = await Promise.all([
    db.select().from(namespaces),
    d1
      .prepare(
        `SELECT namespace_id, display_name, status
         FROM namespace_directory_meta`
      )
      .all<{ namespace_id: string; display_name: string; status: string }>(),
    d1
      .prepare(
        `SELECT namespace_id, bio, location, website
         FROM namespace_profile_meta`
      )
      .all<{ namespace_id: string; bio: string; location: string; website: string }>(),
  ]);

  if (allNamespaces.length === 0) return [];

  const countsByNamespaceId = new Map<
    string,
    { publicRepoCount: number; projectRepoCount: number }
  >();
  for (const row of publicRows) {
    const existing = countsByNamespaceId.get(row.namespace.id);
    const isProjectRepo = row.repository.slug !== PROFILE_REPO_SLUG;
    if (existing) {
      existing.publicRepoCount += 1;
      if (isProjectRepo) existing.projectRepoCount += 1;
    } else {
      countsByNamespaceId.set(row.namespace.id, {
        publicRepoCount: 1,
        projectRepoCount: isProjectRepo ? 1 : 0,
      });
    }
  }

  const directoryById = new Map<string, { displayName: string; status: string }>();
  for (const row of dirResult.results ?? []) {
    directoryById.set(row.namespace_id, {
      displayName: row.display_name ?? "",
      status: row.status ?? "active",
    });
  }

  const profileById = new Map<string, { bio: string; location: string; website: string }>();
  for (const row of profResult.results ?? []) {
    profileById.set(row.namespace_id, {
      bio: row.bio ?? "",
      location: row.location ?? "",
      website: row.website ?? "",
    });
  }

  const items: PublicNamespaceDirectoryItem[] = [];
  for (const ns of allNamespaces) {
    const dir = directoryById.get(ns.id);
    const prof = profileById.get(ns.id);
    const isPrimaryAdmin = Boolean(primaryAdminSlug && ns.slug === primaryAdminSlug);
    if (!isPrimaryAdmin && dir?.status === "disabled") {
      continue;
    }
    const fallbackName = isPrimaryAdmin ? "Administrator" : ns.slug;
    const displayName = dir?.displayName
      ? sanitizeDisplayName(dir.displayName, fallbackName)
      : fallbackName;
    const counts = countsByNamespaceId.get(ns.id);

    items.push({
      slug: ns.slug,
      displayName,
      bio: prof?.bio ?? "",
      location: prof?.location ?? "",
      website: prof?.website ?? "",
      publicRepoCount: counts?.publicRepoCount ?? 0,
      projectRepoCount: counts?.projectRepoCount ?? 0,
    });
  }

  return sortNamespaceDirectoryItems(items);
}
