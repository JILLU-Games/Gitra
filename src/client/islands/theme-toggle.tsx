/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { Sun } from "lucide-react";

import { resolveInitialTheme, toggleThemeMode, type ThemeMode } from "@/shared/web/theme";
import { highlightThemeHref } from "@/client/highlight-theme";
import { hydrateIsland } from "@/client/hydrate";

export type ThemeToggleProps = Record<string, never>;

function applyHighlightTheme(theme: ThemeMode) {
  const stylesheet = document.getElementById("hljs-theme");
  if (!(stylesheet instanceof HTMLLinkElement)) {
    return;
  }

  stylesheet.href = theme === "dark" ? highlightThemeHref.dark : highlightThemeHref.light;
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = theme === "dark" ? "#09090b" : "#ffffff";
  }
  applyHighlightTheme(theme);
}

export function ThemeToggleIsland(_props: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      saved = null;
    }
    const initial = resolveInitialTheme(saved, document.documentElement.classList.contains("dark"));
    setTheme(initial);
    applyTheme(initial);
  }, []);

  return (
    <button
      type="button"
      id="themeBtn"
      title="Toggle theme"
      data-theme-toggle
      className="w-7 h-7 rounded-none text-fgMuted hover:text-fg hover:bg-surfaceHover flex items-center justify-center transition-colors"
      aria-label={`Toggle theme (current: ${theme === "dark" ? "Dark" : "Light"})`}
      onClick={() => {
        const nextTheme = toggleThemeMode(theme);
        setTheme(nextTheme);
        applyTheme(nextTheme);
        try {
          localStorage.setItem("theme", nextTheme);
        } catch {}
      }}
    >
      <Sun className="icon-light w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
      <svg
        className="icon-dark w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        />
      </svg>
    </button>
  );
}

export function initThemeToggle() {
  hydrateIsland<ThemeToggleProps>("theme-toggle", ThemeToggleIsland);
}
