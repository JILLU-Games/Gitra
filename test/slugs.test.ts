import { describe, expect, it } from "vitest";

import {
  isValidRepoSlug,
  isValidSlug,
  PROFILE_REPO_SLUG,
  RESERVED_SLUGS,
  validateRepoSlugForRoute,
  validateSlugForRoute,
} from "@/shared/slugs";

describe("isValidSlug", () => {
  it("accepts simple lowercase ASCII slugs", () => {
    expect(isValidSlug("rachel")).toBe(true);
    expect(isValidSlug("git-on-cloudflare")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("a1")).toBe(true);
  });

  it("rejects empty, too long, and bad-shape slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug(".vibtools")).toBe(false);
    expect(isValidSlug("Two--Caps")).toBe(false);
    expect(isValidSlug("space inside")).toBe(false);
    expect(isValidSlug("a".repeat(41))).toBe(false);
    expect(isValidSlug("émigré")).toBe(false);
  });

  it("rejects every reserved slug", () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(isValidSlug(reserved)).toBe(false);
    }
  });
});

describe("validateSlugForRoute", () => {
  it("reports length, reserved, and format reasons distinctly", () => {
    expect(validateSlugForRoute("")).toEqual({ ok: false, reason: "length" });
    expect(validateSlugForRoute("auth")).toEqual({ ok: false, reason: "reserved" });
    expect(validateSlugForRoute("BadCase")).toEqual({ ok: false, reason: "format" });
    expect(validateSlugForRoute("ok-slug")).toEqual({ ok: true, slug: "ok-slug" });
  });
});

describe("validateRepoSlugForRoute", () => {
  it("accepts .vibtools and standard or dotted repository slugs", () => {
    expect(isValidRepoSlug(PROFILE_REPO_SLUG)).toBe(true);
    expect(isValidRepoSlug(".github")).toBe(true);
    expect(isValidRepoSlug("edge-starter")).toBe(true);
    expect(isValidRepoSlug("docs.v2_site")).toBe(true);
    expect(isValidRepoSlug("a")).toBe(true);
    expect(validateRepoSlugForRoute(".vibtools")).toEqual({ ok: true, slug: ".vibtools" });
  });

  it("rejects traversal dots, trailing dots, .git suffixes, and reserved paths", () => {
    expect(validateRepoSlugForRoute("")).toEqual({ ok: false, reason: "length" });
    expect(validateRepoSlugForRoute(".")).toEqual({ ok: false, reason: "format" });
    expect(validateRepoSlugForRoute("..")).toEqual({ ok: false, reason: "format" });
    expect(validateRepoSlugForRoute("a..b")).toEqual({ ok: false, reason: "format" });
    expect(validateRepoSlugForRoute("trailing.")).toEqual({ ok: false, reason: "format" });
    expect(validateRepoSlugForRoute("repo.git")).toEqual({ ok: false, reason: "format" });
    expect(validateRepoSlugForRoute("profile")).toEqual({ ok: false, reason: "reserved" });
  });
});
