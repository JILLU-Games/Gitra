import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/client/components/ui/button";

export type DangerZoneCardProps = {
  defaultBranch: string;
  packList: string[];
  pending: Record<string, boolean>;
  purgeRepo: () => Promise<void>;
};

export function DangerZoneCard({
  defaultBranch,
  packList,
  pending,
  purgeRepo,
}: DangerZoneCardProps) {
  return (
    <details className="rounded-md border border-red-500/35 bg-surface p-4">
      <summary className="cursor-pointer text-[14px] font-semibold text-red-400">
        <TriangleAlert className="mr-2 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
        Danger Zone - Irreversible Actions
      </summary>
      <div className="mt-4 space-y-3.5">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3.5 text-[12px] text-red-400">
          <strong>Warning:</strong> These actions cannot be undone. All repository data will be
          permanently deleted.
        </div>
        <p className="text-[13px] text-fgBody">
          This will delete all objects, packs, references, and metadata associated with this
          repository. The repository will be removed from the owner registry.
        </p>
        <Button
          variant="danger"
          type="button"
          onClick={() => void purgeRepo()}
          disabled={pending["purge-repo"]}
        >
          <Trash2 className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
          <span className="label">
            {pending["purge-repo"] ? "Deleting..." : "Permanently Delete Repository"}
          </span>
        </Button>
        <p className="text-[12px] text-fgMuted">
          Default branch: <code>{defaultBranch}</code>
        </p>
        {packList.length ? (
          <p className="text-[12px] text-fgMuted">Visible pack keys: {packList.length}</p>
        ) : null}
      </div>
    </details>
  );
}
