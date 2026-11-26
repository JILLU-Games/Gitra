import type { Viewer } from "@/client/server/viewer";
import { buildNamespaceProfileHref } from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  parseFooterAttribution,
  type SiteBrandingConfig,
} from "@/shared/branding";

type FooterProps = {
  branding?: SiteBrandingConfig;
  viewer?: Viewer | null;
  origin?: string;
};

const LINK_CLASS =
  "inline-flex items-center text-[13px] text-fgBody hover:text-fg transition-colors no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm";

export function Footer({ branding, viewer, origin }: FooterProps) {
  const resolved = branding ?? DEFAULT_SITE_BRANDING;
  const hostLabel = extractHostLabel(origin, resolved.websiteUrl);
  const summaryText = resolved.heroDescription || resolved.tagline;
  const hasResources = Boolean(resolved.websiteUrl || resolved.docsUrl || resolved.supportEmail);
  const attribution = parseFooterAttribution(resolved.footerText);

  return (
    <footer
      aria-label="Site footer"
      className="mt-14 shrink-0 border-t border-border bg-surface/60"
    >
      <div className="mx-auto max-w-[1160px] px-5 pt-10 pb-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
          {/* Brand & description */}
          <div className="md:col-span-5">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-fg no-underline hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
            >
              {resolved.logoUrl ? (
                <img
                  src={resolved.logoUrl}
                  alt={resolved.shortName}
                  referrerPolicy="no-referrer"
                  className="h-5 w-auto max-w-[120px] shrink-0 rounded-sm object-contain"
                />
              ) : (
                <svg
                  className="h-4 w-4 shrink-0 text-fg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6.25 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM8.5 7.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm-4.25 4.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                  <path d="M4.25 4.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 1.5 0Zm7 1.75v2.75a.75.75 0 0 1-1.5 0V6.5a1 1 0 0 0-1-1H6.5a.75.75 0 0 1 0-1.5h2.25a2.5 2.5 0 0 1 2.5 2.5Z" />
                </svg>
              )}
              <span className="text-[14px] font-semibold tracking-tight">{resolved.shortName}</span>
              {hostLabel ? (
                <>
                  <span className="text-border" aria-hidden="true">
                    /
                  </span>
                  <span className="font-mono text-[12px] text-fgMuted">{hostLabel}</span>
                </>
              ) : null}
            </a>

            {summaryText ? (
              <p className="mt-3 max-w-[40ch] text-[13px] leading-[1.6] text-fgBody">
                {summaryText}
              </p>
            ) : null}
          </div>

          {/* Navigation columns */}
          <div
            className={
              hasResources
                ? "grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7"
                : "grid grid-cols-2 gap-8 md:col-span-6 md:col-start-7"
            }
          >
            <div>
              <h2 className="mb-3 text-[12px] font-semibold text-fg">Forge</h2>
              <ul className="m-0 list-none space-y-2 p-0">
                <li>
                  <a href="/explore" className={LINK_CLASS}>
                    Explore
                  </a>
                </li>
                <li>
                  <a href={viewer ? "/" : "/#repositories"} className={LINK_CLASS}>
                    Repositories
                  </a>
                </li>
                <li>
                  <a href="/namespaces" className={LINK_CLASS}>
                    Namespaces
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="mb-3 text-[12px] font-semibold text-fg">Account</h2>
              <ul className="m-0 list-none space-y-2 p-0">
                {viewer ? (
                  <>
                    {viewer.primaryNamespaceSlug ? (
                      <li>
                        <a
                          href={buildNamespaceProfileHref(viewer.primaryNamespaceSlug)}
                          className={LINK_CLASS}
                        >
                          Profile
                        </a>
                      </li>
                    ) : null}
                    <li>
                      <a href="/user/settings/tokens" className={LINK_CLASS}>
                        Access tokens
                      </a>
                    </li>
                    <li>
                      <a href="/user/settings/profile" className={LINK_CLASS}>
                        Settings
                      </a>
                    </li>
                    {viewer.role === "admin" ? (
                      <li>
                        <a href="/admin" className={LINK_CLASS}>
                          Admin console
                        </a>
                      </li>
                    ) : null}
                  </>
                ) : (
                  <>
                    <li>
                      <a href="/auth" className={LINK_CLASS}>
                        Sign in
                      </a>
                    </li>
                    <li>
                      <a href="/auth?next=%2Fuser%2Fsettings%2Ftokens" className={LINK_CLASS}>
                        Access tokens
                      </a>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {hasResources ? (
              <div className="col-span-2 sm:col-span-1">
                <h2 className="mb-3 text-[12px] font-semibold text-fg">Resources</h2>
                <ul className="m-0 list-none space-y-2 p-0">
                  {resolved.websiteUrl ? (
                    <li>
                      <a
                        href={resolved.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={LINK_CLASS}
                      >
                        <span>{resolved.websiteLabel || "Website"}</span>
                        <span className="ml-1 text-[11px] text-fgMuted" aria-hidden="true">
                          ↗
                        </span>
                      </a>
                    </li>
                  ) : null}
                  {resolved.docsUrl ? (
                    <li>
                      <a
                        href={resolved.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={LINK_CLASS}
                      >
                        <span>Documentation</span>
                        <span className="ml-1 text-[11px] text-fgMuted" aria-hidden="true">
                          ↗
                        </span>
                      </a>
                    </li>
                  ) : null}
                  {resolved.supportEmail ? (
                    <li>
                      <a href={`mailto:${resolved.supportEmail}`} className={LINK_CLASS}>
                        Support
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bottom attribution & protocol line */}
      <div className="border-t border-borderSubtle">
        <div className="mx-auto flex max-w-[1160px] flex-col items-start justify-between gap-2 px-5 py-4 text-[12px] text-fgMuted sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {attribution.segments.map((segment, index) =>
                segment.href ? (
                  <a
                    key={`${segment.href}-${index}`}
                    href={segment.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fgBody hover:text-fg underline-offset-4 hover:underline transition-colors no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
                  >
                    {segment.text}
                  </a>
                ) : (
                  <span key={`text-${index}`}>{segment.text}</span>
                )
              )}
            </span>
            {attribution.links.length > 0 ? (
              <>
                <span className="text-border" aria-hidden="true">
                  |
                </span>
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  {attribution.links.map((link, index) => (
                    <span key={link.href} className="inline-flex items-center gap-2">
                      {index > 0 ? <span aria-hidden="true">·</span> : null}
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-fgMuted hover:text-fg underline-offset-4 hover:underline transition-colors no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
                      >
                        {link.label}
                      </a>
                    </span>
                  ))}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resolved.workspaceName ? <span>{resolved.workspaceName}</span> : null}
            {resolved.workspaceName ? <span aria-hidden="true">·</span> : null}
            <span className="font-mono text-[11px]">Git Smart HTTP v2</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
