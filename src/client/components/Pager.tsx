import { Button } from "@/client/components/ui/button";

type PagerLink = {
  text: string;
  href: string;
};

type PagerModel = {
  perPageLinks: PagerLink[];
  newerHref?: string;
  olderHref?: string;
};

type PagerProps = {
  pager?: PagerModel | null;
};

export function Pager({ pager }: PagerProps) {
  if (!pager) {
    return null;
  }

  return (
    <div className="my-4 flex items-center justify-between rounded-md border border-border bg-surface px-3.5 py-2.5">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-fgMuted">Per page:</span>
        {pager.perPageLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded px-2 py-0.5 text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            {link.text}
          </a>
        ))}
      </div>
      <div className="flex gap-2">
        {pager.newerHref ? (
          <Button variant="secondary" size="sm" href={pager.newerHref}>
            ← Newer
          </Button>
        ) : null}
        {pager.olderHref ? (
          <Button size="sm" href={pager.olderHref}>
            Older →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
