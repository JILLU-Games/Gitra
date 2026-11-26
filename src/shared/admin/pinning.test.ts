import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countHomeFeaturedRepositories,
  evaluateRepositoryPatchPolicy,
  selectHomeFeaturedRepositories,
  type HomeFeaturedCandidate,
} from "./panel";

describe("repository pinning & public homepage featuring policy", () => {
  it("allows site admins to pin and feature any public repository across namespaces", () => {
    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "admin",
        isNamespaceMember: false,
        hasHomePinned: true,
        requestedHomePinned: true,
        currentVisibility: "public",
      }),
      { ok: true, effectiveVisibility: "public" }
    );

    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "admin",
        isNamespaceMember: false,
        hasHomePinned: false,
        currentVisibility: "private",
      }),
      { ok: true, effectiveVisibility: "private" }
    );
  });

  it("blocks private repositories from being featured on the public homepage", () => {
    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "admin",
        isNamespaceMember: true,
        hasHomePinned: true,
        requestedHomePinned: true,
        currentVisibility: "private",
      }),
      { ok: false, status: 400, reason: "private-repo-cannot-feature" }
    );

    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "admin",
        isNamespaceMember: true,
        hasHomePinned: true,
        requestedHomePinned: true,
        currentVisibility: "public",
        requestedVisibility: "private",
      }),
      { ok: false, status: 400, reason: "private-repo-cannot-feature" }
    );

    // Allowing public visibility + homePinned together in the same PATCH succeeds
    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "admin",
        isNamespaceMember: true,
        hasHomePinned: true,
        requestedHomePinned: true,
        currentVisibility: "private",
        requestedVisibility: "public",
      }),
      { ok: true, effectiveVisibility: "public" }
    );
  });

  it("blocks non-admins from homepage featuring, non-members from foreign repos, and viewers from all writes", () => {
    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "member",
        isNamespaceMember: true,
        hasHomePinned: true,
        requestedHomePinned: true,
        currentVisibility: "public",
      }),
      { ok: false, status: 403, reason: "admin-required" }
    );

    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "member",
        isNamespaceMember: false,
        hasHomePinned: false,
        currentVisibility: "public",
      }),
      { ok: false, status: 403, reason: "not-member" }
    );

    assert.deepEqual(
      evaluateRepositoryPatchPolicy({
        viewerRole: "viewer",
        isNamespaceMember: true,
        hasHomePinned: false,
        currentVisibility: "public",
      }),
      { ok: false, status: 403, reason: "viewer-read-only" }
    );
  });
});

describe("selectHomeFeaturedRepositories & countHomeFeaturedRepositories", () => {
  it("selects only public homePinned repositories ordered by recency then slug", () => {
    const candidates: Array<HomeFeaturedCandidate & { pinned?: boolean }> = [
      {
        slug: "alpha-kit",
        namespaceSlug: "alex-dev",
        visibility: "public",
        pinned: true,
        homePinned: true,
        updatedAt: 100,
      },
      {
        slug: "beta-secret",
        namespaceSlug: "admin",
        visibility: "private",
        pinned: true,
        homePinned: true,
        updatedAt: 500,
      },
      {
        slug: "profile-only",
        namespaceSlug: "alex-dev",
        visibility: "public",
        pinned: true,
        homePinned: false,
        updatedAt: 400,
      },
      {
        slug: "zeta-tool",
        namespaceSlug: "admin",
        visibility: "public",
        pinned: false,
        homePinned: true,
        updatedAt: 300,
      },
      {
        slug: "gamma-sdk",
        namespaceSlug: "core",
        visibility: "public",
        pinned: false,
        homePinned: true,
        updatedAt: 300,
      },
    ];

    const selected = selectHomeFeaturedRepositories(candidates);
    assert.deepEqual(
      selected.map((repo) => `${repo.namespaceSlug}/${repo.slug}`),
      ["admin/zeta-tool", "core/gamma-sdk", "alex-dev/alpha-kit"]
    );
    assert.equal(countHomeFeaturedRepositories(candidates), 3);
  });

  it("returns empty list when no repositories are pinned to the public homepage", () => {
    const candidates: HomeFeaturedCandidate[] = [
      {
        slug: "edge-starter",
        namespaceSlug: "admin",
        visibility: "public",
        homePinned: false,
        updatedAt: 200,
      },
    ];
    assert.deepEqual(selectHomeFeaturedRepositories(candidates), []);
    assert.equal(countHomeFeaturedRepositories(candidates), 0);
  });
});
