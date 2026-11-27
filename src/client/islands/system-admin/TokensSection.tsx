/// <reference lib="dom" />

import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, X } from "lucide-react";

import {
  GLOBAL_PAT_TARGET_LABEL,
  GLOBAL_PAT_TARGET_VALUE,
  mapScopeToPatLevel,
  type AdminNamespaceEntry,
  type AdminTokenEntry,
  type AdminTokenScope,
} from "@/shared/admin/panel";
import { formatRelativeTime } from "@/shared/web";
import {
  Button,
  ConfirmModal,
  ErrorBanner,
  copyToClipboard,
  inputClasses,
  selectClasses,
  showToast,
} from "@/client/components/ui";

type TokensSectionProps = {
  namespaces: AdminNamespaceEntry[];
  primaryNamespaceSlug?: string;
  tokens: AdminTokenEntry[];
  onCreated: (token: AdminTokenEntry) => void;
  onRevoked: (tokenId: string, revokedAt: number) => void;
};

type CreatePatResponse = {
  id?: string;
  plaintext?: string;
  prefix?: string;
  error?: string;
};

export function TokensSection({
  namespaces,
  primaryNamespaceSlug,
  tokens,
  onCreated,
  onRevoked,
}: TokensSectionProps) {
  const activeNamespaces = namespaces.filter((ns) => ns.status === "active");
  const defaultNs = primaryNamespaceSlug ?? activeNamespaces[0]?.slug ?? "admin";

  const [label, setLabel] = useState("");
  const [namespaceSlug, setNamespaceSlug] = useState(defaultNs);
  const [scope, setScope] = useState<AdminTokenScope>("read-write");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState<AdminTokenEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<{ label: string; plaintext: string } | null>(null);
  const [copiedReveal, setCopiedReveal] = useState(false);

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || creating) return;
    setCreating(true);
    setError(null);
    const targetNs = namespaceSlug || defaultNs;
    const isGlobal = targetNs === GLOBAL_PAT_TARGET_VALUE;
    try {
      const response = await fetch("/auth/api/tokens", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isGlobal
            ? {
                scope: "global",
                name: label.trim(),
                level: mapScopeToPatLevel(scope),
              }
            : {
                scope: "namespace",
                name: label.trim(),
                namespaceSlug: targetNs,
                level: mapScopeToPatLevel(scope),
              }
        ),
      });
      const body = (await response.json().catch(() => null)) as CreatePatResponse | null;
      if (!response.ok || !body?.id || !body.plaintext || !body.prefix) {
        const msg = body?.error ?? `Could not generate token (HTTP ${response.status}).`;
        setError(msg);
        showToast({ tone: "error", title: "Could not create token", message: msg });
        return;
      }
      const createdEntry: AdminTokenEntry = {
        id: body.id,
        name: label.trim(),
        prefix: body.prefix,
        ownerSlug: primaryNamespaceSlug,
        createdAt: Date.now(),
        scopeLabel: scope,
        targetLabel: isGlobal ? GLOBAL_PAT_TARGET_LABEL : `@${targetNs}`,
      };
      onCreated(createdEntry);
      setRevealed({ label: createdEntry.name, plaintext: body.plaintext });
      setCopiedReveal(false);
      setLabel("");
      showToast({
        tone: "success",
        title: "Personal access token created",
        message: `${createdEntry.name} (${createdEntry.targetLabel})`,
      });
    } catch (err) {
      const msg = String(err);
      setError(msg);
      showToast({ tone: "error", title: "Could not create token", message: msg });
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyToken() {
    if (!revealed) return;
    const copied = await copyToClipboard(revealed.plaintext, {
      label: "personal access token",
      successTitle: "Access token copied",
    });
    if (copied) {
      setCopiedReveal(true);
      window.setTimeout(() => setCopiedReveal(false), 2000);
    }
  }

  async function handleRevoke(token: AdminTokenEntry) {
    if (revokingId) return;
    setRevokingId(token.id);
    setError(null);
    try {
      const response = await fetch(`/admin/api/tokens/${encodeURIComponent(token.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const msg = body?.error ?? `Could not revoke token (HTTP ${response.status}).`;
        setError(msg);
        showToast({ tone: "error", title: "Could not revoke token", message: msg });
        return;
      }
      onRevoked(token.id, Date.now());
      setConfirmToken(null);
      showToast({
        tone: "success",
        title: "Access token revoked",
        message: `Revoked "${token.name}".`,
      });
    } catch (err) {
      const msg = String(err);
      setError(msg);
      showToast({ tone: "error", title: "Could not revoke token", message: msg });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section id="tokens" className="scroll-mt-16 rounded-none border border-border bg-surface">
      <div className="border-b border-border px-3.5 py-2.5">
        <h2 className="m-0 text-[13px] font-semibold text-fg">Personal Access Tokens (PAT)</h2>
        <p className="m-0 text-[12px] text-fgMuted">
          Audit all user tokens and generate scoped credentials for{" "}
          <code className="text-[11px]">git clone</code>,{" "}
          <code className="text-[11px]">git pull</code>, and{" "}
          <code className="text-[11px]">git push</code> over HTTPS Basic auth.
        </p>
      </div>

      {/* Inline compact PAT generator */}
      <form
        onSubmit={(event) => void handleGenerate(event)}
        className="border-b border-border bg-canvas px-3.5 py-3"
      >
        <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-12 md:items-end">
          <div className="sm:col-span-2 md:col-span-4">
            <label
              htmlFor="admin-pat-label"
              className="mb-1 block text-[12px] font-medium text-fgBody"
            >
              Token label
            </label>
            <input
              id="admin-pat-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="ci-deploy"
              required
              className={`${inputClasses} bg-surface px-2.5`}
            />
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="admin-pat-namespace"
              className="mb-1 block text-[12px] font-medium text-fgBody"
            >
              Target
            </label>
            <select
              id="admin-pat-namespace"
              value={namespaceSlug}
              onChange={(event) => setNamespaceSlug(event.target.value)}
              className={`${selectClasses} bg-surface px-2 font-mono`}
            >
              <option value={GLOBAL_PAT_TARGET_VALUE}>All namespaces (Global)</option>
              {activeNamespaces.length > 0 ? (
                activeNamespaces.map((ns) => (
                  <option key={ns.id} value={ns.slug}>
                    @{ns.slug}
                  </option>
                ))
              ) : (
                <option value={defaultNs}>@{defaultNs}</option>
              )}
            </select>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="admin-pat-scope"
              className="mb-1 block text-[12px] font-medium text-fgBody"
            >
              Scope
            </label>
            <select
              id="admin-pat-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value === "read" ? "read" : "read-write")}
              className={`${selectClasses} bg-surface px-2`}
            >
              <option value="read">read (pull)</option>
              <option value="read-write">read-write (push)</option>
            </select>
          </div>

          <div className="sm:col-span-2 md:col-span-2 md:text-right">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={creating || !label.trim()}
              className="w-full md:w-auto"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{creating ? "Generating…" : "Generate"}</span>
            </Button>
          </div>
        </div>
        {namespaceSlug === GLOBAL_PAT_TARGET_VALUE ? (
          <p className="m-0 mt-2 text-[11px] text-fgMuted">
            Global admin tokens authorize <code className="font-mono text-fg">git clone</code> and{" "}
            <code className="font-mono text-fg">git push</code> across every namespace using{" "}
            <code className="font-mono text-fg">{defaultNs}</code> as the HTTPS Basic username.
          </p>
        ) : null}
      </form>

      {/* One-time plaintext reveal banner */}
      {revealed ? (
        <div role="status" className="border-b border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[12px] font-semibold text-emerald-300">
                Token created: {revealed.label} — copy now (shown once)
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="block max-w-full overflow-x-auto rounded-none border border-emerald-500/30 bg-canvas px-2.5 py-1 font-mono text-[12px] text-fg">
                  {revealed.plaintext}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyToken()}
                  className="inline-flex h-7 items-center gap-1 rounded-none border border-emerald-500/40 bg-canvas px-2.5 text-[11px] font-medium text-emerald-300 hover:bg-surfaceHover"
                >
                  {copiedReveal ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copy token</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              aria-label="Dismiss token reveal"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <ErrorBanner className="rounded-none border-x-0 border-t-0 px-3.5 py-2 text-[12px]">
          {error}
        </ErrorBanner>
      ) : null}

      {tokens.length === 0 ? (
        <div className="px-3.5 py-6 text-center">
          <KeyRound className="mx-auto mb-1.5 h-4 w-4 text-fgMuted" aria-hidden="true" />
          <p className="m-0 text-[12px] text-fgMuted">
            No access tokens yet. Generate one above for Git CLI operations.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-canvas">
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Label
                </th>
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Owner
                </th>
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Prefix
                </th>
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Scope
                </th>
                <th className="hidden px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted sm:table-cell">
                  Target
                </th>
                <th className="hidden px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fgMuted md:table-cell">
                  Created
                </th>
                <th className="px-3.5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const isRevoked = Boolean(token.revokedAt);
                const isBusy = revokingId === token.id;
                return (
                  <tr
                    key={token.id}
                    className={`border-t border-borderSubtle transition-colors ${
                      isRevoked ? "opacity-60" : "hover:bg-surfaceHover"
                    }`}
                  >
                    <td className="px-3.5 py-2 text-[12px] font-medium text-fg">{token.name}</td>
                    <td className="px-3.5 py-2 font-mono text-[12px] text-fgBody">
                      {token.ownerSlug ? `@${token.ownerSlug}` : "—"}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-[12px] text-fgMuted">
                      {token.prefix}…
                    </td>
                    <td className="px-3.5 py-2">
                      <span
                        className={`inline-flex rounded-none border px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                          token.scopeLabel === "read-write"
                            ? "border-accent/30 bg-accent/10 text-accent"
                            : "border-border bg-canvas text-fgBody"
                        }`}
                      >
                        {token.scopeLabel}
                      </span>
                    </td>
                    <td className="hidden px-3.5 py-2 font-mono text-[12px] text-fgBody sm:table-cell">
                      {token.targetLabel}
                    </td>
                    <td className="hidden px-3.5 py-2 text-[12px] text-fgMuted md:table-cell">
                      {formatRelativeTime(token.createdAt)}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      {isRevoked ? (
                        <span className="inline-flex rounded-none border border-border bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fgMuted">
                          revoked
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmToken(token)}
                          className="inline-flex h-7 items-center gap-1 rounded-none border border-red-500/30 px-2 text-[11px] text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>{isBusy ? "Revoking…" : "Revoke"}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={confirmToken !== null}
        title="Revoke access token"
        description={
          confirmToken
            ? `Revoke "${confirmToken.name}" (${confirmToken.prefix}…)${confirmToken.ownerSlug ? ` owned by @${confirmToken.ownerSlug}` : ""}? Any Git client using this token will lose access immediately.`
            : ""
        }
        confirmLabel="Revoke token"
        variant="danger"
        busy={confirmToken !== null && revokingId === confirmToken.id}
        onCancel={() => {
          if (!revokingId) setConfirmToken(null);
        }}
        onConfirm={() => {
          if (confirmToken) return handleRevoke(confirmToken);
        }}
      />
    </section>
  );
}
