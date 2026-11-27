import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import vm from "node:vm";

import {
  isStaticCacheableAsset,
  PWA_CACHE_NAME,
  PWA_PRECACHE_URLS,
  shouldBypassServiceWorker,
  validateManifestIcons,
  type PwaIconSpec,
} from "@/shared/pwa";
import {
  createToastItem,
  DEFAULT_TOAST_DURATION_MS,
  dismissToastItem,
  enqueueToastItem,
  formatClipboardFailureMessage,
  MAX_VISIBLE_TOASTS,
  resolveDefaultToastDuration,
} from "@/shared/toast";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

function readPngDimensions(filePath: string): { width: number; height: number } {
  const bytes = fs.readFileSync(filePath);
  const signature = bytes.subarray(0, 8);
  const expectedSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(
    Buffer.compare(signature, expectedSignature),
    0,
    `${path.basename(filePath)} must start with valid PNG magic signature`
  );
  const ihdrType = bytes.subarray(12, 16).toString("ascii");
  assert.equal(ihdrType, "IHDR", `${path.basename(filePath)} must contain an IHDR chunk`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

describe("Phase 04 toast queue, PWA helpers, manifest, service worker & icons", () => {
  it("normalizes toast items, enforces MAX_VISIBLE_TOASTS, deduplicates IDs, and dismisses cleanly", () => {
    assert.equal(resolveDefaultToastDuration("info"), DEFAULT_TOAST_DURATION_MS);
    assert.equal(resolveDefaultToastDuration("success"), DEFAULT_TOAST_DURATION_MS);
    assert.equal(resolveDefaultToastDuration("warning"), 5500);
    assert.equal(resolveDefaultToastDuration("error"), 6500);

    const clamped = createToastItem(
      { id: "  custom-1 ", tone: "error", title: "Failed", message: "  ", durationMs: -50 },
      1_700_000_000_000,
      1
    );
    assert.equal(clamped.id, "custom-1");
    assert.equal(clamped.durationMs, 0);
    assert.equal(clamped.message, undefined);

    let queue = [clamped];
    for (let i = 2; i <= MAX_VISIBLE_TOASTS + 2; i += 1) {
      queue = enqueueToastItem(
        queue,
        createToastItem({ id: `t-${i}`, tone: "info", title: `Toast ${i}` }, 1_700_000_000_000, i)
      );
    }
    assert.equal(queue.length, MAX_VISIBLE_TOASTS);
    assert.equal(queue[0]?.id, "t-3");
    assert.equal(queue[queue.length - 1]?.id, `t-${MAX_VISIBLE_TOASTS + 2}`);

    // Re-enqueuing an existing ID moves its updated entry to the end without duplicating
    queue = enqueueToastItem(
      queue,
      createToastItem({ id: "t-4", tone: "success", title: "Updated 4" }, 1_700_000_000_500, 9)
    );
    assert.equal(queue.length, MAX_VISIBLE_TOASTS);
    assert.equal(queue[queue.length - 1]?.title, "Updated 4");

    const afterDismiss = dismissToastItem(queue, "t-4");
    assert.equal(afterDismiss.length, MAX_VISIBLE_TOASTS - 1);
    assert.equal(
      afterDismiss.some((item) => item.id === "t-4"),
      false
    );

    assert.match(formatClipboardFailureMessage("SSH URL"), /SSH URL/);
    assert.match(formatClipboardFailureMessage(), /copy the text manually/);
  });

  it("bypasses auth/admin/api/Git Smart HTTP/HMR/mutations in PWA service worker logic", () => {
    assert.equal(PWA_CACHE_NAME, "gitra-shell-v1");
    assert.ok(PWA_PRECACHE_URLS.includes("/"));
    assert.ok(PWA_PRECACHE_URLS.includes("/manifest.webmanifest"));
    assert.ok(PWA_PRECACHE_URLS.includes("/icons/icon-192.png"));
    assert.ok(PWA_PRECACHE_URLS.includes("/icons/icon-512.png"));

    // Cross-origin & non-GET must always bypass
    assert.equal(shouldBypassServiceWorker("/", "GET", false), true);
    assert.equal(shouldBypassServiceWorker("/", "POST", true), true);
    assert.equal(shouldBypassServiceWorker("/explore", "DELETE", true), true);

    // Protected, API, Vite HMR, and Git Smart HTTP paths must bypass
    for (const bypassPath of [
      "/auth",
      "/auth/login",
      "/admin",
      "/admin/users",
      "/user/profile",
      "/api/site-assets/logo",
      "/sw.js",
      "/@vite/client",
      "/@react-refresh",
      "/__vite_ping",
      "/src/client/styles.css",
      "/owner/repo/info/refs",
      "/owner/repo/git-upload-pack",
      "/owner/repo/git-receive-pack",
      "/owner/repo/raw",
      "/owner/repo/rawpath",
    ]) {
      assert.equal(
        shouldBypassServiceWorker(bypassPath, "GET", true),
        true,
        `${bypassPath} should bypass SW caching`
      );
    }

    // Public UI navigation & icons/assets are handled
    for (const handledPath of [
      "/",
      "/explore",
      "/namespaces",
      "/icons/icon-192.png",
      "/manifest.webmanifest",
      "/apple-touch-icon.png",
    ]) {
      assert.equal(
        shouldBypassServiceWorker(handledPath, "GET", true),
        false,
        `${handledPath} should not bypass SW`
      );
    }

    assert.equal(isStaticCacheableAsset("/assets/shell.js"), true);
    assert.equal(isStaticCacheableAsset("/icons/icon-192.png"), true);
    assert.equal(isStaticCacheableAsset("/manifest.webmanifest"), true);
    assert.equal(isStaticCacheableAsset("/apple-touch-icon.png"), true);
    assert.equal(isStaticCacheableAsset("/admin/settings"), false);
  });

  it("validates public/manifest.webmanifest, public/sw.js syntax, and PNG icon dimensions", () => {
    const manifestPath = path.join(ROOT_DIR, "public/manifest.webmanifest");
    const manifestRaw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as {
      id: string;
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: PwaIconSpec[];
    };

    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.name.length > 0);
    assert.ok(manifest.short_name.length > 0);
    assert.deepEqual(validateManifestIcons(manifest.icons), { ok: true });

    // Reject combined "any maskable" per installability best practice
    const badIcons = validateManifestIcons([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ]);
    assert.equal(badIcons.ok, false);

    // Check binary PNG signatures and exact pixel dimensions
    assert.deepEqual(readPngDimensions(path.join(ROOT_DIR, "public/icons/icon-192.png")), {
      width: 192,
      height: 192,
    });
    assert.deepEqual(readPngDimensions(path.join(ROOT_DIR, "public/icons/icon-512.png")), {
      width: 512,
      height: 512,
    });
    assert.deepEqual(readPngDimensions(path.join(ROOT_DIR, "public/icons/icon-maskable-512.png")), {
      width: 512,
      height: 512,
    });
    assert.deepEqual(readPngDimensions(path.join(ROOT_DIR, "public/apple-touch-icon.png")), {
      width: 180,
      height: 180,
    });

    const svgIcon = fs.readFileSync(path.join(ROOT_DIR, "public/icons/icon.svg"), "utf8");
    assert.match(svgIcon, /<svg\b/);

    // Verify public/sw.js parses cleanly as JavaScript and includes bypass protections
    const swPath = path.join(ROOT_DIR, "public/sw.js");
    const swCode = fs.readFileSync(swPath, "utf8");
    assert.doesNotThrow(() => new vm.Script(swCode, { filename: "public/sw.js" }));
    for (const token of [
      '"/auth"',
      '"/admin"',
      '"/user/"',
      '"/api/"',
      '"/sw.js"',
      '"/git-upload-pack"',
      '"/git-receive-pack"',
    ]) {
      assert.ok(swCode.includes(token), `sw.js must bypass ${token}`);
    }
  });

  it("enforces flat --radius: 0rem CSS tokens and official Segoe/Helvetica font stack", () => {
    const cssPath = path.join(ROOT_DIR, "src/client/styles/app.css");
    const css = fs.readFileSync(cssPath, "utf8");
    assert.match(css, /--radius:\s*0rem;/);
    assert.match(css, /"Segoe UI",\s*"Segoe UI Web"/);
    assert.match(css, /"Helvetica Neue",\s*Helvetica,\s*Arial,\s*sans-serif/);
    assert.equal(/\bbox-shadow\s*:/.test(css), false, "app.css must remain shadow-free");
  });
});
