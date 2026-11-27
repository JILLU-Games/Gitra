import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildGeneratedWranglerConfig,
  buildSecretsUploadPayload,
  buildWranglerDeployArgs,
  normalizeDomain,
  parseCliArgs,
  parseDotEnv,
  parseJsonc,
  planSecretReconciliation,
  REQUIRED_WORKER_SECRETS,
  resolveDeployConfig,
} from "../scripts/cf-auto-deploy-lib.mjs";

test("parseJsonc strips comments while preserving URLs inside strings", () => {
  const parsed = parseJsonc(`{
    // line comment
    "url": "https://git.vibtools.io/foo",
    /* block comment */
    "enabled": true,
  }`);
  assert.equal(parsed.url, "https://git.vibtools.io/foo");
  assert.equal(parsed.enabled, true);
});

test("parseDotEnv reads env lines, quotes, export prefixes, and ignores comments", () => {
  const parsed = parseDotEnv(`
    # comment
    CLOUDFLARE_API_TOKEN="tok_123"
    export APP_DOMAIN=git.vibtools.io # inline comment
    CLOUDFLARE_TIER='paid'
  `);
  assert.equal(parsed.CLOUDFLARE_API_TOKEN, "tok_123");
  assert.equal(parsed.APP_DOMAIN, "git.vibtools.io");
  assert.equal(parsed.CLOUDFLARE_TIER, "paid");
});

test("normalizeDomain strips protocol/paths and rejects malformed hosts", () => {
  assert.equal(normalizeDomain(""), "");
  assert.equal(normalizeDomain("git.vibtools.io"), "git.vibtools.io");
  assert.equal(normalizeDomain("https://Git.VibTools.io/"), "git.vibtools.io");
  assert.throws(() => normalizeDomain("not a domain"), /Invalid APP_DOMAIN/);
});

test("resolveDeployConfig derives deterministic names and merges CLI overrides", () => {
  const flags = parseCliArgs(["--paid", "--no-queues", "--domain", "https://git.vibtools.io/"]);
  const cfg = resolveDeployConfig(
    {
      CLOUDFLARE_API_TOKEN: "cf-secret-token",
      APP_NAME: "My Git App",
    },
    flags
  );

  assert.equal(cfg.tier, "paid");
  assert.equal(cfg.useQueues, false);
  assert.equal(cfg.appName, "my-git-app");
  assert.equal(cfg.appDomain, "git.vibtools.io");
  assert.deepEqual(cfg.resourceNames, {
    d1Name: "my-git-app",
    kvTitle: "my-git-app-routes",
    r2Bucket: "my-git-app-repos",
    queueName: "my-git-app-repo-maint",
  });
});

test("buildGeneratedWranglerConfig produces Free config with custom domain and rebased paths", () => {
  const templateConfig = parseJsonc(fs.readFileSync(path.resolve("wrangler.jsonc"), "utf8"));
  const deployConfig = resolveDeployConfig({
    CLOUDFLARE_TIER: "free",
    APP_DOMAIN: "git.vibtools.io",
    USE_QUEUES: "false",
  });

  const generated = buildGeneratedWranglerConfig({
    templateConfig,
    deployConfig,
    resources: {
      d1Name: "git-on-cloudflare",
      d1Id: "11111111-2222-3333-4444-555555555555",
      kvId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      r2Bucket: "git-on-cloudflare-repos",
      queueName: "git-on-cloudflare-repo-maint",
    },
    configRelativeDir: ".wrangler",
  });

  assert.equal(generated.main, "../src/worker/index.ts");
  assert.equal(generated.d1_databases[0].migrations_dir, "../drizzle/d1");
  assert.equal(generated.assets.directory, "../dist/client");
  assert.equal("limits" in generated, false);
  assert.equal("queues" in generated, false);
  assert.deepEqual(generated.routes, [{ pattern: "git.vibtools.io", custom_domain: true }]);
  assert.equal(generated.vars.AUTH_MODE, "production");
  assert.equal(generated.vars.CLOUDFLARE_TIER, "free");

  const devLeakConfig = resolveDeployConfig({
    CLOUDFLARE_API_TOKEN: "cf-secret-token",
    AUTH_MODE: "development",
  });
  assert.equal(devLeakConfig.envSecrets.AUTH_MODE, "production");
});

test("buildGeneratedWranglerConfig produces Paid config with cpu_ms and queues when enabled", () => {
  const templateConfig = parseJsonc(fs.readFileSync(path.resolve("wrangler.jsonc"), "utf8"));
  const deployConfig = resolveDeployConfig({
    CLOUDFLARE_TIER: "paid",
    USE_QUEUES: "true",
  });

  const generated = buildGeneratedWranglerConfig({
    templateConfig,
    deployConfig,
    resources: {
      d1Name: "git-on-cloudflare",
      d1Id: "11111111-2222-3333-4444-555555555555",
      kvId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      r2Bucket: "git-on-cloudflare-repos",
      queueName: "git-on-cloudflare-repo-maint",
    },
    configRelativeDir: ".wrangler",
  });

  assert.deepEqual(generated.limits, { cpu_ms: 300000 });
  assert.equal("routes" in generated, false);
  assert.equal(generated.queues?.producers[0].queue, "git-on-cloudflare-repo-maint");
  assert.equal(generated.vars.CLOUDFLARE_TIER, "paid");
});

test("planSecretReconciliation creates secrets on first install and never overwrites on redeploy", () => {
  let seq = 0;
  const gen = () => `generated-${++seq}`;

  // First install: nothing exists on Cloudflare Worker yet
  const firstRun = planSecretReconciliation({
    existingRemoteSecretNames: new Set(),
    envSecrets: { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "initial-password" },
    forceRotate: false,
    generateSecret: gen,
  });

  const firstByName = new Map(firstRun.map((item) => [item.name, item]));
  for (const name of REQUIRED_WORKER_SECRETS) {
    assert.equal(firstByName.get(name)?.action, "create");
    assert.equal(firstByName.get(name)?.source, "generated");
  }
  assert.equal(firstByName.get("ADMIN_USERNAME")?.action, "create");
  assert.equal(firstByName.get("ADMIN_PASSWORD")?.action, "create");

  // Second install / rebuild: secrets already exist remotely -> MUST keep untouched
  const redeployRun = planSecretReconciliation({
    existingRemoteSecretNames: new Set([
      ...REQUIRED_WORKER_SECRETS,
      "ADMIN_USERNAME",
      "ADMIN_PASSWORD",
    ]),
    envSecrets: {
      SESSION_SECRET: "different-value-should-not-overwrite",
      ADMIN_PASSWORD: "different-password-should-not-overwrite",
    },
    forceRotate: false,
    generateSecret: gen,
  });

  for (const step of redeployRun) {
    assert.equal(
      step.action,
      "keep",
      `Secret ${step.name} must never be overwritten on redeploy without FORCE_ROTATE_SECRETS=true`
    );
  }

  // Explicit rotation: forceRotate=true allows updating secrets
  const rotateRun = planSecretReconciliation({
    existingRemoteSecretNames: new Set(REQUIRED_WORKER_SECRETS),
    envSecrets: { SESSION_SECRET: "new-rotated-secret" },
    forceRotate: true,
    generateSecret: gen,
  });
  const rotateSession = rotateRun.find((item) => item.name === "SESSION_SECRET");
  assert.equal(rotateSession?.action, "rotate");
  assert.equal(rotateSession?.value, "new-rotated-secret");
});

test("committed wrangler.jsonc and wrangler.paid.jsonc contain zero hardcoded production IDs or domains", () => {
  for (const fileName of ["wrangler.jsonc", "wrangler.paid.jsonc"]) {
    const config = parseJsonc(fs.readFileSync(path.resolve(fileName), "utf8"));
    assert.equal("routes" in config, false, `${fileName} must not hardcode production routes`);
    assert.equal(
      config.d1_databases[0].database_id,
      "00000000-0000-0000-0000-000000000000",
      `${fileName} must not hardcode a real D1 database UUID`
    );
    assert.equal(
      config.kv_namespaces[0].id,
      "local-routes-kv",
      `${fileName} must not hardcode a real KV namespace ID`
    );
  }
});

test("F-20: provisions only active SESSION_SECRET and attaches pending secrets atomically before/with deploy", () => {
  assert.deepEqual(REQUIRED_WORKER_SECRETS, ["SESSION_SECRET"]);
  assert.equal(REQUIRED_WORKER_SECRETS.includes("CREDENTIAL_SECRET"), false);
  assert.equal(REQUIRED_WORKER_SECRETS.includes("ADMIN_BOOTSTRAP_SECRET"), false);

  const firstInstallPlan = planSecretReconciliation({
    existingRemoteSecretNames: new Set(),
    envSecrets: { ADMIN_USERNAME: "founder", ADMIN_PASSWORD: "StrongPassword#1" },
    forceRotate: false,
    generateSecret: () => "generated-session-secret",
  });
  const firstUpload = buildSecretsUploadPayload(firstInstallPlan);
  assert.equal(firstUpload.count, 3);
  assert.deepEqual(firstUpload.payload, {
    SESSION_SECRET: "generated-session-secret",
    ADMIN_USERNAME: "founder",
    ADMIN_PASSWORD: "StrongPassword#1",
  });
  assert.deepEqual(buildWranglerDeployArgs({ secretsFilePath: ".wrangler/deploy.secrets.json" }), [
    "wrangler",
    "deploy",
    "--secrets-file",
    ".wrangler/deploy.secrets.json",
  ]);

  // Redeploy with preserved secrets produces zero upload keys and plain `wrangler deploy`
  const redeployPlan = planSecretReconciliation({
    existingRemoteSecretNames: new Set(["SESSION_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"]),
    envSecrets: { ADMIN_USERNAME: "founder", ADMIN_PASSWORD: "changed-ignored" },
    forceRotate: false,
    generateSecret: () => "unused",
  });
  const redeployUpload = buildSecretsUploadPayload(redeployPlan);
  assert.equal(redeployUpload.count, 0);
  assert.deepEqual(redeployUpload.payload, {});
  assert.deepEqual(buildWranglerDeployArgs(), ["wrangler", "deploy"]);

  // Verify scripts/cf-auto-deploy.mjs live deployment path plans secrets before invoking buildWranglerDeployArgs
  const deployScript = fs.readFileSync(path.resolve("scripts/cf-auto-deploy.mjs"), "utf8");
  const liveFlow = deployScript.slice(deployScript.indexOf("// Phase C:"));
  const planIndex = liveFlow.indexOf("planSecretReconciliation(");
  const deployIndex = liveFlow.indexOf("buildWranglerDeployArgs(");
  assert.ok(
    planIndex >= 0 && deployIndex > planIndex,
    "Secrets must be planned before wrangler deploy"
  );
});

test("F-21: unreferenced public/assets/aistudio design artifacts are removed from static assets", () => {
  assert.equal(fs.existsSync(path.resolve("public/assets/aistudio")), false);
});
