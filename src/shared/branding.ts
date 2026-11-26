export type SiteBrandingConfig = {
  siteName: string;
  shortName: string;
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
  siteName: "git-on-cloudflare",
  shortName: "Vib Git",
  tagline: "Vib Tools · Open-Source Forge",
  heroTitle: "Vib Tools Open-Source Repositories",
  heroDescription:
    "Practical software for real developer workflows. Browse public source code, edge-native starter kits, SDKs, and production tools maintained by Vib Tools.",
  workspaceName: "Vib Tools Workspace",
  websiteUrl: "https://vibtools.io",
  websiteLabel: "vibtools.io",
  docsUrl: "https://docs.vib.tools",
  supportEmail: "support@vibtools.io",
  footerText: "© 2026 Vib Tools · Open-Source Git Forge",
};

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
