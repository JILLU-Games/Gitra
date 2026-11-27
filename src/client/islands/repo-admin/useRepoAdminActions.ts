import { useState } from "react";
import { showToast } from "@/client/components/ui";
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
  const [compactionCleared, setCompactionCleared] = useState(false);
  const [removedPacks, setRemovedPacks] = useState<string[]>([]);

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
      try {
        const response = await fetch(`/${owner}/${repo}/admin/compact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun }),
        });
        const data = await safeReadJson(response);
        setCompactionResult(data);
        if (!response.ok) {
          const message = readErrorMessage(data);
          setNotice({ tone: "error", text: message });
          showToast({
            tone: "error",
            title: dryRun ? "Compaction preview failed" : "Compaction request failed",
            message,
          });
          return;
        }
        if (dryRun) {
          showToast({
            tone: "info",
            title: "Compaction preview ready",
            message: "Review the dry-run summary in the result panel.",
          });
        } else {
          setCompactionCleared(false);
          setNotice({
            tone: "success",
            text: "Compaction job requested. Use Refresh All when ready to inspect updated pack state.",
          });
          showToast({
            tone: "success",
            title: "Compaction job requested",
            message: "Background compaction has been queued.",
            action: {
              label: "Refresh page",
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        const message = "Network error while requesting compaction.";
        setNotice({ tone: "error", text: message });
        showToast({ tone: "error", title: "Compaction request failed", message });
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
      try {
        const response = await fetch(`/${owner}/${repo}/admin/debug-oid/${trimmed}`);
        const data = await safeReadJson(response);
        setOidResult(data);
        if (!response.ok) {
          showToast({
            tone: "error",
            title: "Object lookup failed",
            message: readErrorMessage(data),
          });
        }
      } catch {
        showToast({
          tone: "error",
          title: "Object lookup failed",
          message: "Network error while inspecting OID.",
        });
      }
    });
  }

  async function dumpState() {
    await runAction("dump-state", async () => {
      try {
        const response = await fetch(`/${owner}/${repo}/admin/debug-state`);
        const data = await safeReadJson(response);
        setStateDump(data);
        if (!response.ok) {
          showToast({
            tone: "error",
            title: "State dump failed",
            message: readErrorMessage(data),
          });
        }
      } catch {
        showToast({
          tone: "error",
          title: "State dump failed",
          message: "Network error while loading Durable Object state.",
        });
      }
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
        try {
          const response = await fetch(`/${owner}/${repo}/admin/compact`, { method: "DELETE" });
          const data = await safeReadJson(response);
          if (readFlag(data, "ok")) {
            setConfirmRequest(null);
            setCompactionCleared(true);
            const message = "Compaction request cleared.";
            setNotice({ tone: "success", text: message });
            showToast({ tone: "success", title: "Compaction cleared", message });
            return;
          }
          const err = readErrorMessage(data);
          setConfirmError(err);
          showToast({ tone: "error", title: "Could not clear compaction", message: err });
        } catch {
          const err = "Network error while clearing compaction request.";
          setConfirmError(err);
          showToast({ tone: "error", title: "Could not clear compaction", message: err });
        }
      });
      return;
    }

    if (confirmRequest.kind === "remove-pack") {
      const packName = confirmRequest.packName;
      await runAction(`remove-pack:${packName}`, async () => {
        try {
          const response = await fetch(
            `/${owner}/${repo}/admin/pack/${encodeURIComponent(packName)}`,
            { method: "DELETE" }
          );
          const data = await safeReadJson(response);
          if (readFlag(data, "ok")) {
            setConfirmRequest(null);
            setRemovedPacks((prev) => (prev.includes(packName) ? prev : [...prev, packName]));
            const detail = `pack: ${readFlag(data, "deletedPack") ? "deleted" : "unchanged"}, index: ${readFlag(data, "deletedIndex") ? "deleted" : "unchanged"}, metadata: ${readFlag(data, "deletedMetadata") ? "cleaned" : "unchanged"}`;
            const message = `Pack ${packName} removed (${detail}).`;
            setNotice({ tone: "success", text: message });
            showToast({ tone: "success", title: `Removed ${packName}`, message: detail });
            return;
          }
          const err = readErrorMessage(data);
          setConfirmError(err);
          showToast({ tone: "error", title: `Failed to remove ${packName}`, message: err });
        } catch {
          const err = `Network error while removing pack ${packName}.`;
          setConfirmError(err);
          showToast({ tone: "error", title: `Failed to remove ${packName}`, message: err });
        }
      });
      return;
    }

    const expectedConfirm = `purge-${owner}/${repo}`;
    await runAction("purge-repo", async () => {
      try {
        const response = await fetch(`/${owner}/${repo}/admin/purge`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: expectedConfirm }),
        });
        const data = await safeReadJson(response);
        if (readFlag(data, "ok")) {
          setConfirmRequest(null);
          setNotice({ tone: "success", text: "Repository permanently deleted. Redirecting…" });
          showToast({ tone: "success", title: "Repository deleted" });
          window.location.href = `/${owner}`;
          return;
        }
        const err = readErrorMessage(data);
        setConfirmError(err);
        showToast({ tone: "error", title: "Repository delete failed", message: err });
      } catch {
        const err = "Network error while deleting repository.";
        setConfirmError(err);
        showToast({ tone: "error", title: "Repository delete failed", message: err });
      }
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
    compactionCleared,
    removedPacks,
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
