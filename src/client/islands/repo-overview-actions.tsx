/// <reference lib="dom" />

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  FilePlus2,
  GitBranch,
  Globe,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Tag,
  X,
} from "lucide-react";

import { MarkdownContent } from "@/client/components/MarkdownContent";
import { hydrateIsland } from "@/client/hydrate";
import { buildGitCloneUrl, sanitizeRepoDescription } from "@/shared/admin/panel";

export type RepoOverviewActionsIslandProps = {
  owner: string;
  repo: string;
  repositoryId?: string;
  origin: string;
  refShort: string;
  canEditRepo: boolean;
  hasReadme: boolean;
};

type WebCommitResult =
  | { ok: true; path: string; commitOid: string; ref: string; unchanged: boolean }
  | { ok: false; reason: string; detail?: string };

const OPEN_NEW_FILE_EVENT = "goc:open-new-file";

type OpenNewFileDetail = {
  presetReadme: boolean;
};

export function RepoOverviewActionsIsland({
  owner,
  repo,
  repositoryId,
  origin,
  canEditRepo,
  hasReadme,
}: RepoOverviewActionsIslandProps) {
  const [codeOpen, setCodeOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const codeContainerRef = useRef<HTMLDivElement>(null);
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : origin;
  const cloneUrl = buildGitCloneUrl(runtimeOrigin, owner, repo);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!codeContainerRef.current?.contains(event.target as Node)) {
        setCodeOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCodeOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function copyText(value: string, kind: "url" | "snippet") {
    setCopyError(false);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      if (kind === "url") {
        setCopiedUrl(true);
        window.setTimeout(() => setCopiedUrl(false), 1600);
      } else {
        setCopiedSnippet(true);
        window.setTimeout(() => setCopiedSnippet(false), 1600);
      }
    } catch {
      setCopyError(true);
    }
  }

  function triggerNewFile(presetReadme: boolean) {
    setCodeOpen(false);
    if (typeof window !== "undefined") {
      const detail: OpenNewFileDetail = { presetReadme };
      window.dispatchEvent(new CustomEvent(OPEN_NEW_FILE_EVENT, { detail }));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canEditRepo && repositoryId && !hasReadme ? (
        <button
          type="button"
          onClick={() => triggerNewFile(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <FilePlus2
            className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
            aria-hidden="true"
          />
          <span>Add README</span>
        </button>
      ) : null}

      {canEditRepo && repositoryId ? (
        <button
          type="button"
          onClick={() => triggerNewFile(false)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Add file</span>
        </button>
      ) : null}

      <div ref={codeContainerRef} className="relative">
        <button
          type="button"
          onClick={() => setCodeOpen((open) => !open)}
          aria-expanded={codeOpen}
          aria-haspopup="dialog"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700"
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Code</span>
          <ChevronDown className="h-3 w-3 opacity-80" aria-hidden="true" />
        </button>

        {codeOpen ? (
          <div
            role="dialog"
            aria-label="Clone repository"
            className="absolute right-0 z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-zinc-200 bg-white p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Clone HTTPS</span>
              <button
                type="button"
                onClick={() => setCodeOpen(false)}
                aria-label="Close clone dialog"
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
              <input
                type="text"
                readOnly
                value={cloneUrl}
                aria-label="HTTPS clone URL"
                onFocus={(event) => event.currentTarget.select()}
                className="h-8 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[11px] text-zinc-800 focus:outline-none dark:text-zinc-200"
              />
              <button
                type="button"
                onClick={() => void copyText(cloneUrl, "url")}
                className="inline-flex h-8 shrink-0 items-center gap-1 border-l border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            {copyError ? (
              <p role="alert" className="m-0 mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                Clipboard unavailable — select the URL above and copy manually.
              </p>
            ) : null}
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>Use a scoped PAT for private clones or pushes.</span>
              <button
                type="button"
                onClick={() => void copyText(`git clone ${cloneUrl}`, "snippet")}
                className="shrink-0 font-medium text-accent-600 hover:underline dark:text-accent-400"
              >
                {copiedSnippet ? "Copied command" : "Copy git clone"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type RepoFileCreatorIslandProps = {
  owner: string;
  repo: string;
  repositoryId: string;
  refShort: string;
};

export function RepoFileCreatorIsland({
  owner,
  repo,
  repositoryId,
  refShort,
}: RepoFileCreatorIslandProps) {
  const [open, setOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    function onOpenEvent(event: Event) {
      const detail = (event as CustomEvent<OpenNewFileDetail>).detail;
      setCommitError(null);
      setSessionExpired(false);
      setEditorTab("write");
      if (detail?.presetReadme) {
        setFilePath("README.md");
        setFileContent(`# ${repo}\n\n`);
        setCommitMessage("Add README.md");
      } else {
        setFilePath("");
        setFileContent("");
        setCommitMessage("");
      }
      setOpen(true);
    }
    window.addEventListener(OPEN_NEW_FILE_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_NEW_FILE_EVENT, onOpenEvent);
  }, [repo]);

  if (!open) return null;

  async function handleCommitFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (committing) return;
    const cleanPath = filePath.trim().replace(/^\/+/, "");
    if (!cleanPath) {
      setCommitError("Please enter a file path (for example README.md or src/index.ts).");
      return;
    }
    setCommitting(true);
    setCommitError(null);
    setSessionExpired(false);
    try {
      const response = await fetch(
        `/auth/api/repositories/${encodeURIComponent(repositoryId)}/file`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: cleanPath,
            content: fileContent,
            message: commitMessage.trim() || `Add ${cleanPath}`,
            ref: refShort,
          }),
        }
      );
      if (response.status === 401) {
        setSessionExpired(true);
        setCommitError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as WebCommitResult | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setCommitError(
          reason === "invalid-path"
            ? "Invalid path. Avoid leading slashes, '..', or control characters."
            : reason === "repo-busy"
              ? "Repository is busy receiving another push. Try again shortly."
              : `Could not commit file (${reason}).`
        );
        return;
      }
      window.location.assign(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?ref=${encodeURIComponent(refShort)}`
      );
    } catch {
      setCommitError("Network error while committing file.");
    } finally {
      setCommitting(false);
    }
  }

  const isMarkdownFile =
    filePath.trim().toLowerCase().endsWith(".md") ||
    filePath.trim().toLowerCase().endsWith(".markdown");

  return (
    <form
      onSubmit={(event) => void handleCommitFile(event)}
      className="rounded-md border border-zinc-200 bg-white p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2.5 dark:border-zinc-800">
        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
          <FilePlus2
            className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
            aria-hidden="true"
          />
          <span>Commit new file to</span>
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
            {refShort}
          </code>
        </div>
        <div className="flex items-center gap-1.5">
          {isMarkdownFile ? (
            <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-950">
              <button
                type="button"
                onClick={() => setEditorTab("write")}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  editorTab === "write"
                    ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                }`}
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("preview")}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  editorTab === "preview"
                    ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                }`}
              >
                <Eye className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Preview</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={committing}
            aria-label="Cancel new file"
            className="rounded border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {commitError ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <span>{commitError}</span>
          {sessionExpired ? (
            <a href="/auth" className="ml-1.5 font-medium underline">
              Sign in
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <label
            htmlFor="new-file-path"
            className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
          >
            File path
          </label>
          <input
            id="new-file-path"
            type="text"
            value={filePath}
            onChange={(event) => setFilePath(event.target.value)}
            disabled={committing}
            placeholder="README.md or docs/getting-started.md"
            required
            className="h-8 w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        {editorTab === "write" || !isMarkdownFile ? (
          <div>
            <label
              htmlFor="new-file-content"
              className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
            >
              Contents
            </label>
            <textarea
              id="new-file-content"
              value={fileContent}
              onChange={(event) => setFileContent(event.target.value)}
              rows={10}
              spellCheck={false}
              disabled={committing}
              placeholder="Enter file contents..."
              className="w-full rounded-md border border-zinc-300 bg-zinc-50 p-2.5 font-mono text-xs leading-5 text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        ) : (
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/40">
            <MarkdownContent
              markdown={fileContent || "_Nothing to preview yet._"}
              context={{ owner, repo, ref: refShort, baseDir: "" }}
            />
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            disabled={committing}
            placeholder={filePath.trim() ? `Add ${filePath.trim()}` : "Commit message"}
            aria-label="Commit message"
            className="h-8 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={committing}
              className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={committing || !filePath.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{committing ? "Committing…" : "Commit file"}</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

export type RepoAboutCardIslandProps = {
  owner: string;
  repo: string;
  repositoryId?: string;
  initialDescription: string;
  initialPinned: boolean;
  visibility: "public" | "private";
  defaultBranch: string;
  branchCount: number;
  tagCount: number;
  canEditRepo: boolean;
};

type PatchRepoResponse =
  { ok: true; description: string; pinned: boolean } | { ok: false; reason?: string };

export function RepoAboutCardIsland({
  repositoryId,
  initialDescription,
  initialPinned,
  visibility,
  defaultBranch,
  branchCount,
  tagCount,
  canEditRepo,
}: RepoAboutCardIslandProps) {
  const [description, setDescription] = useState(initialDescription);
  const [draftDescription, setDraftDescription] = useState(initialDescription);
  const [editingDesc, setEditingDesc] = useState(false);
  const [pinned, setPinned] = useState(initialPinned);
  const [savingDesc, setSavingDesc] = useState(false);
  const [togglingPin, setTogglingPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  async function saveDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repositoryId || savingDesc) return;
    setSavingDesc(true);
    setError(null);
    setSessionExpired(false);
    const cleaned = sanitizeRepoDescription(draftDescription);
    try {
      const response = await fetch(`/auth/api/repositories/${encodeURIComponent(repositoryId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: cleaned }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as PatchRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        setError("Could not update description.");
        return;
      }
      setDescription(body.description);
      setDraftDescription(body.description);
      setEditingDesc(false);
    } catch {
      setError("Network error while saving description.");
    } finally {
      setSavingDesc(false);
    }
  }

  async function togglePin() {
    if (!repositoryId || togglingPin) return;
    setTogglingPin(true);
    setError(null);
    setSessionExpired(false);
    try {
      const response = await fetch(`/auth/api/repositories/${encodeURIComponent(repositoryId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as PatchRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        setError("Could not update pin state.");
        return;
      }
      setPinned(body.pinned);
    } catch {
      setError("Network error while toggling pin.");
    } finally {
      setTogglingPin(false);
    }
  }

  return (
    <section
      aria-label="About repository"
      className="rounded-md border border-zinc-200 bg-white p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          About
        </h3>
        {canEditRepo && repositoryId && !editingDesc ? (
          <button
            type="button"
            onClick={() => {
              setDraftDescription(description);
              setEditingDesc(true);
              setError(null);
              setSessionExpired(false);
            }}
            aria-label="Edit repository description"
            className="inline-flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
            <span>Edit</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="m-0 mb-2 text-[11px] text-red-600 dark:text-red-400">
          <span>{error}</span>
          {sessionExpired ? (
            <a href="/auth" className="ml-1.5 font-medium underline">
              Sign in
            </a>
          ) : null}
        </p>
      ) : null}

      {editingDesc ? (
        <form onSubmit={(event) => void saveDescription(event)} className="mb-3 space-y-2">
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            maxLength={200}
            rows={3}
            disabled={savingDesc}
            placeholder="Short description of this repository..."
            aria-label="Repository description"
            className="w-full rounded-md border border-zinc-300 bg-zinc-50 p-2 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditingDesc(false)}
              disabled={savingDesc}
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDesc}
              className="rounded bg-accent-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {savingDesc ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <p className="m-0 mb-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {description || (
            <span className="italic text-zinc-400 dark:text-zinc-500">
              No description, website, or topics provided.
            </span>
          )}
        </p>
      )}

      <dl className="m-0 space-y-1.5 border-t border-zinc-200 pt-2.5 text-xs dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            {visibility === "private" ? (
              <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            ) : (
              <Globe
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            )}
            <span>Visibility</span>
          </dt>
          <dd className="m-0 text-xs font-medium capitalize text-zinc-800 dark:text-zinc-200">
            {visibility}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Branches</span>
          </dt>
          <dd className="m-0 text-xs text-zinc-800 tabular-nums dark:text-zinc-200">
            <span>{branchCount}</span>{" "}
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              (default: <code className="font-mono">{defaultBranch}</code>)
            </span>
          </dd>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tags</span>
          </dt>
          <dd className="m-0 text-xs text-zinc-800 tabular-nums dark:text-zinc-200">{tagCount}</dd>
        </div>
      </dl>

      {canEditRepo && repositoryId ? (
        <div className="mt-3 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void togglePin()}
            disabled={togglingPin}
            className={`inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-50 ${
              pinned
                ? "border-accent-500/40 bg-accent-500/10 text-accent-700 hover:bg-accent-500/15 dark:text-accent-300"
                : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {pinned ? (
              <>
                <PinOff className="h-3 w-3" aria-hidden="true" />
                <span>Pinned to profile · Unpin</span>
              </>
            ) : (
              <>
                <Pin className="h-3 w-3" aria-hidden="true" />
                <span>Pin to profile</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function initRepoOverviewActionsIsland() {
  hydrateIsland<RepoOverviewActionsIslandProps>("repo-overview-actions", RepoOverviewActionsIsland);
  hydrateIsland<RepoFileCreatorIslandProps>("repo-file-creator", RepoFileCreatorIsland);
  hydrateIsland<RepoAboutCardIslandProps>("repo-about-card", RepoAboutCardIsland);
}
