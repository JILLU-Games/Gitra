export type SiteBrandingAssetSlot = "logo" | "favicon" | "og-image";

export type SiteBrandingAssetContentType =
  "image/png" | "image/jpeg" | "image/webp" | "image/x-icon";

export type SiteBrandingConfig = {
  siteName: string;
  shortName: string;
  siteTitle: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  allowIndexing: boolean;
  tagline: string;
  heroTitle: string;
  heroDescription: string;
  workspaceName: string;
  websiteUrl: string;
  websiteLabel: string;
  docsUrl: string;
  supportEmail: string;
  footerText: string;
};

export const DEFAULT_SITE_BRANDING: SiteBrandingConfig = {
  siteName: "gitra",
  shortName: "gitra",
  siteTitle: "gitra · Open-Source Git Forge",
  metaTitle: "gitra · Self-Hosted Git Forge",
  metaDescription: "Fast edge-native Git repositories, code browsing, and Smart HTTP v2 hosting.",
  metaKeywords: "",
  logoUrl: "",
  faviconUrl: "",
  ogImageUrl: "",
  allowIndexing: true,
  tagline: "Open-Source Git Forge",
  heroTitle: "Open-Source Repositories",
  heroDescription:
    "Browse public Git repositories, inspect commits and branches, and collaborate over Smart HTTP v2.",
  workspaceName: "Git Workspace",
  websiteUrl: "",
  websiteLabel: "",
  docsUrl: "",
  supportEmail: "",
  footerText: "© 2026 gitra",
};

const INTERNAL_SITE_ASSET_PATH_RE =
  /^\/api\/site-assets\/(logo|favicon|og-image)(?:\?v=[0-9]{1,20})?$/;

export const MAX_BRANDING_ASSET_BYTES: Record<SiteBrandingAssetSlot, number> = {
  logo: 512 * 1024,
  favicon: 512 * 1024,
  "og-image": 2 * 1024 * 1024,
};

export function isSiteBrandingAssetSlot(value: string): value is SiteBrandingAssetSlot {
  return value === "logo" || value === "favicon" || value === "og-image";
}

function cleanPlainText(raw: unknown, fallback: string, maxLength: number): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.slice(0, maxLength);
}

export function sanitizeBrandingUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.toString().replace(/\/$/, "") === parsed.origin
      ? parsed.origin
      : parsed.toString();
  } catch {
    return "";
  }
}

export function sanitizeBrandingAssetUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (INTERNAL_SITE_ASSET_PATH_RE.test(trimmed)) {
    return trimmed;
  }
  return sanitizeBrandingUrl(trimmed);
}

export function sanitizeSupportEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, 120);
  if (!trimmed) return "";
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(trimmed)) {
    return trimmed;
  }
  return "";
}

export function extractHostLabel(origin?: string, fallbackUrl?: string): string {
  for (const candidate of [origin, fallbackUrl]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.host) return parsed.host;
    } catch {
      // Ignore malformed candidate and fall through.
    }
  }
  return "git";
}

export type ValidateBrandingAssetResult =
  | { ok: true; contentType: SiteBrandingAssetContentType }
  | { ok: false; reason: "empty" | "too-large" | "unsupported-format" };

function detectImageMagicType(bytes: Uint8Array): SiteBrandingAssetContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return "image/x-icon";
  }
  return null;
}

/**
 * Validates uploaded site branding assets using actual file magic bytes and
 * slot byte caps. SVG/HTML payloads are intentionally rejected to eliminate
 * stored XSS risks on public asset routes.
 */
export function validateBrandingAssetBytes(
  slot: SiteBrandingAssetSlot,
  bytes: Uint8Array
): ValidateBrandingAssetResult {
  if (bytes.byteLength === 0) {
    return { ok: false, reason: "empty" };
  }
  if (bytes.byteLength > MAX_BRANDING_ASSET_BYTES[slot]) {
    return { ok: false, reason: "too-large" };
  }
  const detected = detectImageMagicType(bytes);
  if (!detected) {
    return { ok: false, reason: "unsupported-format" };
  }
  if (detected === "image/x-icon" && slot !== "favicon") {
    return { ok: false, reason: "unsupported-format" };
  }
  return { ok: true, contentType: detected };
}

export function resolveAbsoluteBrandingUrl(url: string, origin?: string): string {
  const safe = sanitizeBrandingAssetUrl(url);
  if (!safe) return "";
  if (safe.startsWith("/")) {
    if (!origin) return safe;
    try {
      const base = new URL(origin);
      return `${base.origin}${safe}`;
    } catch {
      return safe;
    }
  }
  return safe;
}

export type FooterAttributionSegment = {
  text: string;
  href?: string;
};

export type FooterAttributionLink = {
  label: string;
  href: string;
};

export type ParsedFooterAttribution = {
  segments: FooterAttributionSegment[];
  links: FooterAttributionLink[];
};

const CANONICAL_FOOTER_BRANDS: readonly {
  pattern: RegExp;
  label: string;
  href: string;
}[] = [
  { pattern: /\bgitra\b/gi, label: "gitra.co", href: "https://gitra.co" },
  { pattern: /\bVib Tools\b/gi, label: "vibtools.io", href: "https://vibtools.io" },
];

/**
 * Links canonical brand mentions ("gitra", "Vib Tools") inside the footer
 * copyright line to their official websites while leaving custom white-label
 * footer text untouched.
 */
export function parseFooterAttribution(footerText: string): ParsedFooterAttribution {
  if (!footerText) {
    return { segments: [], links: [] };
  }

  type BrandMatch = {
    start: number;
    end: number;
    text: string;
    label: string;
    href: string;
  };

  const matches: BrandMatch[] = [];
  for (const brand of CANONICAL_FOOTER_BRANDS) {
    brand.pattern.lastIndex = 0;
    for (const match of footerText.matchAll(brand.pattern)) {
      if (match.index === undefined) continue;
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        label: brand.label,
        href: brand.href,
      });
    }
  }

  if (matches.length === 0) {
    return { segments: [{ text: footerText }], links: [] };
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: FooterAttributionSegment[] = [];
  const links: FooterAttributionLink[] = [];
  const seenHrefs = new Set<string>();
  let cursor = 0;

  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      segments.push({ text: footerText.slice(cursor, match.start) });
    }
    segments.push({ text: match.text, href: match.href });
    if (!seenHrefs.has(match.href)) {
      seenHrefs.add(match.href);
      links.push({ label: match.label, href: match.href });
    }
    cursor = match.end;
  }

  if (cursor < footerText.length) {
    segments.push({ text: footerText.slice(cursor) });
  }

  return { segments, links };
}

export function resolveDocumentTitle(
  pageTitle: string | undefined,
  branding?: SiteBrandingConfig,
  viewName?: string
): string {
  const resolved = branding ?? DEFAULT_SITE_BRANDING;
  const suffix = resolved.siteTitle || resolved.siteName || DEFAULT_SITE_BRANDING.siteTitle;
  const homeTitle = resolved.metaTitle || suffix;

  if (
    viewName === "home" &&
    (!pageTitle ||
      pageTitle === "Repositories · gitra" ||
      pageTitle === "Repositories · git-on-cloudflare")
  ) {
    return homeTitle;
  }
  if (!pageTitle || pageTitle === "gitra" || pageTitle === "git-on-cloudflare") {
    return homeTitle;
  }
  for (const defaultSuffix of [" · gitra", " · git-on-cloudflare"]) {
    if (pageTitle.endsWith(defaultSuffix)) {
      return `${pageTitle.slice(0, -defaultSuffix.length)} · ${suffix}`;
    }
  }
  if (pageTitle.includes(suffix) || (resolved.siteName && pageTitle.includes(resolved.siteName))) {
    return pageTitle;
  }
  return `${pageTitle} · ${suffix}`;
}

export function mergeAndSanitizeSiteBranding(
  base: SiteBrandingConfig,
  patch: Partial<Record<keyof SiteBrandingConfig, unknown>>
): SiteBrandingConfig {
  const siteName =
    patch.siteName !== undefined
      ? cleanPlainText(patch.siteName, base.siteName, 80) || base.siteName
      : base.siteName;
  const shortName =
    patch.shortName !== undefined
      ? cleanPlainText(patch.shortName, base.shortName, 40) || base.shortName
      : base.shortName;
  const siteTitle =
    patch.siteTitle !== undefined
      ? cleanPlainText(patch.siteTitle, base.siteTitle, 100) || base.siteTitle
      : base.siteTitle;
  const metaTitle =
    patch.metaTitle !== undefined
      ? cleanPlainText(patch.metaTitle, base.metaTitle, 120) || base.metaTitle
      : base.metaTitle;
  const metaDescription =
    patch.metaDescription !== undefined
      ? cleanPlainText(patch.metaDescription, base.metaDescription, 320)
      : base.metaDescription;
  const metaKeywords =
    patch.metaKeywords !== undefined
      ? cleanPlainText(patch.metaKeywords, base.metaKeywords, 240)
      : base.metaKeywords;
  const logoUrl =
    patch.logoUrl !== undefined ? sanitizeBrandingAssetUrl(patch.logoUrl) : base.logoUrl;
  const faviconUrl =
    patch.faviconUrl !== undefined ? sanitizeBrandingAssetUrl(patch.faviconUrl) : base.faviconUrl;
  const ogImageUrl =
    patch.ogImageUrl !== undefined ? sanitizeBrandingAssetUrl(patch.ogImageUrl) : base.ogImageUrl;
  const allowIndexing =
    typeof patch.allowIndexing === "boolean" ? patch.allowIndexing : base.allowIndexing;
  const tagline =
    patch.tagline !== undefined ? cleanPlainText(patch.tagline, base.tagline, 100) : base.tagline;
  const heroTitle =
    patch.heroTitle !== undefined
      ? cleanPlainText(patch.heroTitle, base.heroTitle, 120) || base.heroTitle
      : base.heroTitle;
  const heroDescription =
    patch.heroDescription !== undefined
      ? cleanPlainText(patch.heroDescription, base.heroDescription, 320)
      : base.heroDescription;
  const workspaceName =
    patch.workspaceName !== undefined
      ? cleanPlainText(patch.workspaceName, base.workspaceName, 80) || base.workspaceName
      : base.workspaceName;
  const websiteUrl =
    patch.websiteUrl !== undefined ? sanitizeBrandingUrl(patch.websiteUrl) : base.websiteUrl;
  const websiteLabel =
    patch.websiteLabel !== undefined
      ? cleanPlainText(patch.websiteLabel, base.websiteLabel, 60)
      : base.websiteLabel;
  const docsUrl = patch.docsUrl !== undefined ? sanitizeBrandingUrl(patch.docsUrl) : base.docsUrl;
  const supportEmail =
    patch.supportEmail !== undefined ? sanitizeSupportEmail(patch.supportEmail) : base.supportEmail;
  const footerText =
    patch.footerText !== undefined
      ? cleanPlainText(patch.footerText, base.footerText, 120)
      : base.footerText;

  return {
    siteName,
    shortName,
    siteTitle,
    metaTitle,
    metaDescription,
    metaKeywords,
    logoUrl,
    faviconUrl,
    ogImageUrl,
    allowIndexing,
    tagline,
    heroTitle,
    heroDescription,
    workspaceName,
    websiteUrl,
    websiteLabel,
    docsUrl,
    supportEmail,
    footerText,
  };
}
