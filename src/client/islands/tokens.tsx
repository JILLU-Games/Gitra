/// <reference lib="dom" />

import { useEffect, useMemo, useState } from "react";

import { hydrateIsland } from "@/client/hydrate";
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorBanner,
  copyToClipboard,
  inputClasses,
  showToast,
} from "@/client/components/ui";
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
  globalGrant?: { level: Level };
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
  allowGlobalScope?: boolean;
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
    }
  | {
      scope: "global";
      name: string;
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
  if (token.globalGrant) {
    return `All namespaces (${describeLevel(token.globalGrant.level)})`;
  }
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
  allowGlobalScope = false,
}: TokensIslandProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [repositories, setRepositories] = useState(initialRepositories);
  const [scope, setScope] = useState<Scope>("namespace");
  const [name, setName] = useState("");
  const [namespaceSlug, setNamespaceSlug] = useState(primaryNamespaceSlug ?? "");
  const [repoSlug, setRepoSlug] = useState("");
  const [level, setLevel] = useState<Level>("pull");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeToken, setConfirmRevokeToken] = useState<TokensIslandSummary | null>(null);
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
    if (scope === "global") return allowGlobalScope;
    if (namespaceSlug.trim().length === 0) return false;
    if (scope === "repo" && !filteredRepos.some((repo) => repo.slug === repoSlug)) return false;
    return true;
  }, [submitting, name, namespaceSlug, scope, repoSlug, filteredRepos, allowGlobalScope]);

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
        const msg = body.error ?? "Could not create token";
        setError(msg);
        showToast({ tone: "error", title: "Could not create token", message: msg });
        return;
      }
      const body = (await res.json()) as { plaintext: string };
      setRevealedToken(body.plaintext);
      setName("");
      setRepoSlug("");
      setLevel("pull");
      showToast({
        tone: "success",
        title: "Personal access token created",
        message: "Copy the revealed token now — it will not be shown again.",
      });
      await refresh();
    } catch (err) {
      const msg = String(err);
      setError(msg);
      showToast({ tone: "error", title: "Could not create token", message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  async function executeRevoke(token: TokensIslandSummary) {
    if (revokingId) return;
    setRevokingId(token.id);
    setError(null);
    setSessionExpired(false);
    try {
      const res = await fetch(`/auth/api/tokens/${encodeURIComponent(token.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        setConfirmRevokeToken(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = body.error ?? "Could not revoke token";
        setError(msg);
        showToast({ tone: "error", title: "Could not revoke token", message: msg });
        return;
      }
      setConfirmRevokeToken(null);
      showToast({
        tone: "success",
        title: "Access token revoked",
        message: `Revoked "${token.name}".`,
      });
      await refresh();
    } catch (err) {
      const msg = String(err);
      setError(msg);
      showToast({ tone: "error", title: "Could not revoke token", message: msg });
    } finally {
      setRevokingId(null);
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
            void copyToClipboard(revealedToken, {
              label: "personal access token",
              successTitle: "Access token copied",
            }).then((ok) => {
              setCopied(ok);
              setCopyError(!ok);
            });
          }}
          onDismiss={() => setRevealedToken(null)}
        />
      ) : (
        <section className="rounded-none border border-border bg-surface">
          <div className="border-b border-borderSubtle px-4 py-2.5 text-[14px] font-semibold text-fg">
            Create token
          </div>
          <form
            className="space-y-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              const payload: CreatePayload =
                scope === "global"
                  ? {
                      scope: "global",
                      name: name.trim(),
                      level,
                    }
                  : scope === "namespace"
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
              allowGlobalScope={allowGlobalScope}
              exampleNamespace={exampleNamespace}
              exampleRepo={exampleRepo}
              onChange={setScope}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pat-name-input"
                  className="mb-1 block text-[12px] font-medium text-fg"
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
                  className={inputClasses}
                />
                <p className="m-0 mt-1 text-[12px] text-fgMuted">
                  A label to identify this token later.
                </p>
              </div>
              {scope === "global" ? (
                <div>
                  <span className="mb-1 block text-[12px] font-medium text-fg">Target scope</span>
                  <div className="flex h-8 items-center rounded-none border border-border bg-canvas px-2.5 text-[12px] text-fgBody">
                    All namespaces (all users &amp; repos)
                  </div>
                  <p className="m-0 mt-1 text-[12px] text-fgMuted">
                    Use <code className="font-mono text-[11px] text-fg">{exampleNamespace}</code> as
                    HTTPS Git username.
                  </p>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="pat-namespace-input"
                    className="mb-1 block text-[12px] font-medium text-fg"
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
                    className={`${inputClasses} font-mono`}
                  />
                  <p className="m-0 mt-1 text-[12px] text-fgMuted">
                    Defaults to your primary handle.
                  </p>
                </div>
              )}
            </div>

            {scope === "repo" ? (
              filteredRepos.length === 0 ? (
                <EmptyState
                  icon={<FolderGit2 className="h-5 w-5 text-fgMuted" aria-hidden="true" />}
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

            <div className="flex items-center justify-between gap-2 border-t border-borderSubtle pt-3">
              <p className="m-0 text-[12px] text-fgMuted">
                Plaintext token is displayed once immediately after generation.
              </p>
              <Button type="submit" variant="primary" size="md" disabled={!canSubmit}>
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Generate token</span>
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-none border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-borderSubtle px-4 py-2.5">
          <h3 className="m-0 text-[14px] font-semibold text-fg">
            {tokens.length === 0 ? "Your tokens" : "Issued tokens"}
          </h3>
          <span className="text-[12px] text-fgMuted tabular-nums">
            {activeTokens.length} active · {tokens.length} total
          </span>
        </div>
        {tokens.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-fgMuted">
            No personal access tokens yet. Generate one above.
          </div>
        ) : (
          <ul className="m-0 list-none divide-y divide-borderSubtle p-0">
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onRevoke={() => setConfirmRevokeToken(token)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirmRevokeToken !== null}
        title="Revoke access token"
        description={
          confirmRevokeToken
            ? `Revoke "${confirmRevokeToken.name}" (${confirmRevokeToken.prefix}…)? This cannot be undone and any Git client using it will lose access immediately.`
            : ""
        }
        confirmLabel="Revoke token"
        variant="danger"
        busy={confirmRevokeToken !== null && revokingId === confirmRevokeToken.id}
        onCancel={() => {
          if (!revokingId) setConfirmRevokeToken(null);
        }}
        onConfirm={() => {
          if (confirmRevokeToken) return executeRevoke(confirmRevokeToken);
        }}
      />
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
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-wider text-fg">
          One time only · copy now
        </p>
        <code className="block break-all rounded-none border border-border bg-canvas px-3 py-2 text-center font-mono text-[13px] text-fg select-all [-webkit-text-security:disc] hover:[-webkit-text-security:none] focus-within:[-webkit-text-security:none]">
          {token}
        </code>
        {copyError ? (
          <p role="alert" className="m-0 text-[12px] text-amber-300">
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
  allowGlobalScope: boolean;
  exampleNamespace: string;
  exampleRepo: string;
  onChange: (next: Scope) => void;
};

function ScopeSegmented({
  scope,
  allowGlobalScope,
  exampleNamespace,
  exampleRepo,
  onChange,
}: ScopeSegmentedProps) {
  const baseHalf =
    "flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-[12px] transition-colors focus-visible:outline-none";
  const activeHalf = "bg-surfaceHover text-fg font-semibold";
  const inactiveHalf = "bg-canvas text-fgBody hover:bg-surfaceHover/60 hover:text-fg";
  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-none border border-border sm:flex-row"
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
        <span className="font-mono text-[11px] text-fgMuted">@{exampleNamespace}</span>
      </button>
      <button
        type="button"
        className={`${baseHalf} border-t border-border sm:border-t-0 sm:border-l ${scope === "repo" ? activeHalf : inactiveHalf}`}
        onClick={() => onChange("repo")}
        role="radio"
        aria-checked={scope === "repo"}
      >
        <span className="font-medium">Single repository</span>
        <span className="font-mono text-[11px] text-fgMuted">{exampleRepo}</span>
      </button>
      {allowGlobalScope ? (
        <button
          type="button"
          className={`${baseHalf} border-t border-border sm:border-t-0 sm:border-l ${scope === "global" ? activeHalf : inactiveHalf}`}
          onClick={() => onChange("global")}
          role="radio"
          aria-checked={scope === "global"}
        >
          <span className="font-medium">All namespaces</span>
          <span className="font-mono text-[11px] text-fgMuted">Admin global</span>
        </button>
      ) : null}
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
    "group relative flex cursor-pointer flex-col gap-0.5 rounded-none border border-border bg-canvas px-3 py-2.5 transition-colors hover:border-fgMuted has-[:checked]:border-fgMuted has-[:checked]:bg-surfaceHover";
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
        <span className="text-[12px] font-medium text-fgBody group-has-[:checked]:font-semibold group-has-[:checked]:text-fg">
          Pull only (read)
        </span>
        <span className="text-[12px] text-fgMuted">Clone and fetch refs over HTTPS.</span>
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
        <span className="text-[12px] font-medium text-fgBody group-has-[:checked]:font-semibold group-has-[:checked]:text-fg">
          Pull + push (read-write)
        </span>
        <span className="text-[12px] text-fgMuted">
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
    "group relative flex cursor-pointer items-center justify-between gap-3 rounded-none border border-border bg-canvas px-3 py-2 transition-colors hover:border-fgMuted has-[:checked]:border-fgMuted has-[:checked]:bg-surfaceHover";
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
          <span className="min-w-0 truncate font-mono text-[12px] text-fgBody group-has-[:checked]:font-semibold group-has-[:checked]:text-fg">
            {repo.slug}
          </span>
          <span
            className={`shrink-0 text-[11px] font-medium capitalize ${
              repo.visibility === "private" ? "text-amber-400" : "text-fgMuted"
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
          className={`text-[13px] font-medium ${revoked ? "text-fgMuted line-through" : "text-fg"}`}
        >
          {token.name}
        </span>
        <span className="font-mono text-[12px] break-words text-fgMuted sm:truncate">
          {metaParts.join(" · ")}
        </span>
      </div>
      {revoked ? (
        <span className="shrink-0 rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fgMuted">
          revoked
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void onRevoke(token.id)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-none border border-red-500/30 bg-transparent px-2 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
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
