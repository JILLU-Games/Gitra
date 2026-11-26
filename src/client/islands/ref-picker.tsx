/// <reference lib="dom" />

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, Tag } from "lucide-react";

import { hydrateIsland } from "@/client/hydrate";
import { buttonClasses } from "@/client/components/ui/button";

type RefItem = {
  name: string;
  displayName: string;
};

type RefApiResponse = {
  branches?: RefItem[];
  tags?: RefItem[];
};

export type RefPickerProps = {
  owner: string;
  repo: string;
  currentRef: string;
};

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatRefLabel(ref: string): string {
  return /^[0-9a-f]{40}$/i.test(ref) ? `${ref.slice(0, 7)}...` : ref || "...";
}

function buildRefHref(currentUrl: string, nextRef: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("ref", nextRef);
  return url.toString();
}

function RefPickerSection({
  title,
  kind,
  currentRef,
  currentUrl,
  items,
  query,
}: {
  title: string;
  kind: "branch" | "tag";
  currentRef: string;
  currentUrl: string | null;
  items: RefItem[];
  query: string;
}) {
  const filtered = items.filter((item) => item.displayName.toLowerCase().includes(query));
  if (!filtered.length) {
    return null;
  }

  const Icon = kind === "branch" ? GitBranch : Tag;

  return (
    <>
      <div className="mt-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
        {title}
      </div>
      {filtered.map((item) => {
        const raw = decodeSafe(item.name);
        const isCurrent = raw === currentRef;
        const href = currentUrl ? buildRefHref(currentUrl, raw) : null;
        return isCurrent ? (
          <span
            key={`${title}-${item.name}`}
            className="flex items-center gap-2 rounded border border-border bg-surfaceHover px-2 py-1.5 text-[12px] text-fg"
          >
            <Check className="h-3.5 w-3.5 flex-shrink-0 text-fg" aria-hidden="true" />
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-fgMuted" aria-hidden="true" />
            <span className="font-mono font-semibold">{item.displayName}</span>
          </span>
        ) : href ? (
          <a
            key={`${title}-${item.name}`}
            href={href}
            className="flex items-center gap-2 rounded px-2 py-1.5 font-mono text-[12px] text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            <span className="h-3.5 w-3.5 flex-shrink-0"></span>
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-fgMuted" aria-hidden="true" />
            <span>{item.displayName}</span>
          </a>
        ) : (
          <span
            key={`${title}-${item.name}`}
            className="flex items-center gap-2 rounded px-2 py-1.5 font-mono text-[12px] text-fgBody"
          >
            <span className="h-3.5 w-3.5 flex-shrink-0"></span>
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-fgMuted" aria-hidden="true" />
            <span>{item.displayName}</span>
          </span>
        );
      })}
    </>
  );
}

export function RefPickerIsland({ owner, repo, currentRef }: RefPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RefApiResponse>({ branches: [], tags: [] });

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRefs() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/${owner}/${repo}/api/refs`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const nextData = (await response.json()) as RefApiResponse;
        if (!cancelled) {
          setData({
            branches: nextData.branches || [],
            tags: nextData.tags || [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load refs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRefs();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(() => {
      filterRef.current?.focus();
      filterRef.current?.select();
    }, 0);

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const branches = data.branches || [];
  const tags = data.tags || [];
  const queryLower = query.trim().toLowerCase();
  const hasCurrentRef = useMemo(
    () => [...branches, ...tags].some((item) => decodeSafe(item.name) === currentRef),
    [branches, currentRef, tags]
  );
  const showCurrentChip =
    !hasCurrentRef && currentRef && formatRefLabel(currentRef).includes(queryLower);

  return (
    <div ref={rootRef} className="relative">
      <details className="ref-menu relative" open={open}>
        <summary
          className={buttonClasses("secondary", "sm")}
          onClick={(event) => {
            event.preventDefault();
            setOpen((value) => !value);
          }}
        >
          <span className="font-mono">{formatRefLabel(currentRef)}</span>
        </summary>
        <div className="fixed inset-x-0 z-20 mx-3 mt-1.5 rounded-md border border-border bg-surface p-2 sm:absolute sm:right-0 sm:left-auto sm:mx-0 sm:w-72">
          <input
            ref={filterRef}
            type="text"
            placeholder="Filter branches/tags"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 text-[12px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
            autoComplete="off"
          />
          <div className="mt-1.5 max-h-48 overflow-y-auto text-[12px] sm:max-h-64 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {loading ? <div className="px-2 py-2 text-fgMuted">Loading...</div> : null}
            {!loading && error ? <div className="px-2 py-2 text-fgMuted">{error}</div> : null}
            {!loading && !error ? (
              <>
                {showCurrentChip ? (
                  <>
                    <div className="px-2 py-1 text-[11px] uppercase text-fgMuted">Current</div>
                    <span className="flex items-center gap-2 rounded border border-border bg-surfaceHover px-2 py-1.5 font-mono text-[12px] text-fg">
                      <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      <span className="font-semibold">
                        {/^[0-9a-f]{40}$/i.test(currentRef)
                          ? `Commit: ${formatRefLabel(currentRef)}`
                          : currentRef}
                      </span>
                    </span>
                    <div className="my-1 border-t border-borderSubtle"></div>
                  </>
                ) : null}
                <RefPickerSection
                  title="Branches"
                  kind="branch"
                  currentRef={currentRef}
                  currentUrl={currentUrl}
                  items={branches}
                  query={queryLower}
                />
                <RefPickerSection
                  title="Tags"
                  kind="tag"
                  currentRef={currentRef}
                  currentUrl={currentUrl}
                  items={tags}
                  query={queryLower}
                />
                {!showCurrentChip &&
                !branches.some((item) => item.displayName.toLowerCase().includes(queryLower)) &&
                !tags.some((item) => item.displayName.toLowerCase().includes(queryLower)) ? (
                  <div className="px-2 py-2 text-fgMuted">No refs</div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

export function initRefPicker() {
  hydrateIsland<RefPickerProps>("ref-picker", RefPickerIsland);
}
