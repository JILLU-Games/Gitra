import type { ReactNode } from "react";

import { Footer } from "@/client/components/footer";
import { Header } from "@/client/components/header";
import type { Viewer } from "@/client/server/viewer";
import type { SiteBrandingConfig } from "@/shared/branding";

type AppLayoutProps = {
  children: ReactNode;
  currentView?: string;
  viewer?: Viewer | null;
  branding?: SiteBrandingConfig;
  origin?: string;
};

export function AppLayout({ children, currentView, viewer, branding, origin }: AppLayoutProps) {
  const isFullBleedHome = currentView === "home" || currentView === "explore";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-fg"
      >
        Skip to content
      </a>
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header
          currentView={currentView}
          viewer={viewer ?? null}
          branding={branding}
          origin={origin}
        />
        {isFullBleedHome ? (
          <div id="main-content" className="flex flex-1 flex-col w-full min-w-0">
            {children}
          </div>
        ) : (
          <main
            id="main-content"
            className="mx-auto w-full max-w-[1160px] min-w-0 flex-1 px-5 py-6"
          >
            {children}
          </main>
        )}
        <Footer branding={branding} />
      </div>
    </>
  );
}
