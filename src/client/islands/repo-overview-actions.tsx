/// <reference lib="dom" />

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  FilePlus2,
  FolderPlus,
  GitBranch,
  Globe,
  Home,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { MarkdownContent } from "@/client/components/MarkdownContent";
import { hydrateIsland } from "@/client/hydrate";
import { copyToClipboard, showToast } from "@/client/components/ui";
import { buildGitCloneUrl, sanitizeRepoDescription } from "@/shared/admin/panel";

export type RepoOverviewActionsIslandProps = {
  owner: string;
  repo: string;
  repositoryId?: string;
  origin: string;
  refShort: string;
  canEditRepo: boolean;
  hasReadme: boolean;
  basePath?: string;
  showCodeDropdown?: boolean;
};

type WebCommitResult =
  | { ok: true; path: string; commitOid: string; ref: string; unchanged: boolean }
  | { ok: false; reason: string; detail?: string };

const OPEN_NEW_FILE_EVENT = "goc:open-new-file";

type OpenNewFileDetail = {
  mode: "file" | "folder" | "upload";
  presetReadme?: boolean;
};

export function RepoOverviewActionsIsland({
  owner,
  repo,
  repositoryId,
  origin,
  canEditRepo,
  hasReadme,
  showCodeDropdown = true,
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
    const copied = await copyToClipboard(value, {
      label: kind === "url" ? "HTTPS clone URL" : "git clone command",
      successTitle: kind === "url" ? "Clone URL copied" : "Clone command copied",
    });
    if (!copied) {
      setCopyError(true);
      return;
    }
    if (kind === "url") {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } else {
      setCopiedSnippet(true);
      window.setTimeout(() => setCopiedSnippet(false), 1600);
    }
  }

  function triggerCreator(detail: OpenNewFileDetail) {
    setCodeOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPEN_NEW_FILE_EVENT, { detail }));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canEditRepo && repositoryId && !hasReadme ? (
        <button
          type="button"
          onClick={() => triggerCreator({ mode: "file", presetReadme: true })}
          className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
        >
          <FilePlus2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          <span>Add README</span>
        </button>
      ) : null}

      {canEditRepo && repositoryId ? (
        <>
          <button
            type="button"
            onClick={() => triggerCreator({ mode: "file", presetReadme: false })}
            className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <FilePlus2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>Add file</span>
          </button>
          <button
            type="button"
            onClick={() => triggerCreator({ mode: "folder" })}
            className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <FolderPlus className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>New folder</span>
          </button>
          <button
            type="button"
            onClick={() => triggerCreator({ mode: "upload" })}
            className="inline-flex h-7 items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <Upload className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>Upload file</span>
          </button>
        </>
      ) : null}

      {showCodeDropdown ? (
        <div ref={codeContainerRef} className="relative">
          <button
            type="button"
            onClick={() => setCodeOpen((open) => !open)}
            aria-expanded={codeOpen}
            aria-haspopup="dialog"
            className="inline-flex h-7 items-center gap-1.5 rounded-none bg-fg px-3 text-[12px] font-semibold text-canvas hover:bg-fgHover"
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Code</span>
            <ChevronDown className="h-3 w-3 opacity-80" aria-hidden="true" />
          </button>

          {codeOpen ? (
            <div
              role="dialog"
              aria-label="Clone repository"
              className="absolute right-0 z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-none border border-border bg-surface p-3.5 text-[12px]"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-fg">Clone HTTPS</span>
                <button
                  type="button"
                  onClick={() => setCodeOpen(false)}
                  aria-label="Close clone dialog"
                  className="rounded-none p-0.5 text-fgMuted hover:bg-surfaceHover hover:text-fg"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-center overflow-hidden rounded-none border border-border bg-canvas">
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
      ) : null}
    </div>
  );
}

export type RepoFileCreatorIslandProps = {
  owner: string;
  repo: string;
  repositoryId: string;
  refShort: string;
  basePath?: string;
};

function prefixPath(basePath: string | undefined, leaf: string): string {
  const cleanBase = (basePath || "").replace(/^\/+|\/+$/g, "");
  return cleanBase ? `${cleanBase}/${leaf}` : leaf;
}

export function RepoFileCreatorIsland({
  owner,
  repo,
  repositoryId,
  refShort,
  basePath = "",
}: RepoFileCreatorIslandProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "folder" | "upload">("file");
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    function onOpenEvent(event: Event) {
      const detail = (event as CustomEvent<OpenNewFileDetail>).detail;
      const nextMode = detail?.mode ?? "file";
      setMode(nextMode);
      setCommitError(null);
      setSessionExpired(false);
      setEditorTab("write");
      setSelectedFile(null);
      if (nextMode === "file" && detail?.presetReadme) {
        setFilePath(prefixPath(basePath, "README.md"));
        setFileContent(`# ${repo}\n\n`);
        setCommitMessage("Add README.md");
      } else if (nextMode === "folder") {
        setFilePath(prefixPath(basePath, "new-folder/.gitkeep"));
        setFileContent("");
        setCommitMessage("Create directory");
      } else {
        setFilePath(basePath ? `${basePath.replace(/^\/+|\/+$/g, "")}/` : "");
        setFileContent("");
        setCommitMessage("");
      }
      setOpen(true);
    }
    window.addEventListener(OPEN_NEW_FILE_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_NEW_FILE_EVENT, onOpenEvent);
  }, [repo, basePath]);

  if (!open) return null;

  function destinationAfterCommit(): string {
    const cleanBase = basePath.replace(/^\/+|\/+$/g, "");
    if (cleanBase) {
      return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree?ref=${encodeURIComponent(refShort)}&path=${encodeURIComponent(cleanBase)}`;
    }
    return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?ref=${encodeURIComponent(refShort)}`;
  }

  async function handleCommitFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (committing) return;
    const cleanPath = filePath.trim().replace(/^\/+/, "");
    if (mode === "upload" && !selectedFile) {
      setCommitError("Please choose a file from your device to upload.");
      return;
    }
    if (!cleanPath || cleanPath.endsWith("/")) {
      setCommitError(
        "Please enter a valid target file path (for example README.md or assets/logo.png)."
      );
      return;
    }

    setCommitting(true);
    setCommitError(null);
    setSessionExpired(false);
    try {
      let response: Response;
      if (mode === "upload" && selectedFile) {
        const formData = new FormData();
        formData.set("file", selectedFile);
        formData.set("path", cleanPath);
        formData.set("message", commitMessage.trim() || `Upload ${cleanPath}`);
        formData.set("ref", refShort);
        response = await fetch(
          `/auth/api/repositories/${encodeURIComponent(repositoryId)}/file/upload`,
          {
            method: "POST",
            credentials: "same-origin",
            body: formData,
          }
        );
      } else {
        response = await fetch(`/auth/api/repositories/${encodeURIComponent(repositoryId)}/file`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: cleanPath,
            content: fileContent,
            message: commitMessage.trim() || `Add ${cleanPath}`,
            ref: refShort,
          }),
        });
      }

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
            : reason === "too-large"
              ? "File exceeds the maximum browser commit/upload size limit (2 MiB upload / 256 KiB text)."
              : reason === "repo-busy"
                ? "Repository is busy receiving another push. Try again shortly."
                : `Could not commit file (${reason}).`
        );
        return;
      }
      window.location.assign(destinationAfterCommit());
    } catch {
      setCommitError("Network error while committing file.");
    } finally {
      setCommitting(false);
    }
  }

  const isMarkdownFile =
    mode === "file" &&
    (filePath.trim().toLowerCase().endsWith(".md") ||
      filePath.trim().toLowerCase().endsWith(".markdown"));

  const headingLabel =
    mode === "upload"
      ? "Upload file to"
      : mode === "folder"
        ? "Create folder in"
        : "Commit new file to";

  return (
    <form
      onSubmit={(event) => void handleCommitFile(event)}
      className="rounded-none border border-border bg-surface p-3.5 text-[12px]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-borderSubtle pb-2.5">
        <div className="flex items-center gap-2 font-semibold text-fg">
          {mode === "upload" ? (
            <Upload className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          ) : mode === "folder" ? (
            <FolderPlus className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          ) : (
            <FilePlus2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          )}
          <span>{headingLabel}</span>
          <code className="rounded-none border border-borderSubtle bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fgBody">
            {refShort}
          </code>
        </div>
        <div className="flex items-center gap-1.5">
          {isMarkdownFile ? (
            <div className="inline-flex rounded-none border border-border bg-canvas p-0.5">
              <button
                type="button"
                onClick={() => setEditorTab("write")}
                className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[11px] font-medium ${
                  editorTab === "write" ? "bg-surfaceHover text-fg" : "text-fgMuted hover:text-fg"
                }`}
              >
                <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("preview")}
                className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[11px] font-medium ${
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
            aria-label="Cancel file action"
            className="rounded-none border border-border bg-canvas p-1 text-fgMuted hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {commitError ? (
        <div
          role="alert"
          className="mb-3 rounded-none border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
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
        {mode === "upload" ? (
          <div>
            <label
              htmlFor="upload-file-input"
              className="mb-1 block text-[12px] font-medium text-fg"
            >
              Choose file (text or binary, up to 2 MiB)
            </label>
            <input
              id="upload-file-input"
              type="file"
              disabled={committing}
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                setSelectedFile(picked);
                if (picked) {
                  setFilePath((prev) => {
                    const cleanPrev = prev.trim().replace(/^\/+/, "");
                    if (!cleanPrev || cleanPrev.endsWith("/")) {
                      return `${cleanPrev}${picked.name}`;
                    }
                    return prefixPath(basePath, picked.name);
                  });
                }
              }}
              className="block w-full rounded-none border border-border bg-canvas px-2.5 py-1.5 text-[12px] text-fg file:mr-3 file:rounded-none file:border file:border-border file:bg-surface file:px-2.5 file:py-1 file:text-[11px] file:font-medium file:text-fgBody"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="new-file-path" className="mb-1 block text-[12px] font-medium text-fg">
            {mode === "folder" ? "Folder placeholder path" : "File path"}
          </label>
          <input
            id="new-file-path"
            type="text"
            value={filePath}
            onChange={(event) => setFilePath(event.target.value)}
            disabled={committing}
            placeholder={
              mode === "folder"
                ? "docs/.gitkeep"
                : mode === "upload"
                  ? "assets/diagram.png"
                  : "README.md or docs/getting-started.md"
            }
            required
            className="h-8 w-full rounded-none border border-border bg-canvas px-2.5 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
          />
          {mode === "folder" ? (
            <p className="m-0 mt-1 text-[11px] text-fgMuted">
              Git tracks files rather than empty directories; keeping a{" "}
              <code className="font-mono">.gitkeep</code> creates the folder path.
            </p>
          ) : null}
        </div>

        {mode === "file" ? (
          editorTab === "write" || !isMarkdownFile ? (
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
                className="w-full rounded-none border border-border bg-canvas p-2.5 font-mono text-[12px] leading-5 text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
              />
            </div>
          ) : (
            <div className="rounded-none border border-border bg-canvas p-3.5">
              <MarkdownContent
                markdown={fileContent || "_Nothing to preview yet._"}
                context={{ owner, repo, ref: refShort, baseDir: basePath }}
              />
            </div>
          )
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            disabled={committing}
            placeholder={
              filePath.trim()
                ? `${mode === "upload" ? "Upload" : "Add"} ${filePath.trim()}`
                : "Commit message"
            }
            aria-label="Commit message"
            className="h-8 flex-1 rounded-none border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={committing}
              className="inline-flex h-8 items-center rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={committing || !filePath.trim() || (mode === "upload" && !selectedFile)}
              className="inline-flex h-8 items-center gap-1.5 rounded-none bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {committing ? "Committing…" : mode === "upload" ? "Upload & commit" : "Commit file"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

export type RepoRefLinkItem = {
  name: string;
  displayName: string;
};

export type RepoRefsManagerIslandProps = {
  owner: string;
  repo: string;
  branches: RepoRefLinkItem[];
  tags: RepoRefLinkItem[];
  defaultBranch: string;
  currentRef: string;
  canManageRefs: boolean;
};

export function RepoRefsManagerIsland({
  owner,
  repo,
  branches: initialBranches,
  tags: initialTags,
  defaultBranch: initialDefaultBranch,
  currentRef,
  canManageRefs,
}: RepoRefsManagerIslandProps) {
  const [branches, setBranches] = useState<RepoRefLinkItem[]>(initialBranches);
  const [tags, setTags] = useState<RepoRefLinkItem[]>(initialTags);
  const [defaultBranch, setDefaultBranch] = useState(initialDefaultBranch);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refKind, setRefKind] = useState<"branch" | "tag">("branch");
  const [newName, setNewName] = useState("");
  const [sourceRef, setSourceRef] = useState(currentRef || initialDefaultBranch || "HEAD");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasAnySourceRef = branches.length > 0 || tags.length > 0;

  async function handleCreateRef(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/admin/refs`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: refKind,
            name: newName.trim(),
            sourceRef: sourceRef || "HEAD",
          }),
        }
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        ref?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.ok) {
        const msg = body?.error || `Failed to create ${refKind} (HTTP ${response.status}).`;
        setError(msg);
        showToast({ tone: "error", title: `Could not create ${refKind}`, message: msg });
        return;
      }
      const short = newName
        .trim()
        .replace(/^refs\/heads\//, "")
        .replace(/^refs\/tags\//, "");
      if (refKind === "tag") {
        setTags((prev) => [...prev, { name: encodeURIComponent(short), displayName: short }]);
      } else {
        setBranches((prev) => [...prev, { name: encodeURIComponent(short), displayName: short }]);
      }
      setNewName("");
      setShowCreateForm(false);
      window.location.assign(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?ref=${encodeURIComponent(short)}`
      );
    } catch {
      const msg = "Network error while creating ref.";
      setError(msg);
      showToast({ tone: "error", title: `Could not create ${refKind}`, message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefaultBranch(branchDisplayName: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/admin/head`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: `refs/heads/${branchDisplayName}`,
          }),
        }
      );
      if (!response.ok) {
        const msg = `Could not change default branch (HTTP ${response.status}).`;
        setError(msg);
        showToast({ tone: "error", title: "Default branch update failed", message: msg });
        return;
      }
      setDefaultBranch(branchDisplayName);
      showToast({
        tone: "success",
        title: "Default branch updated",
        message: branchDisplayName,
      });
    } catch {
      const msg = "Network error while updating default branch.";
      setError(msg);
      showToast({ tone: "error", title: "Default branch update failed", message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRef(fullRefName: string, isTag: boolean, displayName: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/admin/refs`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fullRefName }),
        }
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !body?.ok) {
        const msg = body?.error || `Could not delete ref (HTTP ${response.status}).`;
        setError(msg);
        showToast({ tone: "error", title: "Ref delete failed", message: msg });
        return;
      }
      if (isTag) {
        setTags((prev) => prev.filter((item) => item.displayName !== displayName));
      } else {
        setBranches((prev) => prev.filter((item) => item.displayName !== displayName));
      }
      setConfirmDelete(null);
      showToast({
        tone: "success",
        title: isTag ? "Tag deleted" : "Branch deleted",
        message: displayName,
      });
    } catch {
      const msg = "Network error while deleting ref.";
      setError(msg);
      showToast({ tone: "error", title: "Ref delete failed", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Branches and tags"
      className="rounded-none border border-border bg-surface p-4 text-[12px]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          <GitBranch className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          <span>Branches</span>
        </h3>
        {canManageRefs && hasAnySourceRef ? (
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((open) => !open);
              setError(null);
            }}
            className="inline-flex items-center gap-1 rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
          >
            <Plus className="h-2.5 w-2.5" aria-hidden="true" />
            <span>New ref</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="m-0 mb-2 text-[11px] text-red-400">
          {error}
        </p>
      ) : null}

      {canManageRefs && showCreateForm && hasAnySourceRef ? (
        <form
          onSubmit={(event) => void handleCreateRef(event)}
          className="mb-3 space-y-2 rounded-none border border-borderSubtle bg-canvas p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Ref type"
              value={refKind}
              onChange={(event) => setRefKind(event.target.value === "tag" ? "tag" : "branch")}
              disabled={busy}
              className="h-7 rounded-none border border-border bg-surface px-1.5 text-[11px] text-fg"
            >
              <option value="branch">Branch</option>
              <option value="tag">Tag</option>
            </select>
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              disabled={busy}
              placeholder={refKind === "tag" ? "v1.0.0" : "feat/new-branch"}
              aria-label="New ref name"
              required
              className="h-7 min-w-0 flex-1 rounded-none border border-border bg-surface px-2 font-mono text-[11px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="new-ref-source" className="shrink-0 text-[11px] text-fgMuted">
              From:
            </label>
            <select
              id="new-ref-source"
              value={sourceRef}
              onChange={(event) => setSourceRef(event.target.value)}
              disabled={busy}
              className="h-7 min-w-0 flex-1 rounded-none border border-border bg-surface px-1.5 font-mono text-[11px] text-fg"
            >
              {branches.map((branch) => (
                <option key={`src-b-${branch.displayName}`} value={branch.displayName}>
                  {branch.displayName}
                </option>
              ))}
              {tags.map((tag) => (
                <option key={`src-t-${tag.displayName}`} value={tag.displayName}>
                  tag:{tag.displayName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="inline-flex h-7 items-center rounded-none bg-fg px-2.5 text-[11px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      ) : null}

      {branches.length ? (
        <ul className="m-0 list-none divide-y divide-borderSubtle p-0">
          {branches.map((branch) => {
            const fullRef = `refs/heads/${branch.displayName}`;
            const isDefault = branch.displayName === defaultBranch;
            const isConfirming = confirmDelete === fullRef;
            return (
              <li
                key={branch.name}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <a
                    href={`/${owner}/${repo}/tree?ref=${branch.name}`}
                    className="truncate font-mono text-[12px] text-fgBody no-underline hover:text-accent hover:underline"
                  >
                    {branch.displayName}
                  </a>
                  {isDefault ? (
                    <span className="rounded-none border border-borderSubtle bg-canvas px-1 py-0.5 text-[10px] text-fgMuted">
                      default
                    </span>
                  ) : null}
                </div>
                {canManageRefs && !isDefault ? (
                  <div className="flex items-center gap-1">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteRef(fullRef, false, branch.displayName)}
                          className="rounded-none border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/25"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-fgMuted hover:text-fg"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSetDefaultBranch(branch.displayName)}
                          title={`Set ${branch.displayName} as default branch`}
                          className="rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-fgMuted hover:bg-surfaceHover hover:text-fg"
                        >
                          Default
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDelete(fullRef)}
                          aria-label={`Delete branch ${branch.displayName}`}
                          className="rounded-none border border-border bg-canvas p-0.5 text-fgMuted hover:border-red-500/40 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 text-[12px] text-fgMuted">No branches yet</p>
      )}

      {tags.length > 0 ? (
        <div className="mt-3 border-t border-border pt-3">
          <h4 className="m-0 mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">
            <Tag className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>Tags</span>
          </h4>
          <ul className="m-0 list-none divide-y divide-borderSubtle p-0">
            {tags.map((tag) => {
              const fullRef = `refs/tags/${tag.displayName}`;
              const isConfirming = confirmDelete === fullRef;
              return (
                <li
                  key={tag.name}
                  className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                >
                  <a
                    href={`/${owner}/${repo}/tree?ref=${tag.name}`}
                    className="truncate font-mono text-[12px] text-fgBody no-underline hover:text-accent hover:underline"
                  >
                    {tag.displayName}
                  </a>
                  {canManageRefs ? (
                    <div className="flex items-center gap-1">
                      {isConfirming ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteRef(fullRef, true, tag.displayName)}
                            className="rounded-none border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/25"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDelete(null)}
                            className="rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-fgMuted hover:text-fg"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDelete(fullRef)}
                          aria-label={`Delete tag ${tag.displayName}`}
                          className="rounded-none border border-border bg-canvas p-0.5 text-fgMuted hover:border-red-500/40 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
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
        const msg = "Could not update description.";
        setError(msg);
        showToast({ tone: "error", title: "Description update failed", message: msg });
        return;
      }
      setDescription(body.description);
      setDraftDescription(body.description);
      setEditingDesc(false);
      showToast({
        tone: "success",
        title: "Repository description updated",
      });
    } catch {
      const msg = "Network error while saving description.";
      setError(msg);
      showToast({ tone: "error", title: "Description update failed", message: msg });
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
        const msg = "Could not update pin state.";
        setError(msg);
        showToast({ tone: "error", title: "Pin update failed", message: msg });
        return;
      }
      setPinned(body.pinned);
      showToast({
        tone: "success",
        title: body.pinned ? "Pinned to profile" : "Unpinned from profile",
      });
    } catch {
      const msg = "Network error while toggling pin.";
      setError(msg);
      showToast({ tone: "error", title: "Pin update failed", message: msg });
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
        const msg =
          reason === "private-repo-cannot-feature"
            ? "Only public repositories can be pinned to the public homepage."
            : "Could not update homepage pin state.";
        setError(msg);
        showToast({ tone: "error", title: "Homepage pin update failed", message: msg });
        return;
      }
      setHomePinned(Boolean(body.homePinned));
      showToast({
        tone: "success",
        title: body.homePinned ? "Pinned to public homepage" : "Removed from homepage",
      });
    } catch {
      const msg = "Network error while updating homepage pin.";
      setError(msg);
      showToast({ tone: "error", title: "Homepage pin update failed", message: msg });
    } finally {
      setTogglingHomePin(false);
    }
  }

  return (
    <section
      aria-label="About repository"
      className="rounded-none border border-border bg-surface p-3.5 text-[12px]"
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
            className="inline-flex items-center gap-1 rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
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
            className="w-full rounded-none border border-border bg-canvas p-2 text-[12px] text-fg focus:border-fgMuted focus:outline-none"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditingDesc(false)}
              disabled={savingDesc}
              className="rounded-none border border-border bg-canvas px-2 py-1 text-[11px] text-fgBody hover:bg-surfaceHover hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDesc}
              className="rounded-none bg-fg px-2.5 py-1 text-[11px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
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
              className={`inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-none border text-[12px] font-medium transition-colors disabled:opacity-50 ${
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
              className={`inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-none border text-[12px] font-medium transition-colors disabled:opacity-50 ${
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
  hydrateIsland<RepoRefsManagerIslandProps>("repo-refs-manager", RepoRefsManagerIsland);
}
