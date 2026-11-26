#!/usr/bin/env node
/**
 * Automated Cloudflare setup helper for git-on-cloudflare.
 *
 * Supports both:
 * - Cloudflare Workers Free Plan (default): uses `wrangler.jsonc` (`CLOUDFLARE_TIER=free`, no Paid `limits.cpu_ms`)
 * - Cloudflare Workers Paid Plan (`--paid`): uses `wrangler.paid.jsonc` (`CLOUDFLARE_TIER=paid`, `limits.cpu_ms=300000`)
 *
 * Usage:
 *   npm run cf:setup
 *   npm run cf:setup -- --no-queues
 *   npm run cf:setup -- --domain git.example.com
 *   npm run cf:setup:paid
 *   node scripts/cloudflare-setup.mjs --dry-run
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const FREE_CONFIG_PATH = path.join(ROOT_DIR, "wrangler.jsonc");
const PAID_CONFIG_PATH = path.join(ROOT_DIR, "wrangler.paid.jsonc");

function parseArgs(argv) {
  const options = {
    tier: "free",
    noQueues: false,
    dryRun: false,
    help: false,
    workerName: "git-on-cloudflare",
    d1Name: "git-on-cloudflare",
    kvTitle: "git-on-cloudflare-routes",
    r2Bucket: "git-repos",
    queueName: "git-on-cloudflare-repo-maint",
    domain: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--paid") {
      options.tier = "paid";
    } else if (arg === "--free") {
      options.tier = "free";
    } else if (arg === "--no-queues") {
      options.noQueues = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--name" && argv[i + 1]) {
      options.workerName = argv[++i];
    } else if (arg === "--d1" && argv[i + 1]) {
      options.d1Name = argv[++i];
    } else if (arg === "--kv" && argv[i + 1]) {
      options.kvTitle = argv[++i];
    } else if (arg === "--r2" && argv[i + 1]) {
      options.r2Bucket = argv[++i];
    } else if (arg === "--queue" && argv[i + 1]) {
      options.queueName = argv[++i];
    } else if (arg === "--domain" && argv[i + 1]) {
      options.domain = argv[++i].trim();
    } else {
      throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
git-on-cloudflare — Cloudflare Setup Helper

Usage:
  npm run cf:setup [options]
  npm run cf:setup:paid [options]

Options:
  --free                Configure for Cloudflare Workers Free Plan (default)
  --paid                Configure for Cloudflare Workers Paid Plan ($5/mo+)
  --no-queues           Skip Queue creation and remove queues block from wrangler.jsonc
                        (repo delete & route-cache sync automatically run inline)
  --domain <hostname>   Configure a custom domain route (optional; defaults to *.workers.dev)
  --name <worker>       Worker name (default: git-on-cloudflare)
  --d1 <name>           D1 database name (default: git-on-cloudflare)
  --kv <title>          KV namespace title (default: git-on-cloudflare-routes)
  --r2 <bucket>         R2 bucket name (default: git-repos)
  --queue <name>        Queue name (default: git-on-cloudflare-repo-maint)
  --dry-run             Preview all Wrangler commands and config updates without running them
  -h, --help            Show this help text
`);
}

function runWrangler(args, { allowFailure = false } = {}) {
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(cmd, ["wrangler", ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();

  if (result.status !== 0 && !allowFailure) {
    const details = [stdout, stderr].filter(Boolean).join("\n");
    throw new Error(`wrangler ${args.join(" ")} failed (exit ${result.status}):\n${details}`);
  }

  return { status: result.status ?? 1, stdout, stderr };
}

function extractFirstJson(text) {
  const startArray = text.indexOf("[");
  const startObject = text.indexOf("{");
  const candidates = [startArray, startObject].filter((idx) => idx >= 0);
  if (candidates.length === 0) return null;
  const start = Math.min(...candidates);
  const candidate = text.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function ensureD1(d1Name, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] npx wrangler d1 create ${d1Name}`);
    return "<your-d1-database-id>";
  }

  const list = runWrangler(["d1", "list", "--json"], { allowFailure: true });
  const parsedList = extractFirstJson(list.stdout);
  if (Array.isArray(parsedList)) {
    const existing = parsedList.find((item) => item && item.name === d1Name && item.uuid);
    if (existing) {
      console.log(`✓ Reusing existing D1 database "${d1Name}" (${existing.uuid})`);
      return existing.uuid;
    }
  }

  console.log(`→ Creating D1 database "${d1Name}"...`);
  const created = runWrangler(["d1", "create", d1Name]);
  const combined = `${created.stdout}\n${created.stderr}`;
  const match =
    combined.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/i) ||
    combined.match(/database_id\s*=\s*"([a-f0-9-]+)"/i);
  if (!match) {
    throw new Error(
      `Created D1 database "${d1Name}" but could not parse database_id from output:\n${combined}`
    );
  }
  console.log(`✓ Created D1 database "${d1Name}" (${match[1]})`);
  return match[1];
}

function ensureKv(kvTitle, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] npx wrangler kv namespace create ${kvTitle}`);
    return "<your-kv-namespace-id>";
  }

  const list = runWrangler(["kv", "namespace", "list"], { allowFailure: true });
  const parsedList = extractFirstJson(list.stdout);
  if (Array.isArray(parsedList)) {
    const existing = parsedList.find((item) => item && item.title === kvTitle && item.id);
    if (existing) {
      console.log(`✓ Reusing existing KV namespace "${kvTitle}" (${existing.id})`);
      return existing.id;
    }
  }

  console.log(`→ Creating KV namespace "${kvTitle}"...`);
  const created = runWrangler(["kv", "namespace", "create", kvTitle]);
  const combined = `${created.stdout}\n${created.stderr}`;
  const match =
    combined.match(/"id"\s*:\s*"([a-f0-9]+)"/i) || combined.match(/id\s*=\s*"([a-f0-9]+)"/i);
  if (!match) {
    throw new Error(
      `Created KV namespace "${kvTitle}" but could not parse id from output:\n${combined}`
    );
  }
  console.log(`✓ Created KV namespace "${kvTitle}" (${match[1]})`);
  return match[1];
}

function ensureR2(bucketName, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] npx wrangler r2 bucket create ${bucketName}`);
    return;
  }

  console.log(`→ Ensuring R2 bucket "${bucketName}"...`);
  const created = runWrangler(["r2", "bucket", "create", bucketName], { allowFailure: true });
  const combined = `${created.stdout}\n${created.stderr}`;
  if (created.status === 0) {
    console.log(`✓ Created R2 bucket "${bucketName}"`);
    return;
  }
  if (/already exists/i.test(combined)) {
    console.log(`✓ Reusing existing R2 bucket "${bucketName}"`);
    return;
  }
  if (/enable r2/i.test(combined) || /10042/.test(combined)) {
    throw new Error(
      `R2 is not enabled yet on your Cloudflare account. Open Cloudflare Dashboard -> R2 Object Storage, click Enable R2 (10 GB/mo Free tier), then re-run this script.\n\nOriginal output:\n${combined}`
    );
  }
  throw new Error(`Failed to create R2 bucket "${bucketName}":\n${combined}`);
}

function ensureQueue(queueName, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] npx wrangler queues create ${queueName}`);
    return;
  }

  console.log(`→ Ensuring Queue "${queueName}"...`);
  const created = runWrangler(["queues", "create", queueName], { allowFailure: true });
  const combined = `${created.stdout}\n${created.stderr}`;
  if (created.status === 0) {
    console.log(`✓ Created Queue "${queueName}"`);
    return;
  }
  if (/already exists|already taken/i.test(combined)) {
    console.log(`✓ Reusing existing Queue "${queueName}"`);
    return;
  }
  throw new Error(
    `Failed to create Queue "${queueName}". If you want to deploy on Free tier without Queues, re-run with --no-queues.\n\nOriginal output:\n${combined}`
  );
}

function patchWranglerConfig(filePath, values, { removeQueuesBlock = false } = {}) {
  let content = fs.readFileSync(filePath, "utf8");

  content = content.replace(/"name"\s*:\s*"[^"]+"/, `"name": "${values.workerName}"`);
  content = content.replace(
    /("binding"\s*:\s*"ROUTES"\s*,\s*"id"\s*:\s*")[^"]+(")/,
    `$1${values.kvId}$2`
  );
  content = content.replace(
    /("binding"\s*:\s*"DB"\s*,\s*"database_name"\s*:\s*")[^"]+(")/,
    `$1${values.d1Name}$2`
  );
  content = content.replace(/("database_id"\s*:\s*")[^"]+(")/, `$1${values.d1Id}$2`);
  content = content.replace(
    /("binding"\s*:\s*"REPO_BUCKET"\s*,\s*"bucket_name"\s*:\s*")[^"]+(")/,
    `$1${values.r2Bucket}$2`
  );
  content = content.replace(/("queue"\s*:\s*")[^"]+(")/g, `$1${values.queueName}$2`);

  if (values.domain) {
    const routesBlock = `  "routes": [\n    {\n      "pattern": "${values.domain}",\n      "custom_domain": true\n    }\n  ],`;
    if (/^\s*"routes"\s*:/m.test(content)) {
      content = content.replace(/^\s*"routes"\s*:\s*\[[\s\S]*?\],/m, routesBlock);
    } else {
      content = content.replace(/("workers_dev"\s*:\s*(?:true|false),)/, `$1\n${routesBlock}`);
    }
  }

  if (removeQueuesBlock) {
    content = content.replace(
      /\n\s*\/\/ Cloudflare Queues[\s\S]*?"queues"\s*:\s*\{[\s\S]*?\n\s*\},/,
      "\n  // Queues disabled (--no-queues): repo delete and route-cache sync run inline."
    );
  }

  fs.writeFileSync(filePath, content, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log(`\n=== git-on-cloudflare setup (${options.tier.toUpperCase()} tier) ===`);
  if (options.dryRun) {
    console.log("Mode: DRY RUN (no Cloudflare API calls or file writes)\n");
  }

  if (!options.dryRun) {
    console.log("→ Checking Cloudflare Wrangler login...");
    const whoami = runWrangler(["whoami"], { allowFailure: true });
    if (whoami.status !== 0) {
      throw new Error(
        "Not logged in to Cloudflare Wrangler yet. Run `npx wrangler login` first, then re-run this setup script."
      );
    }
    console.log("✓ Cloudflare Wrangler session verified");
  } else {
    console.log("[dry-run] npx wrangler whoami");
  }

  const d1Id = ensureD1(options.d1Name, options.dryRun);
  const kvId = ensureKv(options.kvTitle, options.dryRun);
  ensureR2(options.r2Bucket, options.dryRun);
  if (!options.noQueues) {
    ensureQueue(options.queueName, options.dryRun);
  } else {
    console.log("• Skipping Queue creation (--no-queues enabled; inline fallback active)");
  }

  const values = {
    workerName: options.workerName,
    d1Name: options.d1Name,
    d1Id,
    kvId,
    r2Bucket: options.r2Bucket,
    queueName: options.queueName,
    domain: options.domain,
  };

  if (options.dryRun) {
    console.log(
      `[dry-run] Patch ${path.relative(ROOT_DIR, FREE_CONFIG_PATH)} (removeQueuesBlock=${options.noQueues})`
    );
    console.log(`[dry-run] Patch ${path.relative(ROOT_DIR, PAID_CONFIG_PATH)}`);
  } else {
    patchWranglerConfig(FREE_CONFIG_PATH, values, { removeQueuesBlock: options.noQueues });
    console.log("✓ Updated wrangler.jsonc (Free tier config)");
    if (fs.existsSync(PAID_CONFIG_PATH)) {
      patchWranglerConfig(PAID_CONFIG_PATH, values, { removeQueuesBlock: false });
      console.log("✓ Updated wrangler.paid.jsonc (Paid tier config)");
    }
  }

  const deployCmd = options.tier === "paid" ? "npm run deploy:paid" : "npm run deploy";
  const secretConfigFlag = options.tier === "paid" ? " --config wrangler.paid.jsonc" : "";

  console.log(`
Next steps:
1. Set your 3 required Worker secrets (run once):
   npx wrangler secret put SESSION_SECRET${secretConfigFlag}
   npx wrangler secret put CREDENTIAL_SECRET${secretConfigFlag}
   npx wrangler secret put ADMIN_BOOTSTRAP_SECRET${secretConfigFlag}

2. Deploy to Cloudflare (${options.tier.toUpperCase()} tier):
   ${deployCmd}

Tip: To switch between Free and Paid later, no code changes are needed:
  - Free plan: npm run deploy
  - Paid plan: npm run deploy:paid
`);
}

try {
  main();
} catch (error) {
  console.error(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
