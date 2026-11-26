/// <reference lib="dom" />

import { useEffect, useState, type FormEvent } from "react";
import { Check, Eye, Pencil, X } from "lucide-react";

import { MarkdownContent } from "@/client/components/MarkdownContent";
import { hydrateIsland } from "@/client/hydrate";

export type BlobEditorIslandProps = {
  owner: string;
  repo: string;
  repositoryId: string;
  filePath: string;
  refShort: string;
  initialContent: string;
  isMarkdown?: boolean;
};

type SaveBlobResponse =
  { ok: true; commitOid: string; ref: string; unchanged: boolean } | { ok: false; reason?: string };

export function BlobEditorIsland({
  owner,
  repo,
  repositoryId,
  filePath,
  refShort,
  initialContent,
  isMarkdown = false,
}: BlobEditorIslandProps) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [commitMessage, setCommitMessage] = useState(`Update ${filePath}`);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const readonlyEl = document.getElementById("blob-readonly-view");
    if (!readonlyEl) return;
    readonlyEl.hidden = editing;
  }, [editing]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
      const body = (await response.json().catch(() => null)) as SaveBlobResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(
          reason === "repo-busy"
            ? "Repository is busy receiving another push. Try again shortly."
            : `Failed to commit file (${reason}).`
        );
        return;
      }
      window.location.assign(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob?ref=${encodeURIComponent(refShort)}&path=${encodeURIComponent(filePath)}`
      );
    } catch {
      setError("Network error while committing changes.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-end border-b border-borderSubtle bg-surface px-3 py-2 text-[12px]">
        <button
          type="button"
          onClick={() => {
            setContent(initialContent);
            setCommitMessage(`Update ${filePath}`);
            setTab("write");
            setError(null);
            setEditing(true);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
        >
          <Pencil className="h-3 w-3 text-fgMuted" aria-hidden="true" />
          <span>Edit file</span>
        </button>
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
          <span className="rounded border border-borderSubtle bg-canvas px-1.5 py-0.5 text-[11px] text-fgBody">
            {refShort}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isMarkdown ? (
            <div className="inline-flex rounded-md border border-border bg-canvas p-0.5">
              <button
                type="button"
                onClick={() => setTab("write")}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  tab === "write" ? "bg-surfaceHover text-fg" : "text-fgMuted hover:text-fg"
                }`}
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
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
            onClick={() => setEditing(false)}
            disabled={saving}
            aria-label="Cancel file editing"
            className="inline-flex h-7 items-center gap-1 rounded border border-border bg-canvas px-2 text-[12px] text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
        >
          {error}
        </div>
      ) : null}

      {tab === "write" || !isMarkdown ? (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={18}
          spellCheck={false}
          disabled={saving}
          aria-label={`Edit ${filePath}`}
          className="w-full rounded-md border border-border bg-canvas p-3 font-mono text-[12px] leading-5 text-fg focus:border-fgMuted focus:outline-none"
        />
      ) : (
        <div className="rounded-md border border-border bg-canvas p-4">
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
          className="h-8 flex-1 rounded-md border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
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
