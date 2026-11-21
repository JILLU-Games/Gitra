/// <reference lib="dom" />

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  FolderGit2,
  GitBranch,
  Globe,
  Lock,
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

type RepositoriesSectionProps = {
  origin: string;
  primaryNamespaceSlug?: string;
  namespaces: AdminNamespaceEntry[];
  repositories: AdminRepositoryEntry[];
  onCreated: (repo: AdminRepositoryEntry) => void;
  onVisibilityChanged: (repoId: string, visibility: "public" | "private") => void;
  onDeleted: (repoId: string, namespaceId: string) => void;
};

type CreateRepoResponse =
  | {
      ok: true;
      id: string;
      namespaceSlug: string;
      slug: string;
      visibility: "public" | "private";
      updatedAt: number;
    }
  | { ok: false; reason: string };

type ToggleVisibilityResponse =
  | { ok: true; id: string; visibility: "public" | "private" }
  | { ok: false; reason: string };

type DeleteRepoResponse = { ok: true; id: string } | { ok: false; reason: string };

export function RepositoriesSection({
  origin,
  primaryNamespaceSlug,
  namespaces,
  repositories,
  onCreated,
  onVisibilityChanged,
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
      const response = await fetch("/auth/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug: chosenNs,
          slug: slug.trim().toLowerCase(),
          visibility,
        }),
      });
      const body = (await response.json().catch(() => null)) as CreateRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(
          reason === "slug-taken"
            ? "A repository with that slug already exists."
            : reason === "invalid-slug"
              ? "Use lowercase letters, digits, and internal dashes (1–40 chars)."
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
        defaultBranch: "main",
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
      const response = await fetch(`/auth/api/repositories/${encodeURIComponent(repo.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      const body = (await response.json().catch(() => null)) as ToggleVisibilityResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(`Could not update visibility (${reason}).`);
        return;
      }
      onVisibilityChanged(repo.id, body.visibility);
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
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
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
    <section
      id="repositories"
      className="scroll-mt-16 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800">
        <div>
          <h2 className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Repositories
          </h2>
          <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
            Toggle visibility, copy HTTPS clone URLs, or remove repositories.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAdd((open) => !open);
            setError(null);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>New repository</span>
        </button>
      </div>

      {showAdd ? (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
        >
          <div className="grid gap-2.5 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-3">
              <label
                htmlFor="admin-repo-ns"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Namespace
              </label>
              <select
                id="admin-repo-ns"
                value={namespaceSlug}
                onChange={(event) => setNamespaceSlug(event.target.value)}
                className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
            <div className="sm:col-span-5">
              <label
                htmlFor="admin-repo-slug"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Repository slug
              </label>
              <input
                id="admin-repo-slug"
                type="text"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="service-api"
                required
                className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="admin-repo-vis"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Visibility
              </label>
              <select
                id="admin-repo-vis"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value === "private" ? "private" : "public")
                }
                className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="public">public</option>
                <option value="private">private</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 sm:col-span-2 sm:justify-end">
              <button
                type="submit"
                disabled={creating || !slug.trim()}
                className="inline-flex h-8 items-center rounded-md bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-2 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
          className="border-b border-red-500/20 bg-red-500/10 px-3.5 py-2 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {repositories.length === 0 ? (
        <div className="px-3.5 py-6 text-center">
          <FolderGit2 className="mx-auto mb-1.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
          <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
            No repositories in this workspace yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40">
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Repository
                </th>
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Visibility
                </th>
                <th className="hidden px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 sm:table-cell dark:text-zinc-400">
                  Default branch
                </th>
                <th className="px-3.5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
                    className="border-t border-zinc-200 transition-colors hover:bg-zinc-50/70 dark:border-zinc-800 dark:hover:bg-zinc-800/30"
                  >
                    <td className="px-3.5 py-2">
                      <a
                        href={`/${repo.namespaceSlug}/${repo.slug}`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-zinc-900 no-underline hover:text-accent-600 dark:text-zinc-100 dark:hover:text-accent-400"
                      >
                        <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                        <span>
                          {repo.namespaceSlug}/{repo.slug}
                        </span>
                      </a>
                    </td>
                    <td className="px-3.5 py-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleVisibility(repo)}
                        title={`Switch ${repo.namespaceSlug}/${repo.slug} to ${isPrivate ? "public" : "private"}`}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${
                          isPrivate
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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
                    <td className="hidden px-3.5 py-2 sm:table-cell">
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        <GitBranch className="h-3 w-3 text-zinc-400" aria-hidden="true" />
                        {repo.defaultBranch}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleCopyClone(repo)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 px-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          title="Copy HTTPS clone URL"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
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
                          className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 px-2 text-xs text-zinc-700 no-underline hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          title="Storage & pack admin"
                        >
                          <Settings className="h-3 w-3" aria-hidden="true" />
                          <span className="hidden lg:inline">Storage</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(repo)}
                          aria-label={`Delete ${repo.namespaceSlug}/${repo.slug}`}
                          className="inline-flex h-7 items-center gap-1 rounded border border-red-500/25 px-2 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
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
          className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3
                id="delete-repo-modal-title"
                className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                Delete repository
              </h3>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                aria-label="Close confirmation dialog"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-2 px-4 py-3.5 text-xs text-zinc-600 dark:text-zinc-300">
              <p className="m-0">
                Permanently remove{" "}
                <strong className="font-mono text-zinc-900 dark:text-zinc-100">
                  {deleteTarget.namespaceSlug}/{deleteTarget.slug}
                </strong>
                ?
              </p>
              <p className="m-0 text-zinc-500 dark:text-zinc-400">
                This removes the repository record and repository-scoped token grants immediately.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex h-8 items-center rounded-md border border-red-600 bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
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
