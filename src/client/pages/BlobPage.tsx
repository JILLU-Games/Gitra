import { Breadcrumbs } from "@/client/components/Breadcrumbs";
import { CodeViewer } from "@/client/components/CodeViewer";
import { MarkdownContent } from "@/client/components/MarkdownContent";
import { RepoNav } from "@/client/components/RepoNav";
import { BlobActionsIsland } from "@/client/islands/blob-actions";
import { BlobEditorIsland } from "@/client/islands/blob-editor";
import { IslandHost } from "@/client/server/IslandHost";

type BreadcrumbItem = {
  name: string;
  href: string | null;
};

export type BlobPageProps = {
  owner: string;
  repo: string;
  visibility?: "public" | "private";
  canManageRepo?: boolean;
  repositoryId?: string;
  filePath?: string;
  refShort?: string;
  refEnc: string;
  fileName: string;
  canEditFile?: boolean;
  canMutateFile?: boolean;
  codeLang?: string | null;
  lineCount?: number;
  sizeStr?: string;
  viewRawHref: string;
  rawHref: string;
  tooLarge?: boolean;
  isImage?: boolean;
  isPdf?: boolean;
  mediaSrc?: string;
  isMarkdown?: boolean;
  markdownRaw?: string;
  mdOwner?: string;
  mdRepo?: string;
  mdRef?: string;
  mdBase?: string;
  isBinary?: boolean;
  codeText?: string;
  breadcrumbs?: BreadcrumbItem[];
  parentHref?: string | null;
};

export function BlobPage(props: BlobPageProps) {
  const {
    owner,
    repo,
    visibility,
    canManageRepo = false,
    repositoryId,
    filePath,
    refShort,
    refEnc,
    fileName,
    canEditFile = false,
    canMutateFile = canEditFile,
    codeLang,
    lineCount,
    sizeStr,
    viewRawHref,
    rawHref,
    tooLarge,
    isImage,
    isPdf,
    mediaSrc,
    isMarkdown,
    markdownRaw,
    mdOwner,
    mdRepo,
    mdRef,
    mdBase,
    isBinary,
    codeText,
    breadcrumbs,
    parentHref,
  } = props;

  const showCopy = !isMarkdown && !isImage && !isPdf && !isBinary && !tooLarge;
  const editableContent = isMarkdown ? markdownRaw : codeText;
  const showInlineEditor = Boolean(
    canEditFile && repositoryId && filePath && refShort && editableContent !== undefined
  );
  const showBlobMutator = Boolean(
    (showInlineEditor || canMutateFile) && repositoryId && filePath && refShort
  );

  return (
    <div>
      <RepoNav
        owner={owner}
        repo={repo}
        refEnc={refEnc}
        visibility={visibility}
        currentTab="browse"
        canManageRepo={canManageRepo}
      />
      <Breadcrumbs items={breadcrumbs} parentHref={parentHref} />
      <div className="blob-container mt-3 rounded-none border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
          <div className="flex items-center gap-2 text-[12px] text-fgMuted">
            <span className="font-mono font-medium text-fg">{fileName}</span>
            {codeLang ? (
              <span className="inline-flex items-center rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] text-fgMuted">
                {codeLang}
              </span>
            ) : null}
            {isMarkdown ? (
              <span className="inline-flex items-center rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] text-fgMuted">
                Markdown
              </span>
            ) : null}
            {isMarkdown || codeLang ? (
              lineCount ? (
                <span className="text-fgMuted">
                  {lineCount} line{lineCount === 1 ? "" : "s"}
                </span>
              ) : null
            ) : sizeStr ? (
              <span className="text-fgMuted">{sizeStr}</span>
            ) : null}
          </div>
          <IslandHost
            name="blob-actions"
            props={{ viewRawHref, rawHref, showCopy, isImage, isPdf }}
            className="flex items-center gap-1.5"
          >
            <BlobActionsIsland
              viewRawHref={viewRawHref}
              rawHref={rawHref}
              showCopy={showCopy}
              isImage={isImage}
              isPdf={isPdf}
            />
          </IslandHost>
        </div>
        {showBlobMutator && repositoryId && filePath && refShort ? (
          <IslandHost
            name="blob-editor"
            props={{
              owner,
              repo,
              repositoryId,
              filePath,
              refShort,
              initialContent: editableContent ?? "",
              isMarkdown: Boolean(isMarkdown),
              canEditFile: showInlineEditor,
              canMutateFile: Boolean(canMutateFile),
            }}
          >
            <BlobEditorIsland
              owner={owner}
              repo={repo}
              repositoryId={repositoryId}
              filePath={filePath}
              refShort={refShort}
              initialContent={editableContent ?? ""}
              isMarkdown={Boolean(isMarkdown)}
              canEditFile={showInlineEditor}
              canMutateFile={Boolean(canMutateFile)}
            />
          </IslandHost>
        ) : null}
        <div
          id="blob-readonly-view"
          className={`${isMarkdown ? "p-4" : isBinary || tooLarge ? "p-3" : "p-1"}`}
        >
          {tooLarge ? (
            <div className="text-[13px] text-fgMuted">File too large to preview.</div>
          ) : null}
          {!tooLarge && isImage && mediaSrc ? (
            <div className="flex items-center justify-center">
              <img
                src={mediaSrc}
                alt={fileName}
                className="max-w-full rounded-none"
                loading="lazy"
              />
            </div>
          ) : null}
          {!tooLarge && isPdf && mediaSrc ? (
            <div className="w-full" style={{ height: "75vh" }}>
              <iframe
                src={mediaSrc}
                className="h-full w-full rounded-none"
                title={fileName}
                loading="lazy"
              ></iframe>
            </div>
          ) : null}
          {!tooLarge && isMarkdown && markdownRaw && mdOwner && mdRepo && mdRef ? (
            <MarkdownContent
              markdown={markdownRaw}
              context={{ owner: mdOwner, repo: mdRepo, ref: mdRef, baseDir: mdBase || "" }}
            />
          ) : null}
          {!tooLarge && isBinary && !isImage && !isPdf ? (
            <div className="text-[13px] text-fgMuted">Binary file.</div>
          ) : null}
          {!tooLarge && !isBinary && !isMarkdown && codeText !== undefined ? (
            <CodeViewer code={codeText} language={codeLang || null} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
