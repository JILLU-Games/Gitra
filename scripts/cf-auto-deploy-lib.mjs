import crypto from "node:crypto";
import path from "node:path";

/**
 * Pure, unit-tested helpers for the zero-touch Cloudflare auto-deployer.
 * Kept free of network/filesystem side effects so every invariant (idempotent
 * config generation, Free vs Paid tier policy, custom domain routing, and
 * non-destructive secret reconciliation) can be verified deterministically.
 */

export const REQUIRED_WORKER_SECRETS = ["SESSION_SECRET"];

export const OPTIONAL_AUTH_SECRETS = ["ADMIN_USERNAME", "ADMIN_PASSWORD", "AUTH_MODE"];

/**
 * Strips line (`//`) and block (`/* ... *\/`) comments from JSONC text while
 * preserving `//` and `/*` sequences inside double-quoted JSON strings.
 */
export function stripJsoncComments(raw) {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  // Also strip trailing commas before `}` or `]` that JSONC permits.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonc(raw) {
  return JSON.parse(stripJsoncComments(raw));
}

/**
 * Parses a `.env` file into key-value pairs without mutating `process.env`.
 * @param {string} raw
 * @returns {Record<string, string>}
 */
export function parseDotEnv(raw) {
  /** @type {Record<string, string>} */
  const result = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line
      .slice(0, eqIndex)
      .trim()
      .replace(/^export\s+/, "");
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const hashIndex = value.indexOf(" #");
      if (hashIndex >= 0) {
        value = value.slice(0, hashIndex).trim();
      }
    }

    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export function normalizeAppName(raw) {
  const cleaned = String(raw || "git-on-cloudflare")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) {
    throw new Error("APP_NAME must contain at least one alphanumeric character.");
  }
  return cleaned;
}

/**
 * Normalizes an optional custom domain (`APP_DOMAIN` / `CUSTOM_DOMAIN`),
 * accepting bare hostnames or full URLs like `https://git.vibtools.io/`.
 */
export function normalizeDomain(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const hostOnly = withoutProtocol
    .split("/")[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (!hostOnly) return "";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostOnly)) {
    throw new Error(
      `Invalid APP_DOMAIN "${raw}". Expected a valid hostname like "git.vibtools.io".`
    );
  }
  return hostOnly;
}

export function parseBooleanFlag(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function parseCliArgs(argv) {
  const flags = {
    help: false,
    dryRun: false,
    tier: undefined,
    useQueues: undefined,
    domain: undefined,
    appName: undefined,
    rotateSecrets: false,
    envFile: ".env.deploy",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--free") {
      flags.tier = "free";
    } else if (arg === "--paid") {
      flags.tier = "paid";
    } else if (arg === "--no-queues") {
      flags.useQueues = false;
    } else if (arg === "--with-queues") {
      flags.useQueues = true;
    } else if (arg === "--rotate-secrets") {
      flags.rotateSecrets = true;
    } else if (arg === "--domain" && argv[i + 1] !== undefined) {
      flags.domain = argv[++i];
    } else if (arg === "--name" && argv[i + 1] !== undefined) {
      flags.appName = argv[++i];
    } else if (arg === "--env-file" && argv[i + 1] !== undefined) {
      flags.envFile = argv[++i];
    } else {
      throw new Error(`Unknown CLI argument: ${arg}. Run with --help for usage.`);
    }
  }

  return flags;
}

/**
 * Resolves deployment settings from merged env + CLI flags.
 */
export function resolveDeployConfig(env, cliFlags = {}) {
  const rawTier = String(cliFlags.tier || env.CLOUDFLARE_TIER || "free")
    .trim()
    .toLowerCase();
  const tier = ["paid", "pro", "enterprise"].includes(rawTier) ? "paid" : "free";

  const appName = normalizeAppName(cliFlags.appName || env.APP_NAME || "git-on-cloudflare");
  const appDomain = normalizeDomain(
    cliFlags.domain !== undefined ? cliFlags.domain : env.APP_DOMAIN || env.CUSTOM_DOMAIN || ""
  );
  const useQueues =
    cliFlags.useQueues !== undefined ? cliFlags.useQueues : parseBooleanFlag(env.USE_QUEUES, true);
  const forceRotateSecrets = Boolean(
    cliFlags.rotateSecrets || parseBooleanFlag(env.FORCE_ROTATE_SECRETS, false)
  );

  const apiToken = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();

  const d1Name = String(env.CF_D1_NAME || appName).trim();
  const kvTitle = String(env.CF_KV_TITLE || `${appName}-routes`).trim();
  const r2Bucket = normalizeAppName(env.CF_R2_BUCKET || `${appName}-repos`);
  const queueName = normalizeAppName(env.CF_QUEUE_NAME || `${appName}-repo-maint`);

  /** @type {Record<string, string>} */
  const envSecrets = {};
  for (const key of [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_AUTH_SECRETS]) {
    const val = String(env[key] || "").trim();
    if (!val) continue;
    // Production Cloudflare deployments must never sync AUTH_MODE=development/demo.
    if (key === "AUTH_MODE") {
      envSecrets[key] = "production";
      continue;
    }
    envSecrets[key] = val;
  }

  return {
    apiToken,
    accountId,
    tier,
    appName,
    appDomain,
    useQueues,
    forceRotateSecrets,
    dryRun: Boolean(cliFlags.dryRun),
    resourceNames: {
      d1Name,
      kvTitle,
      r2Bucket,
      queueName,
    },
    envSecrets,
    logLevel: String(env.LOG_LEVEL || "info").trim() || "info",
    repoDoIdleMinutes: String(env.REPO_DO_IDLE_MINUTES || "30").trim() || "30",
  };
}

function rebaseRelativePath(rootRelativePath, configRelativeDir) {
  if (!configRelativeDir || configRelativeDir === ".") {
    return rootRelativePath;
  }
  const rebased = path.posix.relative(configRelativeDir.replace(/\\/g, "/"), rootRelativePath);
  return rebased || ".";
}

/**
 * Generates an ephemeral Wrangler config JSON object from the clean repository
 * template, live Cloudflare resource IDs, tier settings, and optional custom domain.
 *
 * `configRelativeDir` (e.g. `".wrangler"`) ensures Wrangler resolves `main`,
 * `migrations_dir`, and `assets.directory` accurately relative to the generated file.
 *
 * @typedef {{
 *   name: string;
 *   main: string;
 *   compatibility_date: string;
 *   compatibility_flags: string[];
 *   workers_dev: boolean;
 *   routes?: Array<{ pattern: string; custom_domain: boolean }>;
 *   limits?: { cpu_ms: number };
 *   durable_objects?: unknown;
 *   migrations?: unknown;
 *   kv_namespaces: Array<{ binding: string; id: string }>;
 *   d1_databases: Array<{ binding: string; database_name: string; database_id: string; migrations_dir: string }>;
 *   r2_buckets: Array<{ binding: string; bucket_name: string }>;
 *   queues?: {
 *     producers: Array<{ binding: string; queue: string }>;
 *     consumers: Array<{ queue: string; max_batch_size: number; max_batch_timeout: number }>;
 *   };
 *   observability: { enabled: boolean };
 *   assets: { binding: string; directory: string; html_handling: string };
 *   vars: Record<string, string>;
 * }} GeneratedWranglerConfig
 * @returns {GeneratedWranglerConfig}
 */
export function buildGeneratedWranglerConfig({
  templateConfig,
  deployConfig,
  resources,
  configRelativeDir = ".wrangler",
}) {
  /** @type {GeneratedWranglerConfig} */
  const generated = {
    name: deployConfig.appName,
    main: rebaseRelativePath(templateConfig.main || "src/worker/index.ts", configRelativeDir),
    compatibility_date: templateConfig.compatibility_date || "2026-05-13",
    compatibility_flags: Array.isArray(templateConfig.compatibility_flags)
      ? [...templateConfig.compatibility_flags]
      : ["nodejs_als"],
    workers_dev: true,
    durable_objects: templateConfig.durable_objects,
    migrations: templateConfig.migrations,
    kv_namespaces: [
      {
        binding: "ROUTES",
        id: resources.kvId,
      },
    ],
    d1_databases: [
      {
        binding: "DB",
        database_name: resources.d1Name,
        database_id: resources.d1Id,
        migrations_dir: rebaseRelativePath("drizzle/d1", configRelativeDir),
      },
    ],
    r2_buckets: [
      {
        binding: "REPO_BUCKET",
        bucket_name: resources.r2Bucket,
      },
    ],
    observability: templateConfig.observability || { enabled: true },
    assets: {
      binding: templateConfig.assets?.binding || "ASSETS",
      directory: rebaseRelativePath(
        templateConfig.assets?.directory || "dist/client",
        configRelativeDir
      ),
      html_handling: templateConfig.assets?.html_handling || "none",
    },
    vars: {
      AUTH_MODE: "production",
      CLOUDFLARE_TIER: deployConfig.tier,
      REPO_DO_IDLE_MINUTES: deployConfig.repoDoIdleMinutes,
      LOG_LEVEL: deployConfig.logLevel,
    },
  };

  if (deployConfig.appDomain) {
    generated.routes = [
      {
        pattern: deployConfig.appDomain,
        custom_domain: true,
      },
    ];
  }

  if (deployConfig.tier === "paid") {
    generated.limits = {
      cpu_ms: 300000,
    };
  }

  if (deployConfig.useQueues) {
    generated.queues = {
      producers: [
        {
          binding: "REPO_TASKS_QUEUE",
          queue: resources.queueName,
        },
      ],
      consumers: [
        {
          queue: resources.queueName,
          max_batch_size: 1,
          max_batch_timeout: 1,
        },
      ],
    };
  }

  return generated;
}

export function defaultGenerateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Plans non-destructive Worker secret synchronization:
 * - Required secrets missing remotely are created once (from env or CSPRNG).
 * - Existing remote secrets are NEVER overwritten on rebuild/redeploy unless
 *   `forceRotate` is explicitly enabled, preventing credential mismatch across
 *   unlimited deployments.
 * - Optional auth secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_MODE`)
 *   are synced only when supplied in env and either missing remotely or rotated.
 */
export function planSecretReconciliation({
  existingRemoteSecretNames,
  envSecrets = {},
  forceRotate = false,
  generateSecret = defaultGenerateSecret,
}) {
  const existing =
    existingRemoteSecretNames instanceof Set
      ? existingRemoteSecretNames
      : new Set(existingRemoteSecretNames || []);

  const plan = [];

  for (const name of REQUIRED_WORKER_SECRETS) {
    const alreadyExists = existing.has(name);
    const providedValue = envSecrets[name];

    if (alreadyExists && !forceRotate) {
      plan.push({
        name,
        action: "keep",
        source: "remote",
        reason: "already exists on Worker (preserved to prevent credential mismatch)",
      });
      continue;
    }

    const value = providedValue || generateSecret();
    plan.push({
      name,
      action: alreadyExists ? "rotate" : "create",
      source: providedValue ? "env" : "generated",
      value,
    });
  }

  for (const name of OPTIONAL_AUTH_SECRETS) {
    const providedValue = envSecrets[name];
    if (!providedValue) continue;

    const alreadyExists = existing.has(name);
    if (alreadyExists && !forceRotate) {
      plan.push({
        name,
        action: "keep",
        source: "remote",
        reason: "already exists on Worker (set FORCE_ROTATE_SECRETS=true to update)",
      });
      continue;
    }

    plan.push({
      name,
      action: alreadyExists ? "rotate" : "create",
      source: "env",
      value: providedValue,
    });
  }

  return plan;
}

/**
 * Extracts only pending secret creations/rotations for `wrangler deploy --secrets-file`.
 * Kept secrets (`action === "keep"`) are strictly excluded so existing remote secrets are
 * never written to ephemeral files or overwritten.
 *
 * @param {Array<{ name: string; action: string; value?: string }>} secretPlan
 * @returns {{ payload: Record<string, string>; count: number }}
 */
export function buildSecretsUploadPayload(secretPlan) {
  /** @type {Record<string, string>} */
  const payload = {};
  let count = 0;

  for (const step of secretPlan) {
    if (step.action !== "create" && step.action !== "rotate") continue;
    if (typeof step.value !== "string" || step.value.length === 0) continue;
    payload[step.name] = step.value;
    count += 1;
  }

  return { payload, count };
}

/**
 * Builds the argument vector for `npx wrangler deploy`, attaching `--secrets-file`
 * whenever new or rotated secrets must take effect atomically on deployment.
 *
 * @param {{ secretsFilePath?: string }} [options]
 * @returns {string[]}
 */
export function buildWranglerDeployArgs(options = {}) {
  const args = ["wrangler", "deploy"];
  if (options.secretsFilePath) {
    args.push("--secrets-file", options.secretsFilePath);
  }
  return args;
}
