type BreadcrumbItem = {
  name: string;
  href?: string | null;
};

type BreadcrumbsProps = {
  items?: BreadcrumbItem[];
  parentHref?: string | null;
};

export function Breadcrumbs({ items, parentHref }: BreadcrumbsProps) {
  if (!items?.length) {
    return null;
  }

  return (
    <nav
      className="mb-3 flex flex-wrap items-center gap-1.5 rounded-none border border-border bg-surface px-3.5 py-2 font-mono text-[12px]"
      aria-label="Breadcrumbs"
    >
      {parentHref ? (
        <>
          <a href={parentHref} className="text-fgMuted no-underline hover:text-fg hover:underline">
            ..
          </a>
          <span className="text-fgMuted">/</span>
        </>
      ) : null}
      {items.map((item, index) => (
        <span key={`${item.name}-${index}`}>
          {item.href ? (
            <a href={item.href} className="text-accent no-underline hover:underline">
              {item.name}
            </a>
          ) : (
            <strong className="font-semibold text-fg">{item.name}</strong>
          )}
          {index < items.length - 1 ? <span className="text-fgMuted"> / </span> : null}
        </span>
      ))}
    </nav>
  );
}
