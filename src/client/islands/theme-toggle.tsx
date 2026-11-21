/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { highlightThemeHref } from "@/client/highlight-theme";
import { hydrateIsland } from "@/client/hydrate";

export type ThemeToggleProps = Record<string, never>;

function applyHighlightTheme(theme: "light" | "dark") {
  const stylesheet = document.getElementById("hljs-theme");
  if (!(stylesheet instanceof HTMLLinkElement)) {
    return;
  }

  stylesheet.href = theme === "dark" ? highlightThemeHref.dark : highlightThemeHref.light;
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  applyHighlightTheme(theme);
}

export function ThemeToggleIsland(_props: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const initial = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  return (
    <button
      type="button"
      data-theme-toggle
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-transparent text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
      aria-label={`Toggle theme (current: ${theme === "dark" ? "Dark" : "Light"})`}
      onClick={() => {
        const nextTheme = theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        applyTheme(nextTheme);
        try {
          localStorage.setItem("theme", nextTheme);
        } catch {}
      }}
    >
      <Sun className="icon-light h-4 w-4" aria-hidden="true" />
      <Moon className="icon-dark h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function initThemeToggle() {
  hydrateIsland<ThemeToggleProps>("theme-toggle", ThemeToggleIsland);
}
