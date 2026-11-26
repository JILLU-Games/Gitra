/// <reference lib="dom" />

import { TriangleAlert, X } from "lucide-react";
import { ConfirmModal } from "@/client/components/ui";
import { hydrateIsland } from "@/client/hydrate";
import { countRefsByKind } from "@/shared/git/ref-display";

export type { RepoAdminProps } from "./types";
import type { RepoAdminProps } from "./types";
import { useRepoAdminActions } from "./useRepoAdminActions";
import { RepoOverviewCard } from "./RepoOverviewCard";
import { CompactionCard } from "./CompactionCard";
import { PackFilesCard } from "./PackFilesCard";
import { RefsCard } from "./RefsCard";
import { DebugToolsCard } from "./DebugToolsCard";
import { DangerZoneCard } from "./DangerZoneCard";

export function RepoAdminIsland(props: RepoAdminProps) {
  const {
    owner,
    repo,
    head,
    refs,
    storageSize,
    packCount,
    packList,
    state,
    defaultBranch,
    compactionStatus,
    compactionStartedAt,
    compactionData,
    supersededPackCount,
  } = props;

  const {
    compactionResult,
    oidResult,
    oidError,
    stateDump,
    pending,
    notice,
    confirmRequest,
    confirmError,
    clearNotice,
    cancelConfirm,
    executeConfirm,
    startCompaction,
    clearCompaction,
    removePack,
    checkOid,
    dumpState,
    purgeRepo,
  } = useRepoAdminActions(owner, repo);

  const { branchCount, tagCount } = countRefsByKind(refs);
  const packStats = Array.isArray(state.packStats) ? state.packStats : [];

  const confirmBusy =
    confirmRequest?.kind === "clear-compaction"
      ? Boolean(pending["compaction-clear"])
      : confirmRequest?.kind === "remove-pack"
        ? Boolean(pending[`remove-pack:${confirmRequest.packName}`])
        : confirmRequest?.kind === "purge-repo"
          ? Boolean(pending["purge-repo"])
          : false;

  const modalTitle =
    confirmRequest?.kind === "clear-compaction"
      ? "Clear compaction request"
      : confirmRequest?.kind === "remove-pack"
        ? `Remove pack ${confirmRequest.packName}`
        : confirmRequest?.kind === "purge-repo"
          ? `Permanently delete ${owner}/${repo}`
          : "";

  const modalDescription =
    confirmRequest?.kind === "clear-compaction"
      ? "Clear the recorded compaction request for this repository?"
      : confirmRequest?.kind === "remove-pack"
        ? `Remove ${confirmRequest.packName}?\n\nThis deletes the pack file, its index, reference sidecar, and associated metadata. Only superseded packs should be removed during normal operation.`
        : confirmRequest?.kind === "purge-repo"
          ? "This action will permanently delete all objects, packs, references, and repository metadata. This cannot be undone."
          : "";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3.5 text-[13px] text-amber-300">
        <strong>
          <TriangleAlert
            className="mr-2 inline h-4 w-4 align-[-2px] text-amber-400"
            aria-hidden="true"
          />
          Admin Area
        </strong>{" "}
        - Actions here can permanently modify repository data
      </div>

      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-2 rounded-md border px-3.5 py-2.5 text-[12px] ${
            notice.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={clearNotice}
            aria-label="Dismiss notification"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-surfaceHover"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <RepoOverviewCard
        storageSize={storageSize}
        packCount={packCount}
        supersededPackCount={supersededPackCount}
        compactionStatus={compactionStatus}
        state={state}
        head={head}
        branchCount={branchCount}
        tagCount={tagCount}
      />

      <CompactionCard
        compactionData={compactionData}
        compactionStartedAt={compactionStartedAt}
        compactionStatus={compactionStatus}
        state={state}
        pending={pending}
        startCompaction={startCompaction}
        clearCompaction={clearCompaction}
        compactionResult={compactionResult}
      />

      <PackFilesCard
        packCount={packCount}
        packStats={packStats}
        pending={pending}
        removePack={removePack}
      />

      <RefsCard refs={refs} />

      <DebugToolsCard
        oidResult={oidResult}
        oidError={oidError}
        stateDump={stateDump}
        pending={pending}
        checkOid={checkOid}
        dumpState={dumpState}
      />

      <DangerZoneCard
        defaultBranch={defaultBranch}
        packList={packList}
        pending={pending}
        purgeRepo={purgeRepo}
      />

      <ConfirmModal
        open={confirmRequest !== null}
        title={modalTitle}
        description={modalDescription}
        confirmLabel={
          confirmRequest?.kind === "purge-repo"
            ? "Permanently Delete Repository"
            : confirmRequest?.kind === "remove-pack"
              ? "Remove pack"
              : "Clear request"
        }
        variant="danger"
        requireText={confirmRequest?.kind === "purge-repo" ? `purge-${owner}/${repo}` : undefined}
        busy={confirmBusy}
        error={confirmError}
        onCancel={cancelConfirm}
        onConfirm={executeConfirm}
      />
    </div>
  );
}

export function initRepoAdmin() {
  hydrateIsland<RepoAdminProps>("repo-admin", RepoAdminIsland);
}
