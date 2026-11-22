/// <reference lib="dom" />

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Eye, FileText, Pencil, Sparkles } from "lucide-react";

import { MarkdownContent } from "@/client/components/MarkdownContent";
import { hydrateIsland } from "@/client/hydrate";
import { buildDefaultProfileReadmeTemplate, buildNamespaceProfileHref } from "@/shared/admin/panel";

export type ProfileReadmeEditorIslandProps = {
  repositoryId: string;
  owner: string;
  displayName?: string;
  refShort: string;
  initialContent: string;
  initialPath: string;
  hasExistingFile: boolean;
};

type SaveProfileReadmeResponse =
  | { ok: true; commitOid: string; ref: string; unchanged: boolean }
  | { ok: false; reason: string; detail?: string };

export function ProfileReadmeEditorIsland({
  repositoryId,
  owner,
  displayName,
  refShort,
  initialContent,
  initialPath,
  hasExistingFile,
}: ProfileReadmeEditorIslandProps) {
  const [content, setContent] = useState(
    initialContent || buildDefaultProfileReadmeTemplate(owner, displayName)
  );
  const [commitMessage, setCommitMessage] = useState(
    hasExistingFile ? "Update profile/README.md" : "Initialize profile/README.md"
  );
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCommitOid, setSavedCommitOid] = useState<string | null>(null);
  const [savedUnchanged, setSavedUnchanged] = useState(false);

  const profileHref = buildNamespaceProfileHref(owner);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedCommitOid(null);
    setSavedUnchanged(false);

    try {
      const response = await fetch(
        `/auth/api/repositories/${encodeURIComponent(repositoryId)}/profile-readme`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            message: commitMessage.trim() || "Update profile/README.md",
          }),
        }
      );
      const body = (await response.json().catch(() => null)) as SaveProfileReadmeResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(
          reason === "viewer-read-only"
            ? "Viewer accounts cannot commit repository changes."
            : reason === "repo-busy"
              ? "Repository is busy with another receive. Try again in a moment."
              : `Could not commit profile/README.md (${reason}).`
        );
        return;
      }
      setSavedCommitOid(body.commitOid);
      setSavedUnchanged(body.unchanged);
    } catch {
      setError("Network error while committing profile/README.md.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Namespace profile README editor"
      className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="flex min-w-0 items-center gap-2">
          <FileText
            className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              <span>{initialPath || "profile/README.md"}</span>
              <span className="rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-300">
                @{owner} profile
              </span>
            </div>
            <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">
              Rendered automatically at the top of{" "}
              <a href={profileHref} className="font-mono">
                {profileHref}
              </a>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            role="tablist"
            aria-label="Profile README editor mode"
            className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "write"}
              onClick={() => setTab("write")}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                tab === "write"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              <span>Write</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "preview"}
              onClick={() => setTab("preview")}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                tab === "preview"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <Eye className="h-3 w-3" aria-hidden="true" />
              <span>Preview</span>
            </button>
          </div>

          <a
            href={profileHref}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span>View profile</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3 p-3.5">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        ) : null}

        {savedCommitOid ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                {savedUnchanged
                  ? "No changes to commit — profile/README.md is already up to date."
                  : `Committed profile/README.md (${savedCommitOid.slice(0, 7)}) to ${refShort}.`}
              </span>
            </span>
            <a href={profileHref} className="font-medium underline">
              Open {profileHref} →
            </a>
          </div>
        ) : null}

        {tab === "write" ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor="profile-readme-textarea"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Markdown source
              </label>
              <button
                type="button"
                onClick={() => setContent(buildDefaultProfileReadmeTemplate(owner, displayName))}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>Reset template</span>
              </button>
            </div>
            <textarea
              id="profile-readme-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={13}
              spellCheck={false}
              disabled={saving}
              placeholder="# Organization / User Profile"
              className="w-full rounded-md border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        ) : (
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            {content.trim() ? (
              <div className="markdown-compact">
                <MarkdownContent
                  markdown={content}
                  context={{ owner, repo: ".vibtools", ref: refShort, baseDir: "profile" }}
                />
              </div>
            ) : (
              <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
                Nothing to preview yet.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div className="flex-1">
            <label htmlFor="profile-readme-commit-msg" className="sr-only">
              Commit message
            </label>
            <input
              id="profile-readme-commit-msg"
              type="text"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              disabled={saving}
              placeholder="Update profile/README.md"
              className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent-600 px-3.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Committing…" : "Save & commit"}</span>
          </button>
        </div>
      </form>
    </section>
  );
}

export function initProfileReadmeEditorIsland() {
  hydrateIsland<ProfileReadmeEditorIslandProps>("profile-readme-editor", ProfileReadmeEditorIsland);
}
