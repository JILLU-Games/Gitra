import {
  sanitizeDisplayName,
  sanitizeProfileBio,
  sanitizeProfileLocation,
  sanitizeProfileWebsite,
  sanitizeRepoDescription,
} from "@/shared/admin/panel";
import { PROFILE_REPO_SLUG } from "@/shared/slugs";
import { ensureNamespaceDirectoryMetaTable } from "./adminDirectory";
import type { RepositoryListing } from "./repositories";

export type NamespaceProfileMeta = {
  bio: string;
  location: string;
  website: string;
};

export type RepositoryMeta = {
  description: string;
  pinned: boolean;
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
  updated_at: number;
};

type RepositoryMetaRow = {
  repository_id: string;
  description: string;
  pinned: number;
  updated_at: number;
};

const CREATE_PROFILE_META_SQL = `CREATE TABLE IF NOT EXISTS namespace_profile_meta (
  namespace_id text PRIMARY KEY NOT NULL,
  bio text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  updated_at integer NOT NULL,
  FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON UPDATE no action ON DELETE cascade
)`;

const CREATE_REPO_META_SQL = `CREATE TABLE IF NOT EXISTS repository_meta (
  repository_id text PRIMARY KEY NOT NULL,
  description text NOT NULL DEFAULT '',
  pinned integer NOT NULL DEFAULT 0,
  updated_at integer NOT NULL,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON UPDATE no action ON DELETE cascade
)`;

const ensuredMetaTables = new WeakMap<D1Database, Promise<void>>();

export async function ensureWorkspaceMetaTables(d1: D1Database): Promise<void> {
  const existing = ensuredMetaTables.get(d1);
  if (existing) return existing;

  const promise = d1
    .batch([d1.prepare(CREATE_PROFILE_META_SQL), d1.prepare(CREATE_REPO_META_SQL)])
    .then(() => undefined)
    .catch((error) => {
      ensuredMetaTables.delete(d1);
      throw error;
    });

  ensuredMetaTables.set(d1, promise);
  return promise;
}

export async function getNamespaceProfileMeta(
  d1: D1Database,
  namespaceId: string
): Promise<NamespaceProfileMeta> {
  await ensureWorkspaceMetaTables(d1);
  const row = await d1
    .prepare(
      `SELECT namespace_id, bio, location, website, updated_at
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
  };
}

export async function upsertNamespaceProfileMeta(
  d1: D1Database,
  namespaceId: string,
  meta: {
    bio: string;
    location: string;
    website: string;
    now: number;
  }
): Promise<NamespaceProfileMeta> {
  await ensureWorkspaceMetaTables(d1);
  const bio = sanitizeProfileBio(meta.bio);
  const location = sanitizeProfileLocation(meta.location);
  const website = sanitizeProfileWebsite(meta.website);

  await d1
    .prepare(
      `INSERT INTO namespace_profile_meta (namespace_id, bio, location, website, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(namespace_id) DO UPDATE SET
         bio = excluded.bio,
         location = excluded.location,
         website = excluded.website,
         updated_at = excluded.updated_at`
    )
    .bind(namespaceId, bio, location, website, meta.now)
    .run();

  return { bio, location, website };
}

export async function getRepositoryMeta(
  d1: D1Database,
  repositoryId: string
): Promise<RepositoryMeta> {
  await ensureWorkspaceMetaTables(d1);
  const row = await d1
    .prepare(
      `SELECT repository_id, description, pinned, updated_at
       FROM repository_meta
       WHERE repository_id = ?
       LIMIT 1`
    )
    .bind(repositoryId)
    .first<RepositoryMetaRow>();

  return {
    description: row?.description ?? "",
    pinned: Boolean(row?.pinned),
  };
}

export async function listRepositoryMetaMap(
  d1: D1Database,
  repositoryIds: readonly string[]
): Promise<Map<string, RepositoryMeta>> {
  const map = new Map<string, RepositoryMeta>();
  if (repositoryIds.length === 0) return map;
  await ensureWorkspaceMetaTables(d1);

  // Chunk IN clauses safely under SQLite variable limits
  const chunkSize = 80;
  for (let i = 0; i < repositoryIds.length; i += chunkSize) {
    const slice = repositoryIds.slice(i, i + chunkSize);
    const placeholders = slice.map(() => "?").join(", ");
    const result = await d1
      .prepare(
        `SELECT repository_id, description, pinned, updated_at
         FROM repository_meta
         WHERE repository_id IN (${placeholders})`
      )
      .bind(...slice)
      .all<RepositoryMetaRow>();
    for (const row of result.results ?? []) {
      map.set(row.repository_id, {
        description: row.description ?? "",
        pinned: Boolean(row.pinned),
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
    now: number;
  }
): Promise<RepositoryMeta> {
  await ensureWorkspaceMetaTables(d1);
  const current = await getRepositoryMeta(d1, repositoryId);
  const nextDescription =
    patch.description !== undefined
      ? sanitizeRepoDescription(patch.description)
      : current.description;
  const nextPinned = patch.pinned !== undefined ? patch.pinned : current.pinned;

  await d1
    .prepare(
      `INSERT INTO repository_meta (repository_id, description, pinned, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(repository_id) DO UPDATE SET
         description = excluded.description,
         pinned = excluded.pinned,
         updated_at = excluded.updated_at`
    )
    .bind(repositoryId, nextDescription, nextPinned ? 1 : 0, patch.now)
    .run();

  return { description: nextDescription, pinned: nextPinned };
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
  await Promise.all([ensureWorkspaceMetaTables(d1), ensureNamespaceDirectoryMetaTable(d1)]);

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
