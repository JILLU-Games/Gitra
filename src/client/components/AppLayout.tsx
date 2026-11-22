import type { ReactNode } from "react";

import { Footer } from "@/client/components/footer";
import { Header } from "@/client/components/header";
import type { Viewer } from "@/client/server/viewer";

type AppLayoutProps = {
  children: ReactNode;
  currentView?: string;
  viewer?: Viewer | null;
};

export function AppLayout({ children, currentView, viewer }: AppLayoutProps) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-md focus:border focus:border-accent-500 focus:bg-zinc-900 focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header currentView={currentView} viewer={viewer ?? null} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
        >
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
}
