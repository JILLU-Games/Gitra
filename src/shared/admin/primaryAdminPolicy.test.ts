import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLocalAccountSubject,
  resolveInitialAdminNamespaceSlug,
  verifyAdminCredentials,
} from "../../worker/auth/adminAuth";
import { evaluatePrimaryAdminPatchPolicy } from "./panel";

describe("primary admin namespace decoupling policy", () => {
  it("allows primary admin display name and handle changes while locking role, status, and password", () => {
    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        status: "active",
        role: "admin",
        hasPasswordChange: false,
      }),
      { ok: true }
    );

    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        hasPasswordChange: false,
      }),
      { ok: true }
    );

    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        status: "disabled",
        hasPasswordChange: false,
      }),
      { ok: false, reason: "protected-admin" }
    );

    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        role: "member",
        hasPasswordChange: false,
      }),
      { ok: false, reason: "protected-admin" }
    );

    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        hasPasswordChange: true,
      }),
      { ok: false, reason: "protected-admin" }
    );

    // When password is not managed by env (D1 claimed admin), password change is allowed,
    // but demoting to member or disabling remains strictly locked.
    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        hasPasswordChange: true,
        passwordManagedByEnv: false,
      }),
      { ok: true }
    );

    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        role: "member",
        hasPasswordChange: true,
        passwordManagedByEnv: false,
      }),
      { ok: false, reason: "protected-admin" }
    );

    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: true,
        status: "disabled",
        hasPasswordChange: true,
        passwordManagedByEnv: false,
      }),
      { ok: false, reason: "protected-admin" }
    );
  });

  it("allows full directory mutations for non-primary accounts", () => {
    assert.deepEqual(
      evaluatePrimaryAdminPatchPolicy({
        isPrimaryAdmin: false,
        status: "disabled",
        role: "viewer",
        hasPasswordChange: true,
      }),
      { ok: true }
    );
  });

  it("decouples initial public namespace via ADMIN_NAMESPACE from private ADMIN_USERNAME", async () => {
    const env = {
      AUTH_MODE: "production",
      ADMIN_USERNAME: "root-operator",
      ADMIN_PASSWORD: "super-secret-prod-password",
      ADMIN_NAMESPACE: "vibtools",
    };

    assert.equal(resolveInitialAdminNamespaceSlug(env), "vibtools");
    assert.equal(buildLocalAccountSubject(env.ADMIN_USERNAME), "local:root-operator");

    const verified = await verifyAdminCredentials(
      env,
      "root-operator",
      "super-secret-prod-password"
    );
    assert.deepEqual(verified, {
      ok: true,
      mode: "configured",
      username: "root-operator",
      namespaceSlug: "vibtools",
      subject: "local:root-operator",
    });

    // Fallback when ADMIN_NAMESPACE is unset or invalid
    assert.equal(
      resolveInitialAdminNamespaceSlug({ ADMIN_USERNAME: "ops-login", ADMIN_NAMESPACE: "auth" }),
      "ops-login"
    );
  });
});
