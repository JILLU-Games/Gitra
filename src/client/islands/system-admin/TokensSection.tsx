/// <reference lib="dom" />

import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, X } from "lucide-react";

import {
  mapScopeToPatLevel,
  type AdminNamespaceEntry,
  type AdminTokenEntry,
  type AdminTokenScope,
} from "@/shared/admin/panel";
import { formatRelativeTime } from "@/shared/web";

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
  const [error, setError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<{ label: string; plaintext: string } | null>(null);
  const [copiedReveal, setCopiedReveal] = useState(false);

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || creating) return;
    setCreating(true);
    setError(null);
    const targetNs = namespaceSlug || defaultNs;
    try {
      const response = await fetch("/auth/api/tokens", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "namespace",
          name: label.trim(),
          namespaceSlug: targetNs,
          level: mapScopeToPatLevel(scope),
        }),
      });
      const body = (await response.json().catch(() => null)) as CreatePatResponse | null;
      if (!response.ok || !body?.id || !body.plaintext || !body.prefix) {
        setError(body?.error ?? `Could not generate token (HTTP ${response.status}).`);
        return;
      }
      const createdEntry: AdminTokenEntry = {
        id: body.id,
        name: label.trim(),
        prefix: body.prefix,
        createdAt: Date.now(),
        scopeLabel: scope,
        targetLabel: `@${targetNs}`,
      };
      onCreated(createdEntry);
      setRevealed({ label: createdEntry.name, plaintext: body.plaintext });
      setCopiedReveal(false);
      setLabel("");
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyToken() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopiedReveal(true);
      window.setTimeout(() => setCopiedReveal(false), 2000);
    } catch {
      // Clipboard unavailable in restricted contexts.
    }
  }

  async function handleRevoke(tokenId: string) {
    if (revokingId) return;
    setRevokingId(tokenId);
    setError(null);
    try {
      const response = await fetch(`/auth/api/tokens/${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Could not revoke token (HTTP ${response.status}).`);
        return;
      }
      onRevoked(tokenId, Date.now());
    } catch (err) {
      setError(String(err));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section
      id="tokens"
      className="scroll-mt-16 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="border-b border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800">
        <h2 className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Personal Access Tokens (PAT)
        </h2>
        <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
          Generate scoped credentials for <code className="text-[11px]">git clone</code>,{" "}
          <code className="text-[11px]">git pull</code>, and{" "}
          <code className="text-[11px]">git push</code> over HTTPS Basic auth.
        </p>
      </div>

      {/* Inline compact PAT generator */}
      <form
        onSubmit={(event) => void handleGenerate(event)}
        className="border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
      >
        <div className="grid gap-2.5 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-4">
            <label
              htmlFor="admin-pat-label"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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
              className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="admin-pat-namespace"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Namespace
            </label>
            <select
              id="admin-pat-namespace"
              value={namespaceSlug}
              onChange={(event) => setNamespaceSlug(event.target.value)}
              className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
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

          <div className="sm:col-span-3">
            <label
              htmlFor="admin-pat-scope"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Scope
            </label>
            <select
              id="admin-pat-scope"
              value={scope}
              onChange={(event) =>
                setScope(event.target.value === "read" ? "read" : "read-write")
              }
              className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="read">read (clone / pull)</option>
              <option value="read-write">read-write (clone / pull / push)</option>
            </select>
          </div>

          <div className="sm:col-span-2 sm:text-right">
            <button
              type="submit"
              disabled={creating || !label.trim()}
              className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50 sm:w-auto"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{creating ? "Generating…" : "Generate"}</span>
            </button>
          </div>
        </div>
      </form>

      {/* One-time plaintext reveal banner */}
      {revealed ? (
        <div
          role="status"
          className="border-b border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Token created: {revealed.label} — copy now (shown once)
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="block max-w-full overflow-x-auto rounded border border-emerald-500/30 bg-white px-2.5 py-1 font-mono text-xs text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                  {revealed.plaintext}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyToken()}
                  className="inline-flex h-7 items-center gap-1 rounded border border-emerald-600/40 bg-white px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
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
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-emerald-500/30 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-b border-red-500/20 bg-red-500/10 px-3.5 py-2 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {tokens.length === 0 ? (
        <div className="px-3.5 py-6 text-center">
          <KeyRound className="mx-auto mb-1.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
          <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
            No access tokens yet. Generate one above for Git CLI operations.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40">
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Label
                </th>
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Prefix
                </th>
                <th className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Scope
                </th>
                <th className="hidden px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 sm:table-cell dark:text-zinc-400">
                  Target
                </th>
                <th className="hidden px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 md:table-cell dark:text-zinc-400">
                  Created
                </th>
                <th className="px-3.5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
                    className={`border-t border-zinc-200 transition-colors dark:border-zinc-800 ${
                      isRevoked
                        ? "opacity-60"
                        : "hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
                    }`}
                  >
                    <td className="px-3.5 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {token.name}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {token.prefix}…
                    </td>
                    <td className="px-3.5 py-2">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                          token.scopeLabel === "read-write"
                            ? "border-accent-500/30 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                            : "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {token.scopeLabel}
                      </span>
                    </td>
                    <td className="hidden px-3.5 py-2 font-mono text-xs text-zinc-600 sm:table-cell dark:text-zinc-400">
                      {token.targetLabel}
                    </td>
                    <td className="hidden px-3.5 py-2 text-xs text-zinc-500 md:table-cell dark:text-zinc-400">
                      {formatRelativeTime(token.createdAt)}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      {isRevoked ? (
                        <span className="inline-flex rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                          revoked
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRevoke(token.id)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-red-500/25 px-2 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
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
    </section>
  );
}
