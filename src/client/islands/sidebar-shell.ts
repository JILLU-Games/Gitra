/// <reference lib="dom" />

const STORAGE_KEY = "goc_sidebar_collapsed";

/**
 * Progressive-enhancement controller for the persistent desktop sidebar
 * collapse toggle and the responsive mobile navigation drawer.
 */
export function initSidebarShell(): void {
  const root = document.documentElement;
  const collapseBtn = document.querySelector<HTMLButtonElement>("[data-sidebar-collapse]");
  const openBtn = document.querySelector<HTMLButtonElement>("[data-sidebar-open]");
  const drawer = document.querySelector<HTMLElement>("[data-sidebar-drawer]");
  const closeBtn = document.querySelector<HTMLButtonElement>("[data-sidebar-close]");
  const backdrop = document.querySelector<HTMLElement>("[data-sidebar-backdrop]");

  if (collapseBtn) {
    const syncCollapseState = (collapsed: boolean) => {
      if (collapsed) {
        root.dataset.sidebarCollapsed = "true";
      } else {
        delete root.dataset.sidebarCollapsed;
      }
      collapseBtn.setAttribute("aria-expanded", String(!collapsed));
      collapseBtn.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar"
      );
      collapseBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    };

    syncCollapseState(root.dataset.sidebarCollapsed === "true");

    collapseBtn.addEventListener("click", () => {
      const nextCollapsed = root.dataset.sidebarCollapsed !== "true";
      syncCollapseState(nextCollapsed);
      try {
        localStorage.setItem(STORAGE_KEY, nextCollapsed ? "true" : "false");
      } catch {}
    });
  }

  if (drawer && openBtn) {
    const setDrawerOpen = (open: boolean) => {
      drawer.dataset.open = open ? "true" : "false";
      openBtn.setAttribute("aria-expanded", String(open));
      if (open) {
        closeBtn?.focus();
      } else {
        openBtn.focus();
      }
    };

    openBtn.addEventListener("click", () => setDrawerOpen(true));
    closeBtn?.addEventListener("click", () => setDrawerOpen(false));
    backdrop?.addEventListener("click", () => setDrawerOpen(false));

    drawer.querySelectorAll<HTMLAnchorElement>("[data-sidebar-link]").forEach((link) => {
      link.addEventListener("click", () => {
        drawer.dataset.open = "false";
        openBtn.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawer.dataset.open === "true") {
        setDrawerOpen(false);
      }
    });
  }
}
