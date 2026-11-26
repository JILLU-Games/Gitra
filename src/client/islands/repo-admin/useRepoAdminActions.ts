import { useState } from "react";
import { safeReadJson } from "@/client/json";
import { isJsonObject, type JsonValue } from "@/shared/web";

export type RepoAdminNotice = {
  tone: "success" | "error";
  text: string;
};

export type RepoAdminConfirmRequest =
  { kind: "clear-compaction" } | { kind: "remove-pack"; packName: string } | { kind: "purge-repo" };

export function useRepoAdminActions(owner: string, repo: string) {
  const [compactionResult, setCompactionResult] = useState<JsonValue | null>(null);
  const [oidResult, setOidResult] = useState<JsonValue | null>(null);
  const [oidError, setOidError] = useState<string | null>(null);
  const [stateDump, setStateDump] = useState<JsonValue | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<RepoAdminNotice | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<RepoAdminConfirmRequest | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function readFlag(value: JsonValue | null, key: string): boolean {
    return isJsonObject(value) && value[key] === true;
  }

  function readErrorMessage(value: JsonValue | null): string {
    return isJsonObject(value) && typeof value.error === "string" ? value.error : "Unknown error";
  }

  async function runAction<T>(key: string, action: () => Promise<T>) {
    setPending((current) => ({ ...current, [key]: true }));
    try {
      return await action();
    } finally {
      setPending((current) => ({ ...current, [key]: false }));
    }
  }

  function clearNotice() {
    setNotice(null);
  }

  function cancelConfirm() {
    setConfirmRequest(null);
    setConfirmError(null);
  }

  async function startCompaction(dryRun: boolean) {
    setNotice(null);
    await runAction(dryRun ? "compaction-dry-run" : "compaction-start", async () => {
      const response = await fetch(`/${owner}/${repo}/admin/compact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await safeReadJson(response);
      setCompactionResult(data);
      if (response.ok && !dryRun) {
        window.setTimeout(() => window.location.reload(), 2000);
      }
    });
  }

  async function clearCompaction() {
    setNotice(null);
    setConfirmError(null);
    setConfirmRequest({ kind: "clear-compaction" });
  }

  async function removePack(packName: string) {
    setNotice(null);
    setConfirmError(null);
    setConfirmRequest({ kind: "remove-pack", packName });
  }

  async function checkOid(debugOid: string) {
    const trimmed = debugOid.trim();
    if (!trimmed || !/^[a-f0-9]{40}$/i.test(trimmed)) {
      setOidError("Please enter a valid 40-character hexadecimal SHA-1 hash.");
      return;
    }
    setOidError(null);

    await runAction("check-oid", async () => {
      const response = await fetch(`/${owner}/${repo}/admin/debug-oid/${trimmed}`);
      setOidResult(await safeReadJson(response));
    });
  }

  async function dumpState() {
    await runAction("dump-state", async () => {
      const response = await fetch(`/${owner}/${repo}/admin/debug-state`);
      setStateDump(await safeReadJson(response));
    });
  }

  async function purgeRepo() {
    setNotice(null);
    setConfirmError(null);
    setConfirmRequest({ kind: "purge-repo" });
  }

  async function executeConfirm() {
    if (!confirmRequest) return;
    setConfirmError(null);

    if (confirmRequest.kind === "clear-compaction") {
      await runAction("compaction-clear", async () => {
        const response = await fetch(`/${owner}/${repo}/admin/compact`, { method: "DELETE" });
        const data = await safeReadJson(response);
        if (readFlag(data, "ok")) {
          setConfirmRequest(null);
          setNotice({ tone: "success", text: "Compaction request cleared. Refreshing…" });
          window.setTimeout(() => window.location.reload(), 600);
          return;
        }
        setConfirmError(readErrorMessage(data));
      });
      return;
    }

    if (confirmRequest.kind === "remove-pack") {
      const packName = confirmRequest.packName;
      await runAction(`remove-pack:${packName}`, async () => {
        const response = await fetch(
          `/${owner}/${repo}/admin/pack/${encodeURIComponent(packName)}`,
          { method: "DELETE" }
        );
        const data = await safeReadJson(response);
        if (readFlag(data, "ok")) {
          setConfirmRequest(null);
          setNotice({
            tone: "success",
            text: `Pack ${packName} removal requested (pack: ${readFlag(data, "deletedPack") ? "deleted" : "unchanged"}, index: ${readFlag(data, "deletedIndex") ? "deleted" : "unchanged"}, metadata: ${readFlag(data, "deletedMetadata") ? "cleaned" : "unchanged"}). Refreshing…`,
          });
          window.setTimeout(() => window.location.reload(), 600);
          return;
        }
        setConfirmError(readErrorMessage(data));
      });
      return;
    }

    const expectedConfirm = `purge-${owner}/${repo}`;
    await runAction("purge-repo", async () => {
      const response = await fetch(`/${owner}/${repo}/admin/purge`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: expectedConfirm }),
      });
      const data = await safeReadJson(response);
      if (readFlag(data, "ok")) {
        setConfirmRequest(null);
        setNotice({ tone: "success", text: "Repository permanently deleted. Redirecting…" });
        window.location.href = `/${owner}`;
        return;
      }
      setConfirmError(readErrorMessage(data));
    });
  }

  return {
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
  };
}
