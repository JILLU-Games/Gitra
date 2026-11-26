import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNamespaceProfileHref } from "@/shared/admin/panel";
import {
  computeNamespaceDirectoryTotals,
  filterNamespaceDirectoryItems,
  formatNamespaceWebsiteHost,
  sortNamespaceDirectoryItems,
  type PublicNamespaceDirectoryItem,
} from "@/shared/namespaces";
import { isValidSlug, RESERVED_SLUGS } from "@/shared/slugs";

describe("namespaces directory pure logic", () => {
  const sample: PublicNamespaceDirectoryItem[] = [
    {
      slug: "empty-team",
      displayName: "Empty Team",
      bio: "Internal research group",
      location: "Berlin",
      website: "",
      publicRepoCount: 0,
      projectRepoCount: 0,
    },
    {
      slug: "vibtools",
      displayName: "Vib Tools",
      bio: "Edge-native developer tools",
      location: "Remote",
      website: "https://vibtools.io/",
      publicRepoCount: 5,
      projectRepoCount: 4,
    },
    {
      slug: "alpha-org",
      displayName: "Alpha Org",
      bio: "Open-source runtime kits",
      location: "Tokyo",
      website: "http://alpha.dev",
      publicRepoCount: 4,
      projectRepoCount: 4,
    },
    {
      slug: "admin",
      displayName: "Administrator",
      bio: "",
      location: "",
      website: "",
      publicRepoCount: 1,
      projectRepoCount: 0,
    },
  ];

  it("reserves the namespaces slug so user handles cannot shadow /namespaces", () => {
    assert.equal(RESERVED_SLUGS.includes("namespaces"), true);
    assert.equal(isValidSlug("namespaces"), false);
    assert.equal(isValidSlug("vibtools"), true);
  });

  it("sorts namespaces by open-source project repos, then public repos, then slug", () => {
    const sorted = sortNamespaceDirectoryItems(sample);
    assert.deepEqual(
      sorted.map((item) => item.slug),
      ["vibtools", "alpha-org", "admin", "empty-team"]
    );
  });

  it("filters namespaces case-insensitively across slug, displayName, bio, and location", () => {
    assert.equal(filterNamespaceDirectoryItems(sample, "").length, 4);
    assert.deepEqual(
      filterNamespaceDirectoryItems(sample, "edge-native").map((item) => item.slug),
      ["vibtools"]
    );
    assert.deepEqual(
      filterNamespaceDirectoryItems(sample, "TOKYO").map((item) => item.slug),
      ["alpha-org"]
    );
    assert.deepEqual(
      filterNamespaceDirectoryItems(sample, "empty-team").map((item) => item.slug),
      ["empty-team"]
    );
    assert.equal(filterNamespaceDirectoryItems(sample, "no-such-org").length, 0);
  });

  it("computes directory totals and formats website hosts and profile hrefs cleanly", () => {
    assert.deepEqual(computeNamespaceDirectoryTotals(sample), {
      totalNamespaces: 4,
      activeOpenSourceNamespaces: 3,
      totalPublicRepos: 10,
      totalOpenSourceRepos: 8,
    });
    assert.equal(formatNamespaceWebsiteHost("https://vibtools.io/"), "vibtools.io");
    assert.equal(formatNamespaceWebsiteHost("http://alpha.dev///"), "alpha.dev");
    assert.equal(formatNamespaceWebsiteHost(""), "");

    assert.equal(buildNamespaceProfileHref("vibtools"), "/vibtools");
    assert.equal(buildNamespaceProfileHref("admin"), "/profile/admin");
  });
});
