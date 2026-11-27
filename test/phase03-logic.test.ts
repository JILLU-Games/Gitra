import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_BRANDING } from "@/shared/branding";
import { sanitizeCommitEmail, validateCommitEmailInput } from "@/shared/admin/panel";
import {
  detectLanguageFromFilePath,
  detectLicenseFromText,
  detectPrimaryLanguageFromPaths,
  extractPackageJsonMetadata,
} from "@/shared/git/repoMetadata";
import { isRawPathRequestAllowed } from "@/shared/web/rawHotlink";
import {
  normalizeRepoFilePath,
  resolveDeleteTreeEntries,
  resolveEditableBranchRef,
  resolveUpsertTreeEntryPlan,
} from "@/worker/git/commitFile";
import type { Head, Ref } from "@/worker/do/repo/repoState";

const OID_MAIN = "1111111111111111111111111111111111111111";
const OID_TAG = "2222222222222222222222222222222222222222";
const OID_CHILD = "3333333333333333333333333333333333333333";

describe("Phase 03 pure logic unit tests", () => {
  it("derives real repository language, license, and version without guessing from slugs", () => {
    expect(detectLanguageFromFilePath("src/index.ts")).toEqual({
      language: "TypeScript",
      langColor: "#3178c6",
    });
    expect(detectLanguageFromFilePath("Dockerfile")).toEqual({
      language: "Dockerfile",
      langColor: "#384d54",
    });
    expect(detectLanguageFromFilePath("README.md")).toBeNull();
    expect(detectLanguageFromFilePath("package.json")).toBeNull();

    // Docs/empty repos produce null instead of fake TypeScript/Python labels
    expect(detectPrimaryLanguageFromPaths([])).toBeNull();
    expect(detectPrimaryLanguageFromPaths(["README.md", "LICENSE", "package.json"])).toBeNull();

    expect(
      detectPrimaryLanguageFromPaths(["README.md", "src/app.ts", "src/lib.ts", "scripts/build.py"])
    ).toEqual({
      language: "TypeScript",
      langColor: "#3178c6",
    });

    expect(
      detectLicenseFromText(
        "MIT License\n\nCopyright (c) 2026\nPermission is hereby granted, free of charge"
      )
    ).toBe("MIT");
    expect(detectLicenseFromText("Apache License\nVersion 2.0, January 2004")).toBe("Apache-2.0");
    expect(detectLicenseFromText("Custom proprietary license text")).toBeUndefined();

    expect(
      extractPackageJsonMetadata(JSON.stringify({ name: "app", version: "1.4.2", license: "ISC" }))
    ).toEqual({
      license: "ISC",
      version: "v1.4.2",
    });
    expect(extractPackageJsonMetadata("{not valid json")).toEqual({});

    expect(DEFAULT_SITE_BRANDING.heroTitle).toBe("Open-Source Repositories");
    expect(DEFAULT_SITE_BRANDING.websiteUrl).toBe("");
    expect(DEFAULT_SITE_BRANDING.supportEmail).toBe("");
    expect(DEFAULT_SITE_BRANDING.footerText).toBe("© 2026 gitra");
  });

  it("validates configurable author commit emails strictly", () => {
    expect(validateCommitEmailInput("")).toEqual({ ok: true, email: "" });
    expect(validateCommitEmailInput("  alice@example.org  ")).toEqual({
      ok: true,
      email: "alice@example.org",
    });
    expect(validateCommitEmailInput("bad\n<alice@example.org>")).toEqual({
      ok: false,
      reason: "invalid-commit-email",
    });
    expect(validateCommitEmailInput("not-an-email")).toEqual({
      ok: false,
      reason: "invalid-commit-email",
    });
    expect(sanitizeCommitEmail("dev@gitra.example")).toBe("dev@gitra.example");
    expect(sanitizeCommitEmail("invalid")).toBe("");
  });

  it("resolves editable branch refs, path normalization, upsert plans, and empty subtree pruning", () => {
    const head: Head = { target: "refs/heads/main", oid: OID_MAIN };
    const refs: Ref[] = [
      { name: "refs/heads/main", oid: OID_MAIN },
      { name: "refs/tags/v1.0.0", oid: OID_TAG },
    ];

    expect(resolveEditableBranchRef("HEAD", { head, refs })).toBe("refs/heads/main");
    expect(resolveEditableBranchRef("main", { head, refs })).toBe("refs/heads/main");
    expect(resolveEditableBranchRef("refs/heads/feature/x", { head, refs })).toBe(
      "refs/heads/feature/x"
    );
    expect(resolveEditableBranchRef("v1.0.0", { head, refs })).toBeNull();
    expect(resolveEditableBranchRef(OID_MAIN, { head, refs })).toBeNull();

    expect(normalizeRepoFilePath("/src/hello.ts")).toEqual(["src", "hello.ts"]);
    expect(normalizeRepoFilePath("../secret.txt")).toBeNull();
    expect(normalizeRepoFilePath("src/./index.ts")).toBeNull();

    const dirConflict = resolveUpsertTreeEntryPlan(
      [{ mode: "40000", name: "assets", oid: OID_CHILD }],
      "assets",
      true
    );
    expect(dirConflict).toMatchObject({ ok: false, reason: "invalid-path" });

    const preserveExec = resolveUpsertTreeEntryPlan(
      [{ mode: "100755", name: "run.sh", oid: OID_CHILD }],
      "run.sh",
      true
    );
    expect(preserveExec).toEqual({
      ok: true,
      mode: "100755",
      existingSubtreeOid: null,
    });

    const pruned = resolveDeleteTreeEntries(
      [
        { mode: "40000", name: "assets", oid: OID_CHILD },
        { mode: "100644", name: "README.md", oid: OID_MAIN },
      ],
      "assets",
      null
    );
    expect(pruned).toEqual([{ mode: "100644", name: "README.md", oid: OID_MAIN }]);

    const updatedSubtree = resolveDeleteTreeEntries(
      [{ mode: "40000", name: "assets", oid: OID_CHILD }],
      "assets",
      OID_TAG
    );
    expect(updatedSubtree).toEqual([{ mode: "40000", name: "assets", oid: OID_TAG }]);
  });

  it("enforces rawpath hotlink rules for Sec-Fetch-Site, proxies, and cross-site referers", () => {
    const url = new URL("https://internal.worker/alice/demo/rawpath?ref=main&path=img.png");

    expect(
      isRawPathRequestAllowed(new Request(url, { headers: { "Sec-Fetch-Site": "none" } }), url)
    ).toBe(true);

    expect(
      isRawPathRequestAllowed(
        new Request(url, { headers: { "Sec-Fetch-Site": "same-origin" } }),
        url
      )
    ).toBe(true);

    expect(
      isRawPathRequestAllowed(
        new Request(url, {
          headers: {
            "X-Forwarded-Host": "git.example.com",
            Referer: "https://git.example.com/alice/demo/blob?path=img.png",
          },
        }),
        url
      )
    ).toBe(true);

    expect(
      isRawPathRequestAllowed(
        new Request(url, {
          headers: {
            "Sec-Fetch-Site": "cross-site",
            Referer: "https://internal.worker/alice/demo",
          },
        }),
        url
      )
    ).toBe(false);

    expect(
      isRawPathRequestAllowed(
        new Request(url, {
          headers: {
            "Sec-Fetch-Site": "same-origin",
            Referer: "https://evil.example/embed",
          },
        }),
        url
      )
    ).toBe(false);

    expect(isRawPathRequestAllowed(new Request(url), url)).toBe(false);
  });
});
