#!/usr/bin/env node
/**
 * Zero-Touch, Idempotent Cloudflare Auto-Deployer for git-on-cloudflare.
 *
 * - Authenticated purely via `CLOUDFLARE_API_TOKEN` (zero interactive login).
 * - First install: automatically creates D1, KV, R2, and optional Queue, runs
 *   D1 migrations, builds, deploys (including `APP_DOMAIN` custom domain), and
 *   seeds required secrets once.
 * - Subsequent rebuilds/redeploys: reuses existing resource IDs and NEVER
 *   overwrites existing Worker secrets (zero credential mismatch).
 * - Keeps committed `wrangler.jsonc` completely clean — deploy config is
 *   written ephemerally to git-ignored `.wrangler/deploy.generated.jsonc`.
 *
 * Usage:
 *   npm run cf:auto-deploy
 *   npm run cf:auto-deploy -- --dry-run
 *   npm run cf:auto-deploy -- --paid --domain git.vibtools.io
 *   npm run cf:auto-deploy -- --free --no-queues
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildGeneratedWranglerConfig,
  parseCliArgs,
  parseDotEnv,
  parseJsonc,
  planSecretReconciliation,
  resolveDeployConfig,
} from "./cf-auto-deploy-lib.mjs";

const ROOT_DIR = process.cwd();
const TEMPLATE_CONFIG_PATH = path.join(ROOT_DIR, "wrangler.jsonc");
const GENERATED_DIR = path.join(ROOT_DIR, ".wrangler");
const GENERATED_CONFIG_PATH = path.join(GENERATED_DIR, "deploy.generated.jsonc");
const CF_API_BASE = "https://api.cloudflare.com/client/v4";

function printHelp() {
  console.log(`
git-on-cloudflare — Zero-Touch Cloudflare Auto-Deployer

Usage:
  npm run cf:auto-deploy [options]

Options:
  --free                 Deploy for Cloudflare Workers Free Plan (default)
  --paid                 Deploy for Cloudflare Workers Paid Plan ($5/mo+, cpu_ms: 300000)
  --domain <hostname>    Bind a Cloudflare Custom Domain (e.g. git.vibtools.io)
  --name <app-name>      Worker & resource prefix name (default: git-on-cloudflare)
  --no-queues            Deploy without Cloudflare Queues (uses inline fallback)
  --with-queues          Force-enable Cloudflare Queues
  --rotate-secrets       Explicitly overwrite existing Worker secrets (off by default)
  --env-file <path>      Optional dotenv file to load (default: .env.deploy)
  --dry-run              Preview planned Cloudflare API checks, config, and secret actions
  -h, --help             Show this help message

Environment Variables (via process env or .env.deploy):
  CLOUDFLARE_API_TOKEN   Required. Cloudflare API Token with Edit permissions for
                         Workers Scripts, D1, KV, R2, Queues (optional), Zone Routes/DNS,
                         and Account Settings (Read).
  CLOUDFLARE_ACCOUNT_ID  Optional. Auto-detected when token accesses a single account.
  APP_DOMAIN             Optional. Custom domain (e.g. git.vibtools.io). Defaults to *.workers.dev.
  CLOUDFLARE_TIER        Optional. "free" (default) or "paid".
  APP_NAME               Optional. Worker & resource prefix (default: git-on-cloudflare).
  USE_QUEUES             Optional. "true" (default) or "false".
  FORCE_ROTATE_SECRETS   Optional. "false" (default). Set "true" only when intentionally rotating.
`);
}

function loadMergedEnv(envFileRelative) {
  const fileEnv = {};
  if (envFileRelative) {
    const resolved = path.resolve(ROOT_DIR, envFileRelative);
    if (fs.existsSync(resolved)) {
      const parsed = parseDotEnv(fs.readFileSync(resolved, "utf8"));
      Object.assign(fileEnv, parsed);
    }
  }
  // Real process.env always takes precedence over .env.deploy (critical for CI).
  return { ...fileEnv, ...process.env };
}

async function cfRequest(token, method, apiPath, body) {
  const url = `${CF_API_BASE}${apiPath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok && (!json || json.success !== false),
    status: response.status,
    result: json?.result,
    resultInfo: json?.result_info,
    errors: Array.isArray(json?.errors) ? json.errors : [],
    rawText: text,
  };
}

function formatCfErrors(res) {
  if (res.errors.length > 0) {
    return res.errors
      .map((e) => `[${e.code ?? res.status}] ${e.message ?? "API error"}`)
      .join("; ");
  }
  return `HTTP ${res.status}: ${res.rawText.slice(0, 300)}`;
}

async function resolveAccountId(token, configuredAccountId) {
  if (configuredAccountId) {
    const check = await cfRequest(token, "GET", `/accounts/${configuredAccountId}`);
    if (!check.ok) {
      throw new Error(
        `Could not verify CLOUDFLARE_ACCOUNT_ID "${configuredAccountId}": ${formatCfErrors(check)}`
      );
    }
    console.log(
      `✓ Using Cloudflare Account "${check.result?.name || configuredAccountId}" (${configuredAccountId})`
    );
    return configuredAccountId;
  }

  const list = await cfRequest(token, "GET", "/accounts?per_page=50");
  if (!list.ok) {
    throw new Error(
      `Failed to resolve Cloudflare account from CLOUDFLARE_API_TOKEN: ${formatCfErrors(list)}. ` +
        `Grant "Account -> Account Settings: Read" or set CLOUDFLARE_ACCOUNT_ID explicitly.`
    );
  }
  const accounts = Array.isArray(list.result) ? list.result : [];
  if (accounts.length === 0) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN returned 0 accessible accounts. Check token account scope or set CLOUDFLARE_ACCOUNT_ID."
    );
  }
  if (accounts.length > 1) {
    const summary = accounts.map((a) => `  - ${a.name}: ${a.id}`).join("\n");
    throw new Error(
      `CLOUDFLARE_API_TOKEN can access multiple accounts. Please set CLOUDFLARE_ACCOUNT_ID:\n${summary}`
    );
  }
  const account = accounts[0];
  console.log(`✓ Auto-detected Cloudflare Account "${account.name}" (${account.id})`);
  return account.id;
}

async function ensureD1(token, accountId, d1Name) {
  const list = await cfRequest(
    token,
    "GET",
    `/accounts/${accountId}/d1/database?name=${encodeURIComponent(d1Name)}&per_page=100`
  );
  if (!list.ok) {
    throw new Error(
      `Failed to list D1 databases (ensure token has "Account -> D1: Edit"): ${formatCfErrors(list)}`
    );
  }
  const existing = (Array.isArray(list.result) ? list.result : []).find(
    (db) => db && db.name === d1Name && db.uuid
  );
  if (existing) {
    console.log(`✓ Reusing existing D1 database "${d1Name}" (${existing.uuid})`);
    return existing.uuid;
  }

  console.log(`→ Creating D1 database "${d1Name}"...`);
  const created = await cfRequest(token, "POST", `/accounts/${accountId}/d1/database`, {
    name: d1Name,
  });
  if (!created.ok || !created.result?.uuid) {
    throw new Error(`Failed to create D1 database "${d1Name}": ${formatCfErrors(created)}`);
  }
  console.log(`✓ Created D1 database "${d1Name}" (${created.result.uuid})`);
  return created.result.uuid;
}

async function ensureKv(token, accountId, kvTitle) {
  for (let page = 1; page <= 20; page += 1) {
    const list = await cfRequest(
      token,
      "GET",
      `/accounts/${accountId}/storage/kv/namespaces?page=${page}&per_page=100`
    );
    if (!list.ok) {
      throw new Error(
        `Failed to list KV namespaces (ensure token has "Account -> Workers KV Storage: Edit"): ${formatCfErrors(list)}`
      );
    }
    const items = Array.isArray(list.result) ? list.result : [];
    const existing = items.find((ns) => ns && ns.title === kvTitle && ns.id);
    if (existing) {
      console.log(`✓ Reusing existing KV namespace "${kvTitle}" (${existing.id})`);
      return existing.id;
    }
    const totalPages = list.resultInfo?.total_pages ?? 1;
    if (page >= totalPages || items.length === 0) break;
  }

  console.log(`→ Creating KV namespace "${kvTitle}"...`);
  const created = await cfRequest(token, "POST", `/accounts/${accountId}/storage/kv/namespaces`, {
    title: kvTitle,
  });
  if (!created.ok || !created.result?.id) {
    throw new Error(`Failed to create KV namespace "${kvTitle}": ${formatCfErrors(created)}`);
  }
  console.log(`✓ Created KV namespace "${kvTitle}" (${created.result.id})`);
  return created.result.id;
}

async function ensureR2(token, accountId, bucketName) {
  const existing = await cfRequest(
    token,
    "GET",
    `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}`
  );
  if (existing.ok) {
    console.log(`✓ Reusing existing R2 bucket "${bucketName}"`);
    return bucketName;
  }

  const combinedExistingErr = formatCfErrors(existing);
  if (/10042|enable r2/i.test(combinedExistingErr)) {
    throw new Error(
      `R2 is not enabled yet on this Cloudflare account. Open Cloudflare Dashboard -> R2 Object Storage and click "Enable R2" once (10 GB/month Free quota), then re-run this deploy.`
    );
  }

  if (existing.status !== 404) {
    throw new Error(
      `Failed to inspect R2 bucket "${bucketName}" (ensure token has "Account -> Workers R2 Storage: Edit"): ${combinedExistingErr}`
    );
  }

  console.log(`→ Creating R2 bucket "${bucketName}"...`);
  const created = await cfRequest(token, "POST", `/accounts/${accountId}/r2/buckets`, {
    name: bucketName,
  });
  if (created.ok) {
    console.log(`✓ Created R2 bucket "${bucketName}"`);
    return bucketName;
  }
  const combinedCreateErr = formatCfErrors(created);
  if (/10042|enable r2/i.test(combinedCreateErr)) {
    throw new Error(
      `R2 is not enabled yet on this Cloudflare account. Open Cloudflare Dashboard -> R2 Object Storage and click "Enable R2" once (10 GB/month Free quota), then re-run this deploy.`
    );
  }
  if (/already exists|10004/i.test(combinedCreateErr)) {
    console.log(`✓ Reusing existing R2 bucket "${bucketName}"`);
    return bucketName;
  }
  throw new Error(`Failed to create R2 bucket "${bucketName}": ${combinedCreateErr}`);
}

async function ensureQueue(token, accountId, queueName) {
  const list = await cfRequest(token, "GET", `/accounts/${accountId}/queues`);
  if (!list.ok) {
    throw new Error(
      `Failed to list Queues (ensure token has "Account -> Queues: Edit", or re-run with USE_QUEUES=false / --no-queues): ${formatCfErrors(list)}`
    );
  }
  const existing = (Array.isArray(list.result) ? list.result : []).find(
    (q) => q && q.queue_name === queueName
  );
  if (existing) {
    console.log(`✓ Reusing existing Queue "${queueName}"`);
    return queueName;
  }

  console.log(`→ Creating Queue "${queueName}"...`);
  const created = await cfRequest(token, "POST", `/accounts/${accountId}/queues`, {
    queue_name: queueName,
  });
  if (created.ok) {
    console.log(`✓ Created Queue "${queueName}"`);
    return queueName;
  }
  const errText = formatCfErrors(created);
  if (/already exists|already taken/i.test(errText)) {
    console.log(`✓ Reusing existing Queue "${queueName}"`);
    return queueName;
  }
  throw new Error(
    `Failed to create Queue "${queueName}" (or set USE_QUEUES=false / --no-queues): ${errText}`
  );
}

async function listWorkerSecretNames(token, accountId, workerName) {
  const res = await cfRequest(
    token,
    "GET",
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`
  );
  if (res.status === 404) {
    return new Set();
  }
  if (!res.ok) {
    throw new Error(
      `Failed to list existing Worker secrets for "${workerName}": ${formatCfErrors(res)}`
    );
  }
  const items = Array.isArray(res.result) ? res.result : [];
  return new Set(items.map((item) => item?.name).filter(Boolean));
}

async function putWorkerSecret(token, accountId, workerName, name, value) {
  const res = await cfRequest(
    token,
    "PUT",
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
    {
      name,
      text: value,
      type: "secret_text",
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to upload Worker secret "${name}": ${formatCfErrors(res)}`);
  }
}

function runCommand(command, args, extraEnv = {}) {
  const bin = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  const result = spawnSync(bin, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status ?? 1}): ${command} ${args.join(" ")}`);
  }
}

async function main() {
  const cliFlags = parseCliArgs(process.argv.slice(2));
  if (cliFlags.help) {
    printHelp();
    return;
  }

  const mergedEnv = loadMergedEnv(cliFlags.envFile);
  const deployConfig = resolveDeployConfig(mergedEnv, cliFlags);
  const templateConfig = parseJsonc(fs.readFileSync(TEMPLATE_CONFIG_PATH, "utf8"));

  console.log(`\n=== git-on-cloudflare Zero-Touch Auto-Deploy ===`);
  console.log(`• Worker name : ${deployConfig.appName}`);
  console.log(
    `• Tier        : ${deployConfig.tier.toUpperCase()}${deployConfig.tier === "paid" ? " (cpu_ms: 300000)" : " (Free 10ms CPU safe mode)"}`
  );
  console.log(`• Domain      : ${deployConfig.appDomain || "(default *.workers.dev)"}`);
  console.log(
    `• Queues      : ${deployConfig.useQueues ? deployConfig.resourceNames.queueName : "disabled (inline fallback)"}`
  );
  console.log(
    `• Secret sync : ${deployConfig.forceRotateSecrets ? "FORCE ROTATE enabled" : "non-destructive (existing remote secrets preserved)"}`
  );

  if (deployConfig.dryRun) {
    console.log("\nMode: DRY RUN (no Cloudflare API calls, no deploy, no secret changes)\n");
    const sampleGenerated = buildGeneratedWranglerConfig({
      templateConfig,
      deployConfig,
      resources: {
        d1Name: deployConfig.resourceNames.d1Name,
        d1Id: "<resolved-d1-database-id>",
        kvId: "<resolved-kv-namespace-id>",
        r2Bucket: deployConfig.resourceNames.r2Bucket,
        queueName: deployConfig.resourceNames.queueName,
      },
      configRelativeDir: ".wrangler",
    });
    const samplePlan = planSecretReconciliation({
      existingRemoteSecretNames: new Set(),
      envSecrets: deployConfig.envSecrets,
      forceRotate: deployConfig.forceRotateSecrets,
      generateSecret: () => "<generated-64-hex-once>",
    });

    console.log("1. Would verify CLOUDFLARE_API_TOKEN & resolve Account ID");
    console.log(
      `2. Would lookup-or-create D1 "${deployConfig.resourceNames.d1Name}", KV "${deployConfig.resourceNames.kvTitle}", R2 "${deployConfig.resourceNames.r2Bucket}"${deployConfig.useQueues ? `, Queue "${deployConfig.resourceNames.queueName}"` : ""}`
    );
    console.log("3. Ephemeral config preview (.wrangler/deploy.generated.jsonc):");
    console.log(JSON.stringify(sampleGenerated, null, 2));
    console.log("4. Would run remote D1 migrations, Vite production build, and Wrangler deploy");
    console.log("5. Secret reconciliation preview (assuming first install):");
    for (const item of samplePlan) {
      console.log(`   - ${item.name}: ${item.action} (${item.source})`);
    }
    console.log("\nDry run completed cleanly.");
    return;
  }

  if (!deployConfig.apiToken) {
    throw new Error(
      `Missing CLOUDFLARE_API_TOKEN. Export it in your environment or add it to ${cliFlags.envFile} (see .env.deploy.example).`
    );
  }

  // Phase A: Idempotent Cloudflare Resource Discovery / Provisioning
  const accountId = await resolveAccountId(deployConfig.apiToken, deployConfig.accountId);
  const d1Id = await ensureD1(deployConfig.apiToken, accountId, deployConfig.resourceNames.d1Name);
  const kvId = await ensureKv(deployConfig.apiToken, accountId, deployConfig.resourceNames.kvTitle);
  const r2Bucket = await ensureR2(
    deployConfig.apiToken,
    accountId,
    deployConfig.resourceNames.r2Bucket
  );
  const queueName = deployConfig.useQueues
    ? await ensureQueue(deployConfig.apiToken, accountId, deployConfig.resourceNames.queueName)
    : deployConfig.resourceNames.queueName;

  // Phase B: Write Ephemeral Generated Wrangler Config (git-ignored)
  const generatedConfig = buildGeneratedWranglerConfig({
    templateConfig,
    deployConfig,
    resources: {
      d1Name: deployConfig.resourceNames.d1Name,
      d1Id,
      kvId,
      r2Bucket,
      queueName,
    },
    configRelativeDir: ".wrangler",
  });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(GENERATED_CONFIG_PATH, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
  console.log(
    `✓ Generated ephemeral deploy config (${path.relative(ROOT_DIR, GENERATED_CONFIG_PATH)})`
  );

  const cfChildEnv = {
    CLOUDFLARE_API_TOKEN: deployConfig.apiToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    WRANGLER_CONFIG: "./.wrangler/deploy.generated.jsonc",
  };

  // Phase C: Apply D1 Migrations, Build Bundle, and Deploy Worker + Custom Domain
  console.log("\n→ Applying remote D1 migrations...");
  runCommand(
    "npx",
    [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      deployConfig.resourceNames.d1Name,
      "--remote",
      "--config",
      ".wrangler/deploy.generated.jsonc",
    ],
    cfChildEnv
  );

  console.log("\n→ Building production Worker & client bundle...");
  runCommand("npx", ["vite", "build"], cfChildEnv);

  console.log("\n→ Deploying Worker to Cloudflare...");
  runCommand("npx", ["wrangler", "deploy"], cfChildEnv);

  // Phase D: Non-Destructive Secret Reconciliation (Zero Credential Mismatch)
  console.log("\n→ Reconciling Worker secrets...");
  const existingSecrets = await listWorkerSecretNames(
    deployConfig.apiToken,
    accountId,
    deployConfig.appName
  );
  const secretPlan = planSecretReconciliation({
    existingRemoteSecretNames: existingSecrets,
    envSecrets: deployConfig.envSecrets,
    forceRotate: deployConfig.forceRotateSecrets,
  });

  const newlyGenerated = [];
  for (const step of secretPlan) {
    if (step.action === "keep") {
      console.log(`✓ Secret ${step.name}: kept (${step.reason})`);
      continue;
    }
    await putWorkerSecret(
      deployConfig.apiToken,
      accountId,
      deployConfig.appName,
      step.name,
      step.value
    );
    console.log(
      `✓ Secret ${step.name}: ${step.action === "rotate" ? "rotated" : "created"} (${step.source})`
    );
    if (step.source === "generated") {
      newlyGenerated.push(step.name);
    }
  }

  console.log("\n=== Deployment Complete ===");
  if (deployConfig.appDomain) {
    console.log(`Live URL : https://${deployConfig.appDomain}`);
  } else {
    console.log(`Live URL : https://${deployConfig.appName}.<your-subdomain>.workers.dev`);
  }
  console.log(`Tier     : ${deployConfig.tier.toUpperCase()}`);
  if (newlyGenerated.length > 0) {
    console.log(
      `Secrets  : Auto-generated on first install (${newlyGenerated.join(", ")}) and stored safely in Cloudflare. Future redeploys will keep them unchanged.`
    );
  } else {
    console.log("Secrets  : All existing Worker secrets preserved (zero credential mismatch).");
  }
}

main().catch((error) => {
  console.error(`\nAuto-deploy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
