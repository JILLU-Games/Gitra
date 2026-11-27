export type DetectedLanguage = {
  language: string;
  langColor: string;
};

const CODE_EXTENSION_LANGUAGE: Record<string, DetectedLanguage> = {
  ts: { language: "TypeScript", langColor: "#3178c6" },
  tsx: { language: "TypeScript", langColor: "#3178c6" },
  mts: { language: "TypeScript", langColor: "#3178c6" },
  cts: { language: "TypeScript", langColor: "#3178c6" },
  js: { language: "JavaScript", langColor: "#f1e05a" },
  jsx: { language: "JavaScript", langColor: "#f1e05a" },
  mjs: { language: "JavaScript", langColor: "#f1e05a" },
  cjs: { language: "JavaScript", langColor: "#f1e05a" },
  py: { language: "Python", langColor: "#3572A5" },
  pyw: { language: "Python", langColor: "#3572A5" },
  rs: { language: "Rust", langColor: "#dea584" },
  go: { language: "Go", langColor: "#00ADD8" },
  java: { language: "Java", langColor: "#b07219" },
  kt: { language: "Kotlin", langColor: "#A97BFF" },
  kts: { language: "Kotlin", langColor: "#A97BFF" },
  swift: { language: "Swift", langColor: "#F05138" },
  rb: { language: "Ruby", langColor: "#701516" },
  php: { language: "PHP", langColor: "#4F5D95" },
  c: { language: "C", langColor: "#555555" },
  cc: { language: "C++", langColor: "#f34b7d" },
  cpp: { language: "C++", langColor: "#f34b7d" },
  cxx: { language: "C++", langColor: "#f34b7d" },
  hpp: { language: "C++", langColor: "#f34b7d" },
  h: { language: "C++", langColor: "#f34b7d" },
  cs: { language: "C#", langColor: "#178600" },
  dart: { language: "Dart", langColor: "#00B4AB" },
  lua: { language: "Lua", langColor: "#000080" },
  pl: { language: "Perl", langColor: "#0298c3" },
  sh: { language: "Shell", langColor: "#89e051" },
  bash: { language: "Shell", langColor: "#89e051" },
  zsh: { language: "Shell", langColor: "#89e051" },
  ps1: { language: "PowerShell", langColor: "#012456" },
  sql: { language: "SQL", langColor: "#e38c00" },
  html: { language: "HTML", langColor: "#e34c26" },
  htm: { language: "HTML", langColor: "#e34c26" },
  css: { language: "CSS", langColor: "#563d7c" },
  scss: { language: "CSS", langColor: "#563d7c" },
  less: { language: "CSS", langColor: "#563d7c" },
};

const SPECIAL_FILENAME_LANGUAGE: Record<string, DetectedLanguage> = {
  dockerfile: { language: "Dockerfile", langColor: "#384d54" },
  makefile: { language: "Makefile", langColor: "#427819" },
};

/**
 * Classifies a repository file path into its programming/markup language.
 * Returns null for documentation, lockfiles, and generic config files so a
 * repository's `README.md` or `package.json` does not overshadow source code.
 */
export function detectLanguageFromFilePath(filePath: string): DetectedLanguage | null {
  const baseName = (filePath.split("/").pop() || "").trim().toLowerCase();
  if (!baseName) return null;

  const special = SPECIAL_FILENAME_LANGUAGE[baseName];
  if (special) return special;

  // Ignore common non-source test/declaration suffixes noise? Keep `.ts`/`.test.ts` as TS.
  const dotIdx = baseName.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === baseName.length - 1) return null;
  const ext = baseName.slice(dotIdx + 1);
  return CODE_EXTENSION_LANGUAGE[ext] ?? null;
}

/**
 * Determines the dominant language from a real list of repository file paths.
 * Returns null when the repository is empty or contains no recognized code/web files.
 */
export function detectPrimaryLanguageFromPaths(paths: readonly string[]): DetectedLanguage | null {
  const counts = new Map<string, { count: number; color: string }>();

  for (const filePath of paths) {
    const detected = detectLanguageFromFilePath(filePath);
    if (!detected) continue;
    const prev = counts.get(detected.language);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(detected.language, { count: 1, color: detected.langColor });
    }
  }

  let best: { language: string; count: number; color: string } | null = null;
  for (const [language, info] of counts.entries()) {
    if (
      !best ||
      info.count > best.count ||
      (info.count === best.count && language.localeCompare(best.language) < 0)
    ) {
      best = { language, count: info.count, color: info.color };
    }
  }

  return best ? { language: best.language, langColor: best.color } : null;
}

/**
 * Extracts a normalized license identifier from common LICENSE file text headers.
 */
export function detectLicenseFromText(text: string): string | undefined {
  const head = text.slice(0, 1200).toLowerCase();
  if (!head.trim()) return undefined;
  if (
    head.includes("mit license") ||
    head.includes("permission is hereby granted, free of charge")
  ) {
    return "MIT";
  }
  if (head.includes("apache license") && head.includes("version 2.0")) {
    return "Apache-2.0";
  }
  if (head.includes("gnu general public license") && head.includes("version 3")) {
    return "GPL-3.0";
  }
  if (head.includes("gnu general public license") && head.includes("version 2")) {
    return "GPL-2.0";
  }
  if (head.includes("isc license")) {
    return "ISC";
  }
  if (head.includes("bsd 3-clause") || head.includes("neither the name of")) {
    return "BSD-3-Clause";
  }
  if (head.includes("bsd 2-clause")) {
    return "BSD-2-Clause";
  }
  if (head.includes("mozilla public license") && head.includes("2.0")) {
    return "MPL-2.0";
  }
  if (head.includes("unlicense")) {
    return "Unlicense";
  }
  return undefined;
}

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Extracts verified `version` and `license` fields from a repository's real
 * `package.json` text when present.
 */
export function extractPackageJsonMetadata(rawText: string): {
  license?: string;
  version?: string;
} {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const rawLicense = typeof obj.license === "string" ? obj.license.trim() : "";
    const license =
      rawLicense.length > 0 && rawLicense.length <= 32 && /^[A-Za-z0-9.+-]+$/.test(rawLicense)
        ? rawLicense
        : undefined;
    const rawVersion = typeof obj.version === "string" ? obj.version.trim().replace(/^v/i, "") : "";
    const version = SEMVER_RE.test(rawVersion) ? `v${rawVersion}` : undefined;
    return { license, version };
  } catch {
    return {};
  }
}
