import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureD1Migrations } from "./util/d1Setup";

const ORIGIN = "https://example.com";

describe("Phase 04 SSR PWA head tags & zero-radius flat design compliance", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("renders PWA manifest/icon head tags and avoids legacy rounded/shadow utility classes on SSR pages", async () => {
    for (const route of ["/", "/explore", "/namespaces", "/auth", "/nonexistent-owner-404"]) {
      const res = await SELF.fetch(`${ORIGIN}${route}`);
      expect(res.status === 200 || res.status === 404).toBe(true);
      const html = await res.text();

      expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
      expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"');
      expect(html).toContain('<meta name="mobile-web-app-capable" content="yes"');
      expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"');
      expect(html).toContain("viewport");

      // Phase 04 F-15 flat UI: no non-zero Tailwind radius or shadow classes in SSR markup
      expect(html).not.toMatch(/\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
      expect(html).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl)\b/);
    }
  });
});
