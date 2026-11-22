/// <reference lib="dom" />

import { useEffect, useMemo, useState } from "react";

import { hydrateIsland } from "@/client/hydrate";
import { Button, Card, EmptyState, ErrorBanner } from "@/client/components/ui";
import { Copy, FolderGit2, KeyRound, Trash2 } from "lucide-react";
import {
  REPOSITORIES_CHANGED_EVENT,
  type RepositoriesChangedDetail,
} from "@/client/islands/repositories";

// Mirror of `PatGrantLevel` from `@/worker/db/d1/schema/patNamespaceGrants`.
// The island purposely re-declares wire-shape types in its own file (see
// also `TokensIslandSummary`) so the SSR boundary stays one-way.
type Level = "pull" | "push";

export type TokensIslandSummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  expiresAt?: number | null;
  revokedAt?: number | null;
  lastUsedAt?: number | null;
  namespaceGrants: Array<{ namespaceSlug: string; level: Level }>;
  repoGrants: Array<{
    namespaceSlug: string;
    repoSlug: string;
    level: Level;
  }>;
};

// SSR-boundary mirror of `AccountRepository`. Re-declared here for the
// same reason as `TokensIslandSummary` above: keep the SSR boundary
// one-way so a page-side type rename doesn't ripple into the bundle.
export type IslandRepository = {
  id: string;
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  updatedAt: number;
};

export type TokensIslandProps = {
  primaryNamespaceSlug?: string;
  repositories: IslandRepository[];
  tokens: TokensIslandSummary[];
  readOnly?: boolean;
};

// Tagged-union request shape mirroring the server contract. `scope` and
// `level` are both required on the wire.
type CreatePayload =
  | {
      scope: "namespace";
      name: string;
      namespaceSlug: string;
      level: Level;
    }
  | {
      scope: "repo";
      name: string;
      namespaceSlug: string;
      repoSlug: string;
      level: Level;
    };

type Scope = CreatePayload["scope"];

function describeLevel(level: Level): string {
  return level === "push" ? "pull + push" : "pull";
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function formatGrants(token: TokensIslandSummary): string {
  if (token.namespaceGrants.length > 0) {
    return token.namespaceGrants
      .map((grant) => `@${grant.namespaceSlug} (${describeLevel(grant.level)})`)
      .join(", ");
  }
  return token.repoGrants
    .map((grant) => `${grant.namespaceSlug}/${grant.repoSlug} (${describeLevel(grant.level)})`)
    .join(", ");
}

export function TokensIsland({
  primaryNamespaceSlug,
  repositories: initialRepositories,
  tokens: initialTokens,
  readOnly = false,
}: TokensIslandProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [repositories, setRepositories] = useState(initialRepositories);
  const [scope, setScope] = useState<Scope>("namespace");
  const [name, setName] = useState("");
  const [namespaceSlug, setNamespaceSlug] = useState(primaryNamespaceSlug ?? "");
  const [repoSlug, setRepoSlug] = useState("");
  const [level, setLevel] = useState<Level>("pull");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // SSR-side `namespaceSlug` is already canonicalized lowercase; the
  // namespace input is user-typed and can carry stray case/whitespace.
  const filteredRepos = useMemo(() => {
    const target = namespaceSlug.trim().toLowerCase();
    if (target.length === 0) return [];
    return repositories.filter((repo) => repo.namespaceSlug === target);
  }, [repositories, namespaceSlug]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (name.trim().length === 0) return false;
    if (namespaceSlug.trim().length === 0) return false;
    if (scope === "repo" && !filteredRepos.some((repo) => repo.slug === repoSlug)) return false;
    return true;
  }, [submitting, name, namespaceSlug, scope, repoSlug, filteredRepos]);

  useEffect(() => {
    if (!revealedToken) return;
    setCopied(false);
    setCopyError(false);
  }, [revealedToken]);

  // Subscribe to repository creates/visibility changes from the
  // `repositories` island so the repo selector here updates without a
  // page reload. The event detail mirrors the SSR shape.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RepositoriesChangedDetail>).detail;
      if (!detail || !Array.isArray(detail.repositories)) return;
      setRepositories(detail.repositories);
    };
    window.addEventListener(REPOSITORIES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(REPOSITORIES_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    if (scope !== "repo") return;
    if (repoSlug.length === 0) return;
    if (filteredRepos.some((repo) => repo.slug === repoSlug)) return;
    setRepoSlug("");
  }, [scope, repoSlug, filteredRepos]);

  async function refresh() {
    try {
      const res = await fetch("/auth/api/tokens", { credentials: "same-origin" });
      if (res.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { tokens: TokensIslandSummary[] };
      setTokens(body.tokens);
    } catch {
      // Best-effort; the next mutation will retry.
    }
  }

  async function handleCreate(payload: CreatePayload) {
    setSubmitting(true);
    setError(null);
    setSessionExpired(false);
    try {
      const res = await fetch("/auth/api/tokens", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create token");
        return;
      }
      const body = (await res.json()) as { plaintext: string };
      setRevealedToken(body.plaintext);
      setName("");
      setRepoSlug("");
      setLevel("pull");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this token? This cannot be undone.")) return;
    setError(null);
    setSessionExpired(false);
    try {
      const res = await fetch(`/auth/api/tokens/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not revoke token");
        return;
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const exampleNamespace = primaryNamespaceSlug || "admin";
  const exampleRepo = repositories[0]
    ? `${repositories[0].namespaceSlug}/${repositories[0].slug}`
    : `${exampleNamespace}/app`;

  return (
    <div className="space-y-4">
      {error ? (
        <ErrorBanner>
          {error}
          {sessionExpired ? (
            <>
              {" "}
              <a href="/auth" className="font-medium underline">
                Sign in
              </a>
            </>
          ) : null}
        </ErrorBanner>
      ) : null}

      {revealedToken ? (
        <RevealPanel
          token={revealedToken}
          copied={copied}
          copyError={copyError}
          onCopy={() => {
            setCopyError(false);
            if (!navigator.clipboard?.writeText) {
              setCopyError(true);
              return;
            }
            navigator.clipboard.writeText(revealedToken).then(
              () => setCopied(true),
              () => {
                setCopied(false);
                setCopyError(true);
              }
            );
          }}
          onDismiss={() => setRevealedToken(null)}
        />
      ) : (
        <section className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
            Create token
          </div>
          <form
            className="space-y-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              const payload: CreatePayload =
                scope === "namespace"
                  ? {
                      scope: "namespace",
                      name: name.trim(),
                      namespaceSlug: namespaceSlug.trim(),
                      level,
                    }
                  : {
                      scope: "repo",
                      name: name.trim(),
                      namespaceSlug: namespaceSlug.trim(),
                      repoSlug: repoSlug.trim(),
                      level,
                    };
              void handleCreate(payload);
            }}
          >
            <ScopeSegmented
              scope={scope}
              exampleNamespace={exampleNamespace}
              exampleRepo={exampleRepo}
              onChange={setScope}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pat-name-input"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Token name
                </label>
                <input
                  id="pat-name-input"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="ci-deploy"
                  required
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <p className="m-0 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  A label to identify this token later.
                </p>
              </div>
              <div>
                <label
                  htmlFor="pat-namespace-input"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Namespace
                </label>
                <input
                  id="pat-namespace-input"
                  type="text"
                  value={namespaceSlug}
                  onChange={(event) => setNamespaceSlug(event.target.value)}
                  placeholder={exampleNamespace}
                  required
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <p className="m-0 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Defaults to your primary handle.
                </p>
              </div>
            </div>

            {scope === "repo" ? (
              filteredRepos.length === 0 ? (
                <EmptyState
                  icon={<FolderGit2 className="h-5 w-5 text-zinc-400" aria-hidden="true" />}
                  title={`No repositories under @${namespaceSlug.trim() || exampleNamespace}`}
                  detail="Repo-scoped tokens become available once a repository exists under this namespace."
                />
              ) : (
                <RepoTiles
                  repositories={filteredRepos}
                  selectedSlug={repoSlug}
                  onChange={setRepoSlug}
                />
              )
            ) : null}

            <PermissionLevelTiles
              level={readOnly ? "pull" : level}
              readOnly={readOnly}
              onChange={(next) => {
                if (readOnly && next === "push") return;
                setLevel(next);
              }}
            />

            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                Plaintext token is displayed once immediately after generation.
              </p>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Generate token</span>
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <h3 className="m-0 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {tokens.length === 0 ? "Your tokens" : "Issued tokens"}
          </h3>
          <span className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
            {activeTokens.length} active · {tokens.length} total
          </span>
        </div>
        {tokens.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No personal access tokens yet. Generate one above.
          </div>
        ) : (
          <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} onRevoke={handleRevoke} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type RevealPanelProps = {
  token: string;
  copied: boolean;
  copyError: boolean;
  onCopy: () => void;
  onDismiss: () => void;
};

// `-webkit-text-security: disc` masks the plaintext while keeping it
// selectable; hover/focus-within reveals it for visual verification.
function RevealPanel({ token, copied, copyError, onCopy, onDismiss }: RevealPanelProps) {
  return (
    <Card variant="accent">
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
          One time only · copy now
        </p>
        <code className="block break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-center font-mono text-sm text-zinc-900 select-all [-webkit-text-security:disc] hover:[-webkit-text-security:none] focus-within:[-webkit-text-security:none] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          {token}
        </code>
        {copyError ? (
          <p role="alert" className="m-0 text-xs text-amber-700 dark:text-amber-300">
            Clipboard unavailable — select and copy the token above manually.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="primary" size="sm" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copied ? "Copied" : "Copy token"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Done
          </Button>
        </div>
      </div>
    </Card>
  );
}

type ScopeSegmentedProps = {
  scope: Scope;
  exampleNamespace: string;
  exampleRepo: string;
  onChange: (next: Scope) => void;
};

function ScopeSegmented({ scope, exampleNamespace, exampleRepo, onChange }: ScopeSegmentedProps) {
  const baseHalf =
    "flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40";
  const activeHalf = "bg-accent-500/10 text-accent-700 dark:text-accent-300";
  const inactiveHalf =
    "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200";
  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-md border border-zinc-200 sm:flex-row dark:border-zinc-800"
      role="radiogroup"
      aria-label="Token scope"
    >
      <button
        type="button"
        className={`${baseHalf} ${scope === "namespace" ? activeHalf : inactiveHalf}`}
        onClick={() => onChange("namespace")}
        role="radio"
        aria-checked={scope === "namespace"}
      >
        <span className="font-medium">Namespace scope</span>
        <span className="font-mono text-[11px] opacity-75">@{exampleNamespace}</span>
      </button>
      <button
        type="button"
        className={`${baseHalf} border-t border-zinc-200 sm:border-t-0 sm:border-l ${scope === "repo" ? activeHalf : inactiveHalf} dark:border-zinc-800`}
        onClick={() => onChange("repo")}
        role="radio"
        aria-checked={scope === "repo"}
      >
        <span className="font-medium">Single repository</span>
        <span className="font-mono text-[11px] opacity-75">{exampleRepo}</span>
      </button>
    </div>
  );
}

type PermissionLevelTilesProps = {
  level: Level;
  readOnly?: boolean;
  onChange: (next: Level) => void;
};

// Single-select control over the grant level. Push includes pull by
// construction, so the UI cannot express an inconsistent "push without
// pull" state.
function PermissionLevelTiles({ level, readOnly = false, onChange }: PermissionLevelTilesProps) {
  const tile =
    "group relative flex cursor-pointer flex-col gap-0.5 rounded-md border border-zinc-200 px-3 py-2.5 transition-colors hover:border-zinc-300 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-500/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500/40 dark:border-zinc-800 dark:hover:border-zinc-700";
  return (
    <fieldset className="m-0 grid gap-2.5 border-0 p-0 sm:grid-cols-2">
      <legend className="sr-only">Permission level</legend>
      <label className={tile}>
        <input
          type="radio"
          name="pat-level"
          value="pull"
          className="sr-only"
          checked={level === "pull"}
          onChange={() => onChange("pull")}
        />
        <span className="text-xs font-medium text-zinc-800 group-has-[:checked]:text-accent-700 dark:text-zinc-200 dark:group-has-[:checked]:text-accent-300">
          Pull only (read)
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Clone and fetch refs over HTTPS.
        </span>
      </label>
      <label
        className={`${tile} ${readOnly ? "cursor-not-allowed opacity-50" : ""}`}
        title={readOnly ? "Viewer accounts can only create read-only (pull) tokens" : undefined}
      >
        <input
          type="radio"
          name="pat-level"
          value="push"
          className="sr-only"
          disabled={readOnly}
          checked={level === "push"}
          onChange={() => onChange("push")}
        />
        <span className="text-xs font-medium text-zinc-800 group-has-[:checked]:text-accent-700 dark:text-zinc-200 dark:group-has-[:checked]:text-accent-300">
          Pull + push (read-write)
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {readOnly ? "Unavailable for viewer role." : "Clone, fetch, and push commits."}
        </span>
      </label>
    </fieldset>
  );
}

type RepoTilesProps = {
  repositories: IslandRepository[];
  selectedSlug: string;
  onChange: (next: string) => void;
};

function RepoTiles({ repositories, selectedSlug, onChange }: RepoTilesProps) {
  const tile =
    "group relative flex cursor-pointer items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 transition-colors hover:border-zinc-300 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-500/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500/40 dark:border-zinc-800 dark:hover:border-zinc-700";
  return (
    <fieldset className="m-0 grid max-h-48 gap-1.5 overflow-y-auto border-0 p-0">
      <legend className="sr-only">Repository</legend>
      {repositories.map((repo) => (
        <label key={repo.id} className={tile}>
          <input
            type="radio"
            name="pat-repo"
            value={repo.slug}
            className="sr-only"
            checked={selectedSlug === repo.slug}
            onChange={() => onChange(repo.slug)}
          />
          <span className="min-w-0 truncate font-mono text-xs text-zinc-800 group-has-[:checked]:text-accent-700 dark:text-zinc-200 dark:group-has-[:checked]:text-accent-300">
            {repo.slug}
          </span>
          <span
            className={`shrink-0 text-[11px] font-medium capitalize ${
              repo.visibility === "private"
                ? "text-amber-700 dark:text-amber-400"
                : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {repo.visibility}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

type TokenRowProps = {
  token: TokensIslandSummary;
  onRevoke: (id: string) => void;
};

function TokenRow({ token, onRevoke }: TokenRowProps) {
  const grants = formatGrants(token);
  const revoked = Boolean(token.revokedAt);
  const metaParts = [token.prefix, `created ${formatDate(token.createdAt)}`];
  if (revoked && token.revokedAt) metaParts.push(`revoked ${formatDate(token.revokedAt)}`);
  if (grants) metaParts.push(grants);
  return (
    <li className="group flex flex-col items-start justify-between gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <span
          className={`text-xs font-medium ${
            revoked
              ? "text-zinc-500 line-through dark:text-zinc-500"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {token.name}
        </span>
        <span className="font-mono text-[11px] break-words text-zinc-500 sm:truncate dark:text-zinc-400">
          {metaParts.join(" · ")}
        </span>
      </div>
      {revoked ? (
        <span className="shrink-0 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          revoked
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void onRevoke(token.id)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-red-500/30 bg-transparent px-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          <span>Revoke</span>
        </button>
      )}
    </li>
  );
}

export function initTokensIsland() {
  hydrateIsland("tokens", TokensIsland);
}
