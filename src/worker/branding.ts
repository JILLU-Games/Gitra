import {
  DEFAULT_SITE_BRANDING,
  mergeAndSanitizeSiteBranding,
  type SiteBrandingConfig,
} from "@/shared/branding";

export const SITE_BRANDING_KV_KEY = "site:branding:v1";

export type BrandingEnvVars = {
  SITE_NAME?: string;
  SITE_SHORT_NAME?: string;
  SITE_TAGLINE?: string;
  SITE_HERO_TITLE?: string;
  SITE_HERO_DESCRIPTION?: string;
  SITE_WORKSPACE_NAME?: string;
  SITE_WEBSITE_URL?: string;
  SITE_WEBSITE_LABEL?: string;
  SITE_DOCS_URL?: string;
  SITE_SUPPORT_EMAIL?: string;
  SITE_FOOTER_TEXT?: string;
};

export function resolveBrandingFromEnv(env: Partial<Env> & BrandingEnvVars): SiteBrandingConfig {
  return mergeAndSanitizeSiteBranding(DEFAULT_SITE_BRANDING, {
    siteName: env.SITE_NAME,
    shortName: env.SITE_SHORT_NAME,
    tagline: env.SITE_TAGLINE,
    heroTitle: env.SITE_HERO_TITLE,
    heroDescription: env.SITE_HERO_DESCRIPTION,
    workspaceName: env.SITE_WORKSPACE_NAME,
    websiteUrl: env.SITE_WEBSITE_URL,
    websiteLabel: env.SITE_WEBSITE_LABEL,
    docsUrl: env.SITE_DOCS_URL,
    supportEmail: env.SITE_SUPPORT_EMAIL,
    footerText: env.SITE_FOOTER_TEXT,
  });
}

export async function loadSiteBranding(
  env: Partial<Env> & BrandingEnvVars
): Promise<SiteBrandingConfig> {
  const envDefaults = resolveBrandingFromEnv(env);
  const kv = env.ROUTES;
  if (!kv || typeof kv.get !== "function") {
    return envDefaults;
  }
  try {
    const raw = await kv.get(SITE_BRANDING_KV_KEY);
    if (!raw) return envDefaults;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return envDefaults;
    }
    return mergeAndSanitizeSiteBranding(
      envDefaults,
      parsed as Partial<Record<keyof SiteBrandingConfig, unknown>>
    );
  } catch {
    return envDefaults;
  }
}

export async function saveSiteBranding(
  env: Partial<Env> & BrandingEnvVars,
  patch: Partial<Record<keyof SiteBrandingConfig, unknown>>
): Promise<SiteBrandingConfig> {
  const current = await loadSiteBranding(env);
  const next = mergeAndSanitizeSiteBranding(current, patch);
  const kv = env.ROUTES;
  if (kv && typeof kv.put === "function") {
    await kv.put(SITE_BRANDING_KV_KEY, JSON.stringify(next));
  }
  return next;
}
