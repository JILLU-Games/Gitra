import assert from "node:assert/strict";
import test from "node:test";

import { canIssueGlobalPat, isGlobalPatUsernameAllowed } from "./panel";

test("canIssueGlobalPat allows only active admin accounts", () => {
  assert.equal(canIssueGlobalPat("admin", "active"), true);
  assert.equal(canIssueGlobalPat("admin"), true);
  assert.equal(canIssueGlobalPat("admin", "disabled"), false);
  assert.equal(canIssueGlobalPat("member", "active"), false);
  assert.equal(canIssueGlobalPat("viewer", "active"), false);
});

test("isGlobalPatUsernameAllowed accepts owner handle or target namespace slug", () => {
  assert.equal(
    isGlobalPatUsernameAllowed({
      presentedUsername: "vibtools-org",
      targetNamespaceSlug: "alex-dev",
      ownerNamespaceSlugs: ["vibtools-org"],
    }),
    true
  );

  assert.equal(
    isGlobalPatUsernameAllowed({
      presentedUsername: "ALEX-DEV",
      targetNamespaceSlug: "alex-dev",
      ownerNamespaceSlugs: ["vibtools-org"],
    }),
    true
  );

  assert.equal(
    isGlobalPatUsernameAllowed({
      presentedUsername: "stranger",
      targetNamespaceSlug: "alex-dev",
      ownerNamespaceSlugs: ["vibtools-org"],
    }),
    false
  );

  assert.equal(
    isGlobalPatUsernameAllowed({
      presentedUsername: "",
      targetNamespaceSlug: "alex-dev",
      ownerNamespaceSlugs: ["vibtools-org"],
    }),
    false
  );
});
