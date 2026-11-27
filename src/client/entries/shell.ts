import { initPwaShell, mountGlobalToastViewport } from "@/client/components/ui";
import { initHeaderMenusIsland } from "@/client/islands/header-menus";
import { initSidebarShell } from "@/client/islands/sidebar-shell";
import { initThemeToggle } from "@/client/islands/theme-toggle";
import { onReady } from "../on-ready";

onReady(() => {
  initThemeToggle();
  initHeaderMenusIsland();
  initSidebarShell();
  mountGlobalToastViewport();
  initPwaShell();
});
