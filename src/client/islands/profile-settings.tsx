/// <reference lib="dom" />

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";

import { hydrateIsland } from "@/client/hydrate";
import { buildNamespaceProfileHref } from "@/shared/admin/panel";
import {
  Button,
  ErrorBanner,
  inputClasses,
  showToast,
  textareaClasses,
} from "@/client/components/ui";

export type ProfileSettingsIslandProps = {
  namespaceSlug: string;
  initialDisplayName: string;
  initialBio: string;
  initialLocation: string;
  initialWebsite: string;
  initialCommitEmail?: string;
};

type SaveProfileResponse =
  | {
      ok: true;
      displayName: string;
      bio: string;
      location: string;
      website: string;
      commitEmail?: string;
    }
  | { ok: false; reason?: string };

export function ProfileSettingsIsland({
  namespaceSlug,
  initialDisplayName,
  initialBio,
  initialLocation,
  initialWebsite,
  initialCommitEmail = "",
}: ProfileSettingsIslandProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [location, setLocation] = useState(initialLocation);
  const [website, setWebsite] = useState(initialWebsite);
  const [commitEmail, setCommitEmail] = useState(initialCommitEmail);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const publicHref = buildNamespaceProfileHref(namespaceSlug);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    setSessionExpired(false);
    try {
      const response = await fetch("/auth/api/profile", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          bio,
          location,
          website,
          commitEmail,
        }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as SaveProfileResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        const msg =
          reason === "invalid-commit-email"
            ? "Please enter a valid commit email address (or leave blank)."
            : `Could not save profile (${reason ?? "error"}).`;
        setError(msg);
        showToast({ tone: "error", title: "Profile update failed", message: msg });
        return;
      }
      setDisplayName(body.displayName);
      setBio(body.bio);
      setLocation(body.location);
      setWebsite(body.website);
      setCommitEmail(body.commitEmail ?? "");
      setSaved(true);
      showToast({ tone: "success", title: "Public profile updated" });
    } catch {
      const msg = "Network error while updating profile.";
      setError(msg);
      showToast({ tone: "error", title: "Profile update failed", message: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Edit public profile"
      className="rounded-none border border-border bg-surface"
    >
      <div className="border-b border-borderSubtle px-4 py-2.5 text-[14px] font-semibold text-fg">
        Public Profile Details
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3.5 p-4 text-[12px]">
        {error ? (
          <ErrorBanner className="px-3 py-2 text-[12px]">
            <span>{error}</span>
            {sessionExpired ? (
              <a href="/auth" className="ml-1.5 font-medium underline">
                Sign in
              </a>
            ) : null}
          </ErrorBanner>
        ) : null}

        {saved ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Public profile updated.</span>
            </span>
            <a href={publicHref} className="font-medium underline">
              View public page →
            </a>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-display-name" className="mb-1 block font-medium text-fg">
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              disabled={saving}
              placeholder="Your name or organization"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="profile-location" className="mb-1 block font-medium text-fg">
              Location
            </label>
            <input
              id="profile-location"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={60}
              disabled={saving}
              placeholder="e.g. Dhaka, Bangladesh"
              className={inputClasses}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-website" className="mb-1 block font-medium text-fg">
              Website URL
            </label>
            <input
              id="profile-website"
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              maxLength={160}
              disabled={saving}
              placeholder="https://example.com"
              className={`${inputClasses} font-mono`}
            />
          </div>

          <div>
            <label htmlFor="profile-commit-email" className="mb-1 block font-medium text-fg">
              Git Commit Email
            </label>
            <input
              id="profile-commit-email"
              type="email"
              value={commitEmail}
              onChange={(event) => setCommitEmail(event.target.value)}
              maxLength={120}
              disabled={saving}
              placeholder={`${namespaceSlug}@users.noreply.example.com`}
              className={`${inputClasses} font-mono`}
            />
            <p className="m-0 mt-1 text-[11px] text-fgMuted">
              Used as author/committer email for web edits. Leave blank for noreply fallback.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="profile-bio" className="mb-1 block font-medium text-fg">
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={200}
            rows={2}
            disabled={saving}
            placeholder="Tell visitors what you build and maintain..."
            className={textareaClasses}
          />
          <p className="m-0 mt-1 text-[12px] text-fgMuted">
            Displayed on your namespace header at{" "}
            <code className="font-mono text-fgBody">{publicHref}</code>.
          </p>
        </div>

        <div className="flex justify-end border-t border-borderSubtle pt-3">
          <Button type="submit" variant="primary" size="md" disabled={saving}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Saving…" : "Save profile"}</span>
          </Button>
        </div>
      </form>
    </section>
  );
}

export function initProfileSettingsIsland() {
  hydrateIsland<ProfileSettingsIslandProps>("profile-settings", ProfileSettingsIsland);
}
