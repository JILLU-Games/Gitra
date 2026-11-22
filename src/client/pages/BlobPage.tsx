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
      <span className="mb-1 inline-block text-xs font-semibold uppercase tracking-wider text-accent-500 dark:text-accent-400">
        File
      </span>
      <h2 className="font-display tracking-tight">Blob: {fileName}</h2>
      <Breadcrumbs items={breadcrumbs} parentHref={parentHref} />
      <div className="blob-container mt-4 rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {codeLang ? (
              <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-2 py-0.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                {codeLang}
              </span>
            ) : null}
            {isMarkdown ? (
              <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-2 py-0.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                Markdown
              </span>
            ) : null}
            {isMarkdown || codeLang ? (
              lineCount ? (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {lineCount} line{lineCount === 1 ? "" : "s"}
                </span>
              ) : null
            ) : sizeStr ? (
              <span className="text-zinc-500 dark:text-zinc-400">{sizeStr}</span>
            ) : null}
          </div>
          <IslandHost
            name="blob-actions"
            props={{ viewRawHref, rawHref, showCopy, isImage, isPdf }}
            className="flex items-center gap-2"
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
        {showInlineEditor &&
        repositoryId &&
        filePath &&
        refShort &&
        editableContent !== undefined ? (
          <IslandHost
            name="blob-editor"
            props={{
              owner,
              repo,
              repositoryId,
              filePath,
              refShort,
              initialContent: editableContent,
              isMarkdown: Boolean(isMarkdown),
            }}
          >
            <BlobEditorIsland
              owner={owner}
              repo={repo}
              repositoryId={repositoryId}
              filePath={filePath}
              refShort={refShort}
              initialContent={editableContent}
              isMarkdown={Boolean(isMarkdown)}
            />
          </IslandHost>
        ) : null}
        <div
          id="blob-readonly-view"
          className={`${isMarkdown ? "p-5" : isBinary || tooLarge ? "p-3" : "p-1"}`}
        >
          {tooLarge ? (
            <div className="text-zinc-500 dark:text-zinc-400">File too large to preview.</div>
          ) : null}
          {!tooLarge && isImage && mediaSrc ? (
            <div className="flex items-center justify-center">
              <img src={mediaSrc} alt={fileName} className="max-w-full rounded-md" loading="lazy" />
            </div>
          ) : null}
          {!tooLarge && isPdf && mediaSrc ? (
            <div className="w-full" style={{ height: "75vh" }}>
              <iframe
                src={mediaSrc}
                className="h-full w-full rounded-md"
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
            <div className="text-zinc-500 dark:text-zinc-400">Binary file.</div>
          ) : null}
          {!tooLarge && !isBinary && !isMarkdown && codeText !== undefined ? (
            <CodeViewer code={codeText} language={codeLang || null} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
