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
  Home,
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
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
        >
          <FilePlus2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          <span>Add README</span>
        </button>
      ) : null}

      {canEditRepo && repositoryId ? (
        <button
          type="button"
          onClick={() => triggerNewFile(false)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
        >
          <FilePlus2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          <span>Add file</span>
        </button>
      ) : null}

      <div ref={codeContainerRef} className="relative">
        <button
          type="button"
          onClick={() => setCodeOpen((open) => !open)}
          aria-expanded={codeOpen}
          aria-haspopup="dialog"
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-fg px-3 text-[12px] font-semibold text-canvas hover:bg-fgHover"
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Code</span>
          <ChevronDown className="h-3 w-3 opacity-80" aria-hidden="true" />
        </button>

        {codeOpen ? (
          <div
            role="dialog"
            aria-label="Clone repository"
            className="absolute right-0 z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface p-3.5 text-[12px]"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-fg">Clone HTTPS</span>
              <button
                type="button"
                onClick={() => setCodeOpen(false)}
                aria-label="Close clone dialog"
                className="rounded p-0.5 text-fgMuted hover:bg-surfaceHover hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center overflow-hidden rounded-md border border-border bg-canvas">
              <input
                type="text"
                readOnly
                value={cloneUrl}
                aria-label="HTTPS clone URL"
                onFocus={(event) => event.currentTarget.select()}
                className="h-8 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[12px] text-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void copyText(cloneUrl, "url")}
                className="inline-flex h-8 shrink-0 items-center gap-1 border-l border-border bg-surface px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
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
              <p role="alert" className="m-0 mt-2 text-[11px] text-amber-300">
                Clipboard unavailable — select the URL above and copy manually.
              </p>
            ) : null}
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-fgMuted">
              <span>Use a scoped PAT for private clones or pushes.</span>
              <button
                type="button"
                onClick={() => void copyText(`git clone ${cloneUrl}`, "snippet")}
                className="shrink-0 font-medium text-accent hover:underline"
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
      className="rounded-md border border-border bg-surface p-3.5 text-[12px]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-borderSubtle pb-2.5">
        <div className="flex items-center gap-2 font-semibold text-fg">
          <FilePlus2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          <span>Commit new file to</span>
          <code className="rounded border border-borderSubtle bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fgBody">
            {refShort}
          </code>
        </div>
        <div className="flex items-center gap-1.5">
          {isMarkdownFile ? (
            <div className="inline-flex rounded-md border border-border bg-canvas p-0.5">
              <button
                type="button"
                onClick={() => setEditorTab("write")}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  editorTab === "write" ? "bg-surfaceHover text-fg" : "text-fgMuted hover:text-fg"
                }`}
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("preview")}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  editorTab === "preview" ? "bg-surfaceHover text-fg" : "text-fgMuted hover:text-fg"
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
            className="rounded border border-border bg-canvas p-1 text-fgMuted hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {commitError ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
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
          <label htmlFor="new-file-path" className="mb-1 block text-[12px] font-medium text-fg">
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
            className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
          />
        </div>

        {editorTab === "write" || !isMarkdownFile ? (
          <div>
            <label
              htmlFor="new-file-content"
              className="mb-1 block text-[12px] font-medium text-fg"
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
              className="w-full rounded-md border border-border bg-canvas p-2.5 font-mono text-[12px] leading-5 text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
            />
          </div>
        ) : (
          <div className="rounded-md border border-border bg-canvas p-3.5">
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
            className="h-8 flex-1 rounded-md border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={committing}
              className="inline-flex h-8 items-center rounded-md border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={committing || !filePath.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
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
  initialHomePinned?: boolean;
  visibility: "public" | "private";
  defaultBranch: string;
  branchCount: number;
  tagCount: number;
  canEditRepo: boolean;
  canPinRepo?: boolean;
  canFeatureHomepage?: boolean;
};

type PatchRepoResponse =
  | { ok: true; description: string; pinned: boolean; homePinned?: boolean }
  | { ok: false; reason?: string };

export function RepoAboutCardIsland({
  repositoryId,
  initialDescription,
  initialPinned,
  initialHomePinned = false,
  visibility,
  defaultBranch,
  branchCount,
  tagCount,
  canEditRepo,
  canPinRepo = canEditRepo,
  canFeatureHomepage = false,
}: RepoAboutCardIslandProps) {
  const [description, setDescription] = useState(initialDescription);
  const [draftDescription, setDraftDescription] = useState(initialDescription);
  const [editingDesc, setEditingDesc] = useState(false);
  const [pinned, setPinned] = useState(initialPinned);
  const [homePinned, setHomePinned] = useState(initialHomePinned);
  const [savingDesc, setSavingDesc] = useState(false);
  const [togglingPin, setTogglingPin] = useState(false);
  const [togglingHomePin, setTogglingHomePin] = useState(false);
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

  async function toggleHomePin() {
    if (!repositoryId || togglingHomePin || visibility === "private") return;
    setTogglingHomePin(true);
    setError(null);
    setSessionExpired(false);
    try {
      const response = await fetch(`/auth/api/repositories/${encodeURIComponent(repositoryId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homePinned: !homePinned }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as PatchRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : undefined;
        setError(
          reason === "private-repo-cannot-feature"
            ? "Only public repositories can be pinned to the public homepage."
            : "Could not update homepage pin state."
        );
        return;
      }
      setHomePinned(Boolean(body.homePinned));
    } catch {
      setError("Network error while updating homepage pin.");
    } finally {
      setTogglingHomePin(false);
    }
  }

  return (
    <section
      aria-label="About repository"
      className="rounded-md border border-border bg-surface p-3.5 text-[12px]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-fg">About</h3>
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
            className="inline-flex items-center gap-1 rounded border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
            <span>Edit</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="m-0 mb-2 text-[11px] text-red-400">
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
            className="w-full rounded-md border border-border bg-canvas p-2 text-[12px] text-fg focus:border-fgMuted focus:outline-none"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditingDesc(false)}
              disabled={savingDesc}
              className="rounded border border-border bg-canvas px-2 py-1 text-[11px] text-fgBody hover:bg-surfaceHover hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDesc}
              className="rounded bg-fg px-2.5 py-1 text-[11px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
            >
              {savingDesc ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <p className="m-0 mb-3 text-[13px] leading-[1.45] text-fgBody">
          {description || (
            <span className="italic text-fgMuted">
              No description, website, or topics provided.
            </span>
          )}
        </p>
      )}

      <dl className="m-0 space-y-1.5 border-t border-borderSubtle pt-2.5 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-fgMuted">
            {visibility === "private" ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            )}
            <span>Visibility</span>
          </dt>
          <dd className="m-0 text-[12px] font-medium capitalize text-fg">{visibility}</dd>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-fgMuted">
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Branches</span>
          </dt>
          <dd className="m-0 text-[12px] text-fg tabular-nums">
            <span>{branchCount}</span>{" "}
            <span className="text-[11px] text-fgMuted">
              (default: <code className="font-mono text-fgBody">{defaultBranch}</code>)
            </span>
          </dd>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-fgMuted">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tags</span>
          </dt>
          <dd className="m-0 text-[12px] text-fg tabular-nums">{tagCount}</dd>
        </div>
      </dl>

      {(canPinRepo || canFeatureHomepage) && repositoryId ? (
        <div className="mt-3 space-y-1.5 border-t border-borderSubtle pt-2.5">
          {canPinRepo ? (
            <button
              type="button"
              onClick={() => void togglePin()}
              disabled={togglingPin}
              className={`inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                pinned
                  ? "border-border bg-surfaceHover text-fg"
                  : "border-border bg-canvas text-fgBody hover:bg-surfaceHover hover:text-fg"
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
          ) : null}

          {canFeatureHomepage ? (
            <button
              type="button"
              onClick={() => void toggleHomePin()}
              disabled={togglingHomePin || visibility === "private"}
              title={
                visibility === "private"
                  ? "Make repository public to pin it on the public homepage"
                  : homePinned
                    ? "Remove from main public homepage"
                    : "Feature on main public homepage"
              }
              className={`inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                homePinned
                  ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
                  : "border-border bg-canvas text-fgBody hover:bg-surfaceHover hover:text-fg"
              }`}
            >
              <Home className="h-3 w-3" aria-hidden="true" />
              <span>
                {visibility === "private"
                  ? "Homepage pin (public only)"
                  : homePinned
                    ? "Pinned on homepage · Unpin"
                    : "Pin to homepage"}
              </span>
            </button>
          ) : null}
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
