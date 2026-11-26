/// <reference lib="dom" />

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Check, Globe, Image, Save, Trash2, Upload } from "lucide-react";

import {
  DEFAULT_SITE_BRANDING,
  MAX_BRANDING_ASSET_BYTES,
  type SiteBrandingAssetSlot,
  type SiteBrandingConfig,
} from "@/shared/branding";
import { Button, Input } from "@/client/components/ui";
import { hydrateIsland } from "@/client/hydrate";

export type AdminSettingsIslandProps = {
  initialBranding: SiteBrandingConfig;
};

type SaveSettingsResponse =
  { ok: true; branding: SiteBrandingConfig } | { ok: false; error?: string; reason?: string };

type UploadAssetResponse =
  | { ok: true; slot: SiteBrandingAssetSlot; url: string; branding: SiteBrandingConfig }
  | { ok: false; error?: string; reason?: string };

type AssetSlotMeta = {
  slot: SiteBrandingAssetSlot;
  field: "logoUrl" | "faviconUrl" | "ogImageUrl";
  label: string;
  accept: string;
  hint: string;
  placeholder: string;
};

const ASSET_SLOTS: readonly AssetSlotMeta[] = [
  {
    slot: "logo",
    field: "logoUrl",
    label: "Site Logo",
    accept: "image/png,image/jpeg,image/webp",
    hint: "PNG, JPEG, or WebP (max 512 KB). Displayed in the top navigation bar.",
    placeholder: "https://example.com/logo.png or upload a file",
  },
  {
    slot: "favicon",
    field: "faviconUrl",
    label: "Favicon",
    accept: "image/x-icon,image/vnd.microsoft.icon,image/png,image/webp",
    hint: "ICO, PNG, or WebP (max 512 KB). Displayed in browser tabs and /favicon.ico.",
    placeholder: "https://example.com/favicon.ico or upload a file",
  },
  {
    slot: "og-image",
    field: "ogImageUrl",
    label: "Social Preview Image (og:image)",
    accept: "image/png,image/jpeg,image/webp",
    hint: "PNG, JPEG, or WebP (max 2 MB, recommended 1200×630) for social share cards.",
    placeholder: "https://example.com/og-card.png or upload a file",
  },
];

function formatAssetErrorReason(reason: string | undefined, slot: SiteBrandingAssetSlot): string {
  if (reason === "too-large") {
    const maxKb = Math.round(MAX_BRANDING_ASSET_BYTES[slot] / 1024);
    return `File exceeds the ${maxKb} KB size limit for ${slot}.`;
  }
  if (reason === "unsupported-format") {
    return slot === "favicon"
      ? "Unsupported file format. Upload a PNG, WebP, JPEG, or ICO image."
      : "Unsupported file format. Upload a PNG, WebP, or JPEG image.";
  }
  if (reason === "empty") {
    return "Selected file is empty.";
  }
  return reason || "Asset update failed.";
}

export function AdminSettingsIsland({ initialBranding }: AdminSettingsIslandProps) {
  const [form, setForm] = useState<SiteBrandingConfig>(() => ({
    ...DEFAULT_SITE_BRANDING,
    ...initialBranding,
  }));
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<SiteBrandingAssetSlot | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof SiteBrandingConfig>(key: K, value: SiteBrandingConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (savedNotice) setSavedNotice(null);
    if (error) setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uploadingSlot) return;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const response = await fetch("/admin/api/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => null)) as SaveSettingsResponse | null;
      if (!response.ok || !data || !data.ok) {
        const message =
          data && !data.ok
            ? (data.error ?? data.reason ?? `Save failed (HTTP ${response.status})`)
            : `Save failed (HTTP ${response.status})`;
        setError(message);
        return;
      }
      setForm(data.branding);
      setSavedNotice(
        "Site branding, SEO metadata, and assets saved. Refresh or navigate to see updates across all pages."
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAssetFileChange(
    slotMeta: AssetSlotMeta,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingSlot || saving) return;

    if (file.size === 0) {
      setError("Selected file is empty.");
      return;
    }
    if (file.size > MAX_BRANDING_ASSET_BYTES[slotMeta.slot]) {
      setError(formatAssetErrorReason("too-large", slotMeta.slot));
      return;
    }

    setUploadingSlot(slotMeta.slot);
    setError(null);
    setSavedNotice(null);
    try {
      const buffer = await file.arrayBuffer();
      const response = await fetch(`/admin/api/settings/asset/${slotMeta.slot}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: buffer,
      });
      const data = (await response.json().catch(() => null)) as UploadAssetResponse | null;
      if (!response.ok || !data || !data.ok) {
        const message =
          data && !data.ok
            ? (data.error ?? formatAssetErrorReason(data.reason, slotMeta.slot))
            : `Upload failed (HTTP ${response.status})`;
        setError(message);
        return;
      }
      setForm((prev) => ({
        ...prev,
        [slotMeta.field]: data.branding[slotMeta.field],
      }));
      setSavedNotice(`${slotMeta.label} uploaded and activated immediately.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleRemoveAsset(slotMeta: AssetSlotMeta) {
    if (uploadingSlot || saving) return;
    setUploadingSlot(slotMeta.slot);
    setError(null);
    setSavedNotice(null);
    try {
      const response = await fetch(`/admin/api/settings/asset/${slotMeta.slot}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as SaveSettingsResponse | null;
      if (!response.ok || !data || !data.ok) {
        const message =
          data && !data.ok
            ? (data.error ?? data.reason ?? `Remove failed (HTTP ${response.status})`)
            : `Remove failed (HTTP ${response.status})`;
        setError(message);
        return;
      }
      setForm((prev) => ({
        ...prev,
        [slotMeta.field]: "",
      }));
      setSavedNotice(`${slotMeta.label} removed and reset to default.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setUploadingSlot(null);
    }
  }

  const previewTitle = form.metaTitle || form.siteTitle || form.siteName;
  const previewDescription = form.metaDescription || form.heroDescription;
  const previewDomain = form.websiteLabel || form.siteName;

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="m-0 text-[13px] font-semibold text-fg">
          Site Identity, SEO Metadata &amp; Brand Assets
        </h2>
        <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
          Configure site name, browser titles, SEO meta tags, logo, favicon, and social preview
          assets persisted in KV and R2.
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 p-4">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
          >
            {error}
          </div>
        ) : null}

        {savedNotice ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300"
          >
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{savedNotice}</span>
          </div>
        ) : null}

        {/* Core Identity */}
        <div className="space-y-3">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wider text-fgMuted">
            Site Identity
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Site Name"
              id="branding-site-name"
              type="text"
              value={form.siteName}
              onChange={(event) => updateField("siteName", event.target.value)}
              placeholder="gitra"
              helperText="Full instance name for og:site_name and accessibility labels."
              required
            />
            <Input
              label="Header Short Name"
              id="branding-short-name"
              type="text"
              value={form.shortName}
              onChange={(event) => updateField("shortName", event.target.value)}
              placeholder="gitra"
              helperText="Compact brand text displayed next to the header logo."
              required
            />
            <Input
              label="Site Title (Browser Suffix)"
              id="branding-site-title"
              type="text"
              value={form.siteTitle}
              onChange={(event) => updateField("siteTitle", event.target.value)}
              placeholder="gitra · Open-Source Git Forge"
              helperText="Appended to page titles across repositories, commits, and admin views."
              required
            />
            <Input
              label="Workspace Name"
              id="branding-workspace-name"
              type="text"
              value={form.workspaceName}
              onChange={(event) => updateField("workspaceName", event.target.value)}
              placeholder="Vib Tools Workspace"
              helperText="Shown above the signed-in dashboard repository list."
              required
            />
          </div>
        </div>

        {/* SEO & Metadata */}
        <div className="space-y-3 border-t border-borderSubtle pt-4">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wider text-fgMuted">
            SEO &amp; Meta Tags
          </h3>
          <Input
            label="Meta Title (Homepage & Default og:title)"
            id="branding-meta-title"
            type="text"
            value={form.metaTitle}
            onChange={(event) => updateField("metaTitle", event.target.value)}
            placeholder="gitra · Vib Tools Open-Source Repositories"
            helperText="Recommended under 60 characters for search results."
            required
          />

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor="branding-meta-description"
                className="block text-[12px] font-medium text-fgBody"
              >
                Meta Description (HTML &amp; OpenGraph)
              </label>
              <span className="font-mono text-[11px] tabular-nums text-fgMuted">
                {form.metaDescription.length}/320
              </span>
            </div>
            <textarea
              id="branding-meta-description"
              rows={2}
              maxLength={320}
              value={form.metaDescription}
              onChange={(event) => updateField("metaDescription", event.target.value)}
              className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
              placeholder="Concise summary shown in search engine snippets and link previews."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Meta Keywords (Optional)"
              id="branding-meta-keywords"
              type="text"
              value={form.metaKeywords}
              onChange={(event) => updateField("metaKeywords", event.target.value)}
              placeholder="git, open-source, cloudflare, repositories"
              helperText="Comma-separated keywords; leave blank to omit."
            />
            <div className="flex flex-col justify-center rounded-md border border-borderSubtle bg-canvas px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-fg">
                <input
                  type="checkbox"
                  checked={form.allowIndexing}
                  onChange={(event) => updateField("allowIndexing", event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-accent"
                />
                <span>Allow search engine indexing (robots)</span>
              </label>
              <span className="mt-1 text-[11px] text-fgMuted">
                Controls <code className="font-mono">meta[name=robots]</code> and{" "}
                <code className="font-mono">/robots.txt</code>.
              </span>
            </div>
          </div>

          {/* Live Browser Tab & Search Preview */}
          <div className="rounded-md border border-borderSubtle bg-canvas p-3 space-y-2.5">
            <div className="flex items-center gap-2 border-b border-borderSubtle pb-2">
              <div className="inline-flex max-w-full items-center gap-2 rounded-t border border-border bg-surface px-2.5 py-1 text-[11px] text-fg">
                {form.faviconUrl ? (
                  <img
                    src={form.faviconUrl}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                  />
                ) : (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
                )}
                <span className="truncate font-medium">{previewTitle}</span>
              </div>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-fgMuted">
                Live Preview
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] text-fgMuted">{previewDomain}</div>
              <div className="text-[14px] font-medium text-accent">{previewTitle}</div>
              <p className="m-0 line-clamp-2 text-[12px] text-fgBody">{previewDescription}</p>
            </div>
          </div>
        </div>

        {/* Brand Assets (Logo, Favicon, OG Image) */}
        <div className="space-y-3 border-t border-borderSubtle pt-4">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wider text-fgMuted">
            Logo, Favicon &amp; Social Image
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {ASSET_SLOTS.map((slotMeta) => {
              const currentUrl = form[slotMeta.field];
              const isBusy = uploadingSlot === slotMeta.slot;
              const inputId = `branding-asset-${slotMeta.slot}`;
              const fileInputId = `branding-asset-file-${slotMeta.slot}`;
              return (
                <div
                  key={slotMeta.slot}
                  className="flex flex-col gap-3 rounded-md border border-borderSubtle bg-canvas p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface">
                    {currentUrl ? (
                      <img
                        src={currentUrl}
                        alt={slotMeta.label}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <Image className="h-4 w-4 text-fgMuted" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={inputId} className="text-[12px] font-medium text-fg">
                        {slotMeta.label}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={fileInputId}
                          className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium text-fg transition-colors hover:border-fgMuted"
                        >
                          <Upload className="h-3 w-3" aria-hidden="true" />
                          <span>{isBusy ? "Uploading…" : "Upload"}</span>
                          <input
                            id={fileInputId}
                            type="file"
                            accept={slotMeta.accept}
                            disabled={Boolean(uploadingSlot) || saving}
                            onChange={(event) => void handleAssetFileChange(slotMeta, event)}
                            className="sr-only"
                          />
                        </label>
                        {currentUrl ? (
                          <button
                            type="button"
                            disabled={Boolean(uploadingSlot) || saving}
                            onClick={() => void handleRemoveAsset(slotMeta)}
                            className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium text-fgMuted transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            <span>Remove</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      id={inputId}
                      type="text"
                      value={currentUrl}
                      onChange={(event) => updateField(slotMeta.field, event.target.value)}
                      placeholder={slotMeta.placeholder}
                      className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-fg placeholder:font-sans placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
                    />
                    <p className="m-0 text-[11px] text-fgMuted">{slotMeta.hint}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Homepage Copy & Links */}
        <div className="space-y-3 border-t border-borderSubtle pt-4">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wider text-fgMuted">
            Homepage Copy &amp; External Links
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Homepage Tagline"
              id="branding-tagline"
              type="text"
              value={form.tagline}
              onChange={(event) => updateField("tagline", event.target.value)}
              placeholder="Vib Tools · Open-Source Forge"
              helperText="Leave blank to hide the tagline prefix."
            />
            <Input
              label="Homepage Hero Title"
              id="branding-hero-title"
              type="text"
              value={form.heroTitle}
              onChange={(event) => updateField("heroTitle", event.target.value)}
              placeholder="Vib Tools Open-Source Repositories"
              required
            />
          </div>

          <div>
            <label
              htmlFor="branding-hero-description"
              className="mb-1 block text-[12px] font-medium text-fgBody"
            >
              Homepage Hero Description
            </label>
            <textarea
              id="branding-hero-description"
              rows={3}
              value={form.heroDescription}
              onChange={(event) => updateField("heroDescription", event.target.value)}
              className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
              placeholder="Describe your Git forge and public projects."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Website URL"
              id="branding-website-url"
              type="url"
              value={form.websiteUrl}
              onChange={(event) => updateField("websiteUrl", event.target.value)}
              placeholder="https://vibtools.io"
              helperText="Leave blank to omit external website buttons."
            />
            <Input
              label="Website Label"
              id="branding-website-label"
              type="text"
              value={form.websiteLabel}
              onChange={(event) => updateField("websiteLabel", event.target.value)}
              placeholder="vibtools.io"
            />
            <Input
              label="Documentation URL"
              id="branding-docs-url"
              type="url"
              value={form.docsUrl}
              onChange={(event) => updateField("docsUrl", event.target.value)}
              placeholder="https://docs.vib.tools"
              helperText="Leave blank to omit Documentation/Docs links."
            />
            <Input
              label="Support Email"
              id="branding-support-email"
              type="email"
              value={form.supportEmail}
              onChange={(event) => updateField("supportEmail", event.target.value)}
              placeholder="support@vibtools.io"
              helperText="Leave blank to omit the contact email link."
            />
          </div>

          <Input
            label="Footer Attribution Text"
            id="branding-footer-text"
            type="text"
            value={form.footerText}
            onChange={(event) => updateField("footerText", event.target.value)}
            placeholder="© 2026 gitra · Vib Tools"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-borderSubtle pt-3">
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={saving || Boolean(uploadingSlot)}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Saving…" : "Save Settings"}</span>
          </Button>
        </div>
      </form>
    </section>
  );
}

export function initAdminSettingsIsland() {
  hydrateIsland<AdminSettingsIslandProps>("admin-settings", AdminSettingsIsland);
}
