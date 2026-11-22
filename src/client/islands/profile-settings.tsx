/// <reference lib="dom" />

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";

import { hydrateIsland } from "@/client/hydrate";
import { buildNamespaceProfileHref } from "@/shared/admin/panel";

export type ProfileSettingsIslandProps = {
  namespaceSlug: string;
  initialDisplayName: string;
  initialBio: string;
  initialLocation: string;
  initialWebsite: string;
};

type SaveProfileResponse =
  | {
      ok: true;
      displayName: string;
      bio: string;
      location: string;
      website: string;
    }
  | { ok: false; reason?: string };

export function ProfileSettingsIsland({
  namespaceSlug,
  initialDisplayName,
  initialBio,
  initialLocation,
  initialWebsite,
}: ProfileSettingsIslandProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [location, setLocation] = useState(initialLocation);
  const [website, setWebsite] = useState(initialWebsite);
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
        setError(`Could not save profile (${reason ?? "error"}).`);
        return;
      }
      setDisplayName(body.displayName);
      setBio(body.bio);
      setLocation(body.location);
      setWebsite(body.website);
      setSaved(true);
    } catch {
      setError("Network error while updating profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Edit public profile"
      className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
        Public Profile Details
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3.5 p-4 text-xs">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          >
            <span>{error}</span>
            {sessionExpired ? (
              <a href="/auth" className="ml-1.5 font-medium underline">
                Sign in
              </a>
            ) : null}
          </div>
        ) : null}

        {saved ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>Public profile updated.</span>
            </span>
            <a href={publicHref} className="font-medium underline">
              View public page →
            </a>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="profile-display-name"
              className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300"
            >
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
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="profile-location"
              className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300"
            >
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
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="profile-website"
            className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300"
          >
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
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div>
          <label
            htmlFor="profile-bio"
            className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300"
          >
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
            className="w-full rounded-md border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="m-0 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Displayed on your namespace header at <code className="font-mono">{publicHref}</code>.
          </p>
        </div>

        <div className="flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? "Saving…" : "Save profile"}</span>
          </button>
        </div>
      </form>
    </section>
  );
}

export function initProfileSettingsIsland() {
  hydrateIsland<ProfileSettingsIslandProps>("profile-settings", ProfileSettingsIsland);
}
