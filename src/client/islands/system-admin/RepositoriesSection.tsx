/// <reference lib="dom" />

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  FolderGit2,
  GitBranch,
  Globe,
  Home,
  Lock,
  Pin,
  PinOff,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";

import {
  buildGitCloneUrl,
  type AdminNamespaceEntry,
  type AdminRepositoryEntry,
} from "@/shared/admin/panel";
import { PROFILE_REPO_SLUG } from "@/shared/slugs";

type RepositoriesSectionProps = {
  origin: string;
  primaryNamespaceSlug?: string;
  namespaces: AdminNamespaceEntry[];
  repositories: AdminRepositoryEntry[];
  onCreated: (repo: AdminRepositoryEntry) => void;
  onVisibilityChanged: (
    repoId: string,
    visibility: "public" | "private",
    homePinned?: boolean
  ) => void;
  onPinChanged: (repoId: string, pinned: boolean, homePinned: boolean) => void;
  onDeleted: (repoId: string, namespaceId: string) => void;
};

type CreateRepoResponse =
  | {
      ok: true;
      id: string;
      namespaceSlug: string;
      slug: string;
      visibility: "public" | "private";
      defaultBranch?: string;
      pinned?: boolean;
      homePinned?: boolean;
      updatedAt: number;
    }
  | { ok: false; reason: string };

type PatchRepoResponse =
  | {
      ok: true;
      id: string;
      visibility: "public" | "private";
      pinned: boolean;
      homePinned: boolean;
    }
  | { ok: false; reason: string };

type DeleteRepoResponse =
  { ok: true; id: string; queued?: boolean } | { ok: false; reason?: string; error?: string };

export function RepositoriesSection({
  origin,
  primaryNamespaceSlug,
  namespaces,
  repositories,
  onCreated,
  onVisibilityChanged,
  onPinChanged,
  onDeleted,
}: RepositoriesSectionProps) {
  const activeNamespaces = namespaces.filter((ns) => ns.status === "active");
  const defaultNs = primaryNamespaceSlug ?? activeNamespaces[0]?.slug ?? "admin";

  const [showAdd, setShowAdd] = useState(false);
  const [namespaceSlug, setNamespaceSlug] = useState(defaultNs);
  const [slug, setSlug] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [creating, setCreating] = useState(false);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRepositoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        setDeleteTarget(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, deleting]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug.trim() || creating) return;
    setCreating(true);
    setError(null);
    const chosenNs = namespaceSlug || defaultNs;
    try {
      const normalizedSlug = slug.trim().toLowerCase();
      const response = await fetch("/auth/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug: chosenNs,
          slug: normalizedSlug,
          visibility,
          initializeProfileReadme: normalizedSlug === PROFILE_REPO_SLUG,
        }),
      });
      const body = (await response.json().catch(() => null)) as CreateRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(
          reason === "slug-taken"
            ? "A repository with that slug already exists."
            : reason === "invalid-slug"
              ? "Use lowercase letters, digits, hyphens/dots, or .vibtools (1–40 chars)."
              : `Could not create repository (${reason}).`
        );
        return;
      }
      const nsRow = namespaces.find((ns) => ns.slug === body.namespaceSlug);
      onCreated({
        id: body.id,
        slug: body.slug,
        namespaceId: nsRow?.id ?? "",
        namespaceSlug: body.namespaceSlug,
        visibility: body.visibility,
        defaultBranch: body.defaultBranch ?? "main",
        pinned: Boolean(body.pinned),
        homePinned: Boolean(body.homePinned),
        updatedAt: body.updatedAt,
      });
      setSlug("");
      setVisibility("public");
      setShowAdd(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleVisibility(repo: AdminRepositoryEntry) {
    if (pendingId) return;
    setPendingId(repo.id);
    setError(null);
    const next: "public" | "private" = repo.visibility === "private" ? "public" : "private";
    try {
      const response = await fetch(`/admin/api/repositories/${encodeURIComponent(repo.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      const body = (await response.json().catch(() => null)) as PatchRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(`Could not update visibility (${reason}).`);
        return;
      }
      onVisibilityChanged(repo.id, body.visibility, body.homePinned);
    } catch (err) {
      setError(String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleTogglePin(repo: AdminRepositoryEntry) {
    if (pendingId) return;
    setPendingId(repo.id);
    setError(null);
    try {
      const response = await fetch(`/admin/api/repositories/${encodeURIComponent(repo.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !repo.pinned }),
      });
      const body = (await response.json().catch(() => null)) as PatchRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(`Could not update pin status (${reason}).`);
        return;
      }
      onPinChanged(repo.id, body.pinned, body.homePinned);
    } catch (err) {
      setError(String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleHomePin(repo: AdminRepositoryEntry) {
    if (pendingId || repo.visibility === "private") return;
    setPendingId(repo.id);
    setError(null);
    try {
      const response = await fetch(`/admin/api/repositories/${encodeURIComponent(repo.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homePinned: !repo.homePinned }),
      });
      const body = (await response.json().catch(() => null)) as PatchRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(
          reason === "private-repo-cannot-feature"
            ? "Make this repository public before pinning it to the public homepage."
            : `Could not update homepage pin (${reason}).`
        );
        return;
      }
      onPinChanged(repo.id, body.pinned, body.homePinned);
    } catch (err) {
      setError(String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleCopyClone(repo: AdminRepositoryEntry) {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : origin;
    const cloneUrl = buildGitCloneUrl(baseOrigin, repo.namespaceSlug, repo.slug);
    try {
      await navigator.clipboard.writeText(cloneUrl);
      setCopiedId(repo.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === repo.id ? null : current));
      }, 1800);
    } catch {
      // Clipboard unavailable in restricted contexts.
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    const target = deleteTarget;
    try {
      const response = await fetch(`/admin/api/repositories/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: `${target.namespaceSlug}/${target.slug}` }),
      });
      const body = (await response.json().catch(() => null)) as DeleteRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason =
          body && !body.ok
            ? (body.error ?? body.reason ?? `HTTP ${response.status}`)
            : `HTTP ${response.status}`;
        setError(`Could not delete repository (${reason}).`);
        setDeleteTarget(null);
        return;
      }
      onDeleted(target.id, target.namespaceId);
      setDeleteTarget(null);
    } catch (err) {
      setError(String(err));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section id="repositories" className="scroll-mt-16 rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div>
          <h2 className="m-0 text-[13px] font-semibold text-fg">Repositories</h2>
          <p className="m-0 text-[12px] text-fgMuted">
            Toggle visibility, pin repositories, feature on the public homepage, copy clone URLs, or
            remove repositories.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAdd((open) => !open);
            setError(null);
          }}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>New repository</span>
        </button>
      </div>

      {showAdd ? (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="border-b border-border bg-canvas px-3.5 py-3"
        >
          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-12 md:items-end">
            <div className="md:col-span-3">
              <label
                htmlFor="admin-repo-ns"
                className="mb-1 block text-[12px] font-medium text-fgBody"
              >
                Namespace
              </label>
              <select
                id="admin-repo-ns"
                value={namespaceSlug}
                onChange={(event) => setNamespaceSlug(event.target.value)}
                className="h-8 w-full rounded-md border border-border bg-surface px-2 font-mono text-[12px] text-fg focus:border-fgMuted focus:outline-none"
              >
                {activeNamespaces.length > 0 ? (
                  activeNamespaces.map((ns) => (
                    <option key={ns.id} value={ns.slug}>
                      @{ns.slug}
                    </option>
                  ))
                ) : (
                  <option value={defaultNs}>@{defaultNs}</option>
                )}
              </select>
            </div>
            <div className="md:col-span-4">
              <label
                htmlFor="admin-repo-slug"
                className="mb-1 block text-[12px] font-medium text-fgBody"
              >
                Repository slug
              </label>
              <input
                id="admin-repo-slug"
                type="text"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="service-api or .vibtools"
                required
                className="h-8 w-full rounded-md border border-border bg-surface px-2.5 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2 md:col-span-2">
              <label
                htmlFor="admin-repo-vis"
                className="mb-1 block text-[12px] font-medium text-fgBody"
              >
                Visibility
              </label>
              <select
                id="admin-repo-vis"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value === "private" ? "private" : "public")
                }
                className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[12px] text-fg focus:border-fgMuted focus:outline-none"
              >
                <option value="public">public</option>
                <option value="private">private</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 sm:col-span-2 md:col-span-3 md:justify-end">
              <button
                type="submit"
                disabled={creating || !slug.trim()}
                className="inline-flex h-8 items-center rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[12px] text-fgBody hover:bg-surfaceHover hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-b border-red-500/30 bg-red-500/10 px-3.5 py-2 text-[12px] text-red-400"
        >
          {error}
        </div>
      ) : null}

      {repositories.length === 0 ? (
        <div className="px-3.5 py-6 text-center">
          <FolderGit2 className="mx-auto mb-1.5 h-4 w-4 text-fgMuted" aria-hidden="true" />
          <p className="m-0 text-[12px] text-fgMuted">No repositories in this workspace yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-canvas">
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Repository
                </th>
                <th className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Visibility
                </th>
                <th className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Pins &amp; Homepage
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {repositories.map((repo) => {
                const isPrivate = repo.visibility === "private";
                const isBusy = pendingId === repo.id;
                const isCopied = copiedId === repo.id;
                return (
                  <tr
                    key={repo.id}
                    className="border-t border-borderSubtle transition-colors hover:bg-surfaceHover"
                  >
                    <td className="px-3 py-2">
                      <div className="min-w-0">
                        <a
                          href={`/${repo.namespaceSlug}/${repo.slug}`}
                          className="inline-flex items-center gap-1.5 font-mono text-[12px] font-medium text-fg no-underline hover:text-accent hover:underline"
                        >
                          <FolderGit2
                            className="h-3.5 w-3.5 shrink-0 text-fgMuted"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {repo.namespaceSlug}/{repo.slug}
                          </span>
                        </a>
                        <div className="mt-0.5 flex items-center gap-1 pl-5 font-mono text-[11px] text-fgMuted">
                          <GitBranch className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                          <span>{repo.defaultBranch}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleVisibility(repo)}
                        title={`Switch ${repo.namespaceSlug}/${repo.slug} to ${isPrivate ? "public" : "private"}`}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${
                          isPrivate
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {isPrivate ? (
                          <Lock className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Globe className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{repo.visibility}</span>
                      </button>
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleTogglePin(repo)}
                          aria-pressed={repo.pinned}
                          aria-label={`${repo.pinned ? "Unpin" : "Pin"} ${repo.namespaceSlug}/${repo.slug}`}
                          title={
                            repo.pinned
                              ? `Unpin ${repo.namespaceSlug}/${repo.slug} from profile`
                              : `Pin ${repo.namespaceSlug}/${repo.slug} to profile`
                          }
                          className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                            repo.pinned
                              ? "border-border bg-surfaceHover text-fg"
                              : "border-border bg-canvas text-fgBody hover:bg-surfaceHover hover:text-fg"
                          }`}
                        >
                          {repo.pinned ? (
                            <PinOff className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Pin className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{repo.pinned ? "Pinned" : "Pin"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || isPrivate}
                          onClick={() => void handleToggleHomePin(repo)}
                          aria-pressed={repo.homePinned}
                          aria-label={`${repo.homePinned ? "Remove from homepage" : "Pin to homepage"} ${repo.namespaceSlug}/${repo.slug}`}
                          title={
                            isPrivate
                              ? "Make repository public to feature on the public homepage"
                              : repo.homePinned
                                ? `Unpin ${repo.namespaceSlug}/${repo.slug} from public homepage`
                                : `Pin ${repo.namespaceSlug}/${repo.slug} to public homepage`
                          }
                          className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-45 ${
                            repo.homePinned
                              ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
                              : "border-border bg-canvas text-fgBody hover:bg-surfaceHover hover:text-fg"
                          }`}
                        >
                          <Home className="h-3 w-3" aria-hidden="true" />
                          <span>{repo.homePinned ? "On Home" : "Homepage"}</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyClone(repo)}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-canvas px-2 text-[11px] text-fgBody hover:bg-surfaceHover hover:text-fg"
                          title="Copy HTTPS clone URL"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" aria-hidden="true" />
                              <span className="hidden md:inline">Clone</span>
                            </>
                          )}
                        </button>
                        <a
                          href={`/${repo.namespaceSlug}/${repo.slug}/admin`}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-canvas px-2 text-[11px] text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                          title="Storage & pack admin"
                        >
                          <Settings className="h-3 w-3" aria-hidden="true" />
                          <span className="hidden lg:inline">Storage</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(repo)}
                          aria-label={`Delete ${repo.namespaceSlug}/${repo.slug}`}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-red-500/30 px-2 text-[11px] text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span className="hidden md:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Compact delete confirmation modal */}
      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-repo-modal-title"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 id="delete-repo-modal-title" className="m-0 text-[14px] font-semibold text-fg">
                Delete repository
              </h3>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                aria-label="Close confirmation dialog"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-2 px-4 py-3.5 text-[13px] text-fgBody">
              <p className="m-0">
                Permanently remove{" "}
                <strong className="font-mono text-fg">
                  {deleteTarget.namespaceSlug}/{deleteTarget.slug}
                </strong>
                ?
              </p>
              <p className="m-0 text-[12px] text-fgMuted">
                This removes the repository record and repository-scoped token grants immediately.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-4 py-2.5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex h-8 items-center rounded-md border border-red-500/40 bg-red-500/15 px-3 text-[12px] font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete repository"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
