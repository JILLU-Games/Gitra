/**
 * Pure theme normalization and toggle state helpers shared across SSR bootstrap
 * and the client ThemeToggleIsland.
 */

export type ThemeMode = "light" | "dark";

export function normalizeTheme(value: unknown): ThemeMode {
  return value === "light" ? "light" : "dark";
}

export function resolveInitialTheme(savedTheme: unknown, hasDarkClass: boolean): ThemeMode {
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }
  return hasDarkClass ? "dark" : "light";
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  return current === "dark" ? "light" : "dark";
}
