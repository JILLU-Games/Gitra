import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTheme, resolveInitialTheme, toggleThemeMode } from "./theme";

test("theme helpers", async (t) => {
  await t.test("normalizeTheme defaults invalid or missing values to dark", () => {
    assert.equal(normalizeTheme("light"), "light");
    assert.equal(normalizeTheme("dark"), "dark");
    assert.equal(normalizeTheme(null), "dark");
    assert.equal(normalizeTheme(undefined), "dark");
    assert.equal(normalizeTheme("sepia"), "dark");
  });

  await t.test("resolveInitialTheme prefers saved preference over DOM class", () => {
    assert.equal(resolveInitialTheme("light", true), "light");
    assert.equal(resolveInitialTheme("dark", false), "dark");
    assert.equal(resolveInitialTheme(null, true), "dark");
    assert.equal(resolveInitialTheme(null, false), "light");
    assert.equal(resolveInitialTheme("invalid", false), "light");
  });

  await t.test("toggleThemeMode alternates cleanly between dark and light", () => {
    assert.equal(toggleThemeMode("dark"), "light");
    assert.equal(toggleThemeMode("light"), "dark");
  });
});
