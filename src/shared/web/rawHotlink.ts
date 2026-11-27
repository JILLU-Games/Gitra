function parseHostHeader(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function parseUrlHost(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    return new URL(trimmed).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validates whether a `/rawpath` request is allowed under hotlink protection.
 *
 * Allows:
 * - Same-host `Referer` matches (`url.host`, `Host`, or `X-Forwarded-Host`), even behind proxies.
 * - Fetch Metadata `Sec-Fetch-Site: same-origin` (for `no-referrer` same-origin embeds)
 *   and `Sec-Fetch-Site: none` (for direct browser address-bar / open-in-new-tab navigation),
 *   provided no cross-site `Referer` or `Origin` header is present.
 *
 * Blocks:
 * - Explicit `Sec-Fetch-Site: cross-site`.
 * - Any cross-host `Referer` or `Origin`.
 * - Automated probes carrying neither a matching `Referer` nor `Sec-Fetch-Site`.
 */
export function isRawPathRequestAllowed(req: Request, requestUrl: URL): boolean {
  const allowedHosts = new Set<string>([requestUrl.host.toLowerCase()]);
  for (const host of parseHostHeader(req.headers.get("x-forwarded-host"))) {
    allowedHosts.add(host);
  }
  for (const host of parseHostHeader(req.headers.get("host"))) {
    allowedHosts.add(host);
  }

  const secFetchSite = (req.headers.get("sec-fetch-site") || "").trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const rawReferer = req.headers.get("referer");
  const refererHost = parseUrlHost(rawReferer);
  if (rawReferer && rawReferer.trim() !== "") {
    if (!refererHost || !allowedHosts.has(refererHost)) {
      return false;
    }
    return true;
  }

  const rawOrigin = req.headers.get("origin");
  if (rawOrigin && rawOrigin.trim() !== "") {
    const originHost = parseUrlHost(rawOrigin);
    if (!originHost || !allowedHosts.has(originHost)) {
      return false;
    }
  }

  if (secFetchSite === "same-origin" || secFetchSite === "none") {
    return true;
  }

  return false;
}
