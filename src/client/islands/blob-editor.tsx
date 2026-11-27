/// <reference lib="dom" />

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRightLeft, Check, Eye, Pencil, Trash2, X } from "lucide-react";

import { MarkdownContent } from "@/client/components/MarkdownContent";
import { hydrateIsland } from "@/client/hydrate";
import { ErrorBanner, showToast } from "@/client/components/ui";

export type BlobEditorIslandProps = {
  owner: string;
  repo: string;
  repositoryId: string;
  filePath: string;
  refShort: string;
  initialContent?: string;
  isMarkdown?: boolean;
  canEditFile?: boolean;
  canMutateFile?: boolean;
};

type WebMutationResponse =
  | {
      ok: true;
      commitOid: string;
      ref: string;
      unchanged: boolean;
      toPath?: string;
    }
  | { ok: false; reason?: string; detail?: string };

export function BlobEditorIsland({
  owner,
  repo,
  repositoryId,
  filePath,
  refShort,
  initialContent = "",
  isMarkdown = false,
  canEditFile = true,
  canMutateFile = canEditFile,
}: BlobEditorIslandProps) {
  const [mode, setMode] = useState<"view" | "edit" | "move" | "confirm-delete">("view");
  const [content, setContent] = useState(initialContent);
  const [targetPath, setTargetPath] = useState(filePath);
  const [commitMessage, setCommitMessage] = useState(`Update ${filePath}`);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const readonlyEl = document.getElementById("blob-readonly-view");
    if (!readonlyEl) return;
    readonlyEl.hidden = mode === "edit";
  }, [mode]);

  function parentTreeHref(): string {
    const parts = filePath.split("/").filter(Boolean);
    const parent = parts.slice(0, -1).join("/");
    if (parent) {
      return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree?ref=${encodeURIComponent(refShort)}&path=${encodeURIComponent(parent)}`;
    }
    return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?ref=${encodeURIComponent(refShort)}`;
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canEditFile) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/auth/api/repositories/${encodeURIComponent(repositoryId)}/file`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: filePath,
            content,
            message: commitMessage.trim() || `Update ${filePath}`,
            ref: refShort,
          }),
        }
      );
      const body = (await response.json().catch(() => null)) as WebMutationResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        const msg =
          reason === "repo-busy"
            ? "Repository is busy receiving another push. Try again shortly."
            : `Failed to commit file (${reason}).`;
        setError(msg);
        showToast({ tone: "error", title: "Could not commit file", message: msg });
        return;
      }
      window.location.assign(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob?ref=${encodeURIComponent(refShort)}&path=${encodeURIComponent(filePath)}`
      );
    } catch {
      const msg = "Network error while committing changes.";
      setError(msg);
      showToast({ tone: "error", title: "Could not commit file", message: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canMutateFile) return;
    const cleanTarget = targetPath.trim().replace(/^\/+/, "");
    if (!cleanTarget) {
      setError("Enter a valid destination path.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/auth/api/repositories/${encodeURIComponent(repositoryId)}/file/move`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromPath: filePath,
            toPath: cleanTarget,
            message: commitMessage.trim() || `Rename ${filePath} to ${cleanTarget}`,
            ref: refShort,
          }),
        }
      );
      const body = (await response.json().catch(() => null)) as WebMutationResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        const msg =
          reason === "invalid-path"
            ? "Invalid destination path."
            : reason === "not-found"
              ? "Source file was not found on this branch."
              : reason === "repo-busy"
                ? "Repository is busy receiving another push. Try again shortly."
                : `Failed to move file (${reason}).`;
        setError(msg);
        showToast({ tone: "error", title: "Could not move file", message: msg });
        return;
      }
      window.location.assign(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob?ref=${encodeURIComponent(refShort)}&path=${encodeURIComponent(cleanTarget)}`
      );
    } catch {
      const msg = "Network error while renaming file.";
      setError(msg);
      showToast({ tone: "error", title: "Could not move file", message: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (saving || !canMutateFile) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/auth/api/repositories/${encodeURIComponent(repositoryId)}/file`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: filePath,
            message: commitMessage.trim() || `Delete ${filePath}`,
            ref: refShort,
          }),
        }
      );
      const body = (await response.json().catch(() => null)) as WebMutationResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        const msg =
          reason === "repo-busy"
            ? "Repository is busy receiving another push. Try again shortly."
            : `Failed to delete file (${reason}).`;
        setError(msg);
        showToast({ tone: "error", title: "Could not delete file", message: msg });
        return;
      }
      window.location.assign(parentTreeHref());
    } catch {
      const msg = "Network error while deleting file.";
      setError(msg);
      showToast({ tone: "error", title: "Could not delete file", message: msg });
    } finally {
      setSaving(false);
    }
  }

  if (mode === "view") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-b border-borderSubtle bg-surface px-3 py-2 text-[12px]">
        {canEditFile ? (
          <button
            type="button"
            onClick={() => {
              setContent(initialContent);
              setCommitMessage(`Update ${filePath}`);
              setTab("write");
              setError(null);
              setMode("edit");
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <Pencil className="h-3 w-3 text-fgMuted" aria-hidden="true" />
            <span>Edit file</span>
          </button>
        ) : null}
        {canMutateFile ? (
          <>
            <button
              type="button"
              onClick={() => {
                setTargetPath(filePath);
                setCommitMessage(`Rename ${filePath}`);
                setError(null);
                setMode("move");
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
            >
              <ArrowRightLeft className="h-3 w-3 text-fgMuted" aria-hidden="true" />
              <span>Rename / Move</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCommitMessage(`Delete ${filePath}`);
                setError(null);
                setMode("confirm-delete");
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:border-red-500/40 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              <span>Delete file</span>
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (mode === "move") {
    return (
      <form
        onSubmit={(event) => void handleMove(event)}
        className="space-y-3 border-b border-borderSubtle bg-surface p-4 text-[12px]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[12px] text-fg">
            <ArrowRightLeft className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>Rename or move {filePath}</span>
          </div>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={saving}
            className="inline-flex h-7 items-center gap-1 rounded-none border border-border bg-canvas px-2 text-[12px] text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>

        {error ? <ErrorBanner className="px-3 py-2 text-[12px]">{error}</ErrorBanner> : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label
              htmlFor="move-target-path"
              className="mb-1 block text-[12px] font-medium text-fg"
            >
              New file path
            </label>
            <input
              id="move-target-path"
              type="text"
              value={targetPath}
              onChange={(event) => setTargetPath(event.target.value)}
              disabled={saving}
              required
              className="h-8 w-full rounded-none border border-border bg-canvas px-2.5 font-mono text-[13px] text-fg focus:border-fgMuted focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="move-commit-msg" className="mb-1 block text-[12px] font-medium text-fg">
              Commit message
            </label>
            <input
              id="move-commit-msg"
              type="text"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              disabled={saving}
              placeholder={`Rename ${filePath}`}
              className="h-8 w-full rounded-none border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !targetPath.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-none bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Committing…" : "Commit rename"}</span>
          </button>
        </div>
      </form>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className="space-y-3 border-b border-borderSubtle bg-surface p-4 text-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-red-400">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-semibold">
              Delete <code className="font-mono">{filePath}</code> from{" "}
              <code className="font-mono">{refShort}</code>?
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={saving}
            className="inline-flex h-7 items-center gap-1 rounded-none border border-border bg-canvas px-2 text-[12px] text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>

        {error ? <ErrorBanner className="px-3 py-2 text-[12px]">{error}</ErrorBanner> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            disabled={saving}
            placeholder={`Delete ${filePath}`}
            aria-label="Delete commit message"
            className="h-8 flex-1 rounded-none border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-none border border-red-500/40 bg-red-500/20 px-3.5 text-[12px] font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Deleting…" : "Confirm delete"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSave(event)}
      className="space-y-3 border-b border-borderSubtle bg-surface p-4 text-[12px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[12px] text-fg">
          <Pencil className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          <span>Editing {filePath}</span>
          <span className="rounded-none border border-borderSubtle bg-canvas px-1.5 py-0.5 text-[11px] text-fgBody">
            {refShort}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isMarkdown ? (
            <div className="inline-flex rounded-none border border-border bg-canvas p-0.5">
              <button
                type="button"
                onClick={() => setTab("write")}
                className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[11px] font-medium ${
                  tab === "write" ? "bg-surfaceHover text-fg" : "text-fgMuted hover:text-fg"
                }`}
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[11px] font-medium ${
                  tab === "preview" ? "bg-surfaceHover text-fg" : "text-fgMuted hover:text-fg"
                }`}
              >
                <Eye className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Preview</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={saving}
            aria-label="Cancel file editing"
            className="inline-flex h-7 items-center gap-1 rounded-none border border-border bg-canvas px-2 text-[12px] text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {error ? <ErrorBanner className="px-3 py-2 text-[12px]">{error}</ErrorBanner> : null}

      {tab === "write" || !isMarkdown ? (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={18}
          spellCheck={false}
          disabled={saving}
          aria-label={`Edit ${filePath}`}
          className="w-full rounded-none border border-border bg-canvas p-3 font-mono text-[12px] leading-5 text-fg focus:border-fgMuted focus:outline-none"
        />
      ) : (
        <div className="rounded-none border border-border bg-canvas p-4">
          <MarkdownContent
            markdown={content || "_Nothing to preview yet._"}
            context={{
              owner,
              repo,
              ref: refShort,
              baseDir: filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "",
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-borderSubtle pt-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          disabled={saving}
          placeholder={`Update ${filePath}`}
          aria-label="Commit message"
          className="h-8 flex-1 rounded-none border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-none bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{saving ? "Committing…" : "Save & commit"}</span>
        </button>
      </div>
    </form>
  );
}

export function initBlobEditorIsland() {
  hydrateIsland<BlobEditorIslandProps>("blob-editor", BlobEditorIsland);
}
