import type { KeyboardEventHandler, MouseEventHandler } from "react";

type CommitView = {
  oid: string;
  shortOid: string;
  firstLine: string;
  authorName: string;
  when: string;
};

type CommitRowProps = {
  owner: string;
  repo: string;
  commit: CommitView;
  compact?: boolean;
  isMerge?: boolean;
  rowClass?: string;
  mergeOf?: string;
  toggleOid?: string;
  mergeExpanded?: boolean;
  onToggle?: MouseEventHandler<HTMLTableRowElement>;
};

export function CommitRow({
  owner,
  repo,
  commit,
  compact,
  isMerge,
  rowClass,
  mergeOf,
  toggleOid,
  mergeExpanded,
  onToggle,
}: CommitRowProps) {
  const classes = [
    compact
      ? "text-[12px] subrow bg-canvas/70 border-l-2 border-b border-b-borderSubtle border-l-fgMuted"
      : "",
    rowClass || "",
  ]
    .filter(Boolean)
    .join(" ");

  const onKeyDown: KeyboardEventHandler<HTMLTableRowElement> | undefined = onToggle
    ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        onToggle(event as unknown as Parameters<NonNullable<typeof onToggle>>[0]);
      }
    : undefined;

  return (
    <tr
      className={classes || undefined}
      data-merge-of={mergeOf || undefined}
      data-merge-oid={toggleOid || undefined}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-expanded={onToggle ? mergeExpanded : undefined}
    >
      <td className="font-mono text-[12px]">
        <a
          href={`/${owner}/${repo}/commit/${commit.oid}`}
          className="text-accent no-underline hover:underline"
        >
          {commit.shortOid}
        </a>
      </td>
      <td className={`${compact ? "pl-6" : ""} text-fg`}>
        {isMerge ? (
          <span
            className={`merge-badge mr-2 inline-block rounded-none px-1.5 py-0.5 text-[11px] font-medium ${
              mergeExpanded
                ? "border border-amber-500/40 bg-amber-900/40 text-amber-200"
                : "border border-sky-500/40 bg-sky-500/20 text-sky-300"
            }`}
          >
            Merge
          </span>
        ) : null}
        {commit.firstLine}
      </td>
      <td className="text-[12px] text-fgMuted">{commit.authorName}</td>
      <td className="text-[12px] text-fgMuted">{commit.when}</td>
    </tr>
  );
}
