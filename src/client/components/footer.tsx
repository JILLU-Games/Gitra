import { DEFAULT_SITE_BRANDING, type SiteBrandingConfig } from "@/shared/branding";

type FooterProps = {
  branding?: SiteBrandingConfig;
};

export function Footer({ branding }: FooterProps) {
  const resolved = branding ?? DEFAULT_SITE_BRANDING;

  return (
    <footer className="border-t border-borderSubtle mt-8 shrink-0">
      <div className="max-w-[1160px] mx-auto px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-fgMuted">
        <span>{resolved.footerText}</span>
        <div className="flex items-center gap-5">
          {resolved.websiteUrl ? (
            <a
              href={resolved.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fgMuted hover:text-fg transition-colors no-underline"
            >
              Website
            </a>
          ) : null}
          {resolved.docsUrl ? (
            <a
              href={resolved.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fgMuted hover:text-fg transition-colors no-underline"
            >
              Documentation
            </a>
          ) : null}
          <a href="/explore" className="text-fgMuted hover:text-fg transition-colors no-underline">
            Explore
          </a>
        </div>
      </div>
    </footer>
  );
}
