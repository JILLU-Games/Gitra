/// <reference lib="dom" />

import { useState, type FormEvent } from "react";
import { Check, Save } from "lucide-react";

import { DEFAULT_SITE_BRANDING, type SiteBrandingConfig } from "@/shared/branding";
import { Button, Input } from "@/client/components/ui";
import { hydrateIsland } from "@/client/hydrate";

export type AdminSettingsIslandProps = {
  initialBranding: SiteBrandingConfig;
};

type SaveSettingsResponse =
  { ok: true; branding: SiteBrandingConfig } | { ok: false; error?: string; reason?: string };

export function AdminSettingsIsland({ initialBranding }: AdminSettingsIslandProps) {
  const [form, setForm] = useState<SiteBrandingConfig>(() => ({
    ...DEFAULT_SITE_BRANDING,
    ...initialBranding,
  }));
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof SiteBrandingConfig>(key: K, value: SiteBrandingConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (savedNotice) setSavedNotice(null);
    if (error) setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
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
      setSavedNotice("Branding settings saved. Reloading or navigating updates all pages.");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="m-0 text-[13px] font-semibold text-fg">Site Identity &amp; Branding</h2>
        <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
          Customize header branding, public homepage copy, workspace title, external links, and
          footer attribution stored in KV.
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 p-4">
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Site Name"
            id="branding-site-name"
            type="text"
            value={form.siteName}
            onChange={(event) => updateField("siteName", event.target.value)}
            placeholder="git-on-cloudflare"
            helperText="Full instance name for page titles and accessibility metadata."
            required
          />
          <Input
            label="Header Short Name"
            id="branding-short-name"
            type="text"
            value={form.shortName}
            onChange={(event) => updateField("shortName", event.target.value)}
            placeholder="Vib Git"
            helperText="Compact brand text displayed next to the header host label."
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
          <Input
            label="Homepage Tagline"
            id="branding-tagline"
            type="text"
            value={form.tagline}
            onChange={(event) => updateField("tagline", event.target.value)}
            placeholder="Vib Tools · Open-Source Forge"
            helperText="Leave blank to hide the tagline prefix."
          />
        </div>

        <Input
          label="Homepage Hero Title"
          id="branding-hero-title"
          type="text"
          value={form.heroTitle}
          onChange={(event) => updateField("heroTitle", event.target.value)}
          placeholder="Vib Tools Open-Source Repositories"
          required
        />

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
          placeholder="© 2026 Vib Tools · Open-Source Git Forge"
        />

        <div className="flex items-center justify-end gap-2 border-t border-borderSubtle pt-3">
          <Button type="submit" variant="primary" size="md" disabled={saving}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Saving…" : "Save Branding"}</span>
          </Button>
        </div>
      </form>
    </section>
  );
}

export function initAdminSettingsIsland() {
  hydrateIsland<AdminSettingsIslandProps>("admin-settings", AdminSettingsIsland);
}
