import { Search } from "lucide-react";
import { Button } from "@/client/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3.5 py-14 text-center">
      <span className="inline-grid h-10 w-10 place-items-center rounded-md border border-border bg-surface">
        <Search className="h-5 w-5 text-fgMuted" aria-hidden="true" />
      </span>
      <div>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
          404
        </span>
        <h1 className="m-0 mb-1.5 text-[18px] font-semibold tracking-tight text-fg">Not Found</h1>
        <p className="m-0 text-[13px] text-fgBody">The page you are looking for doesn't exist.</p>
      </div>
      <Button href="/">Go home</Button>
    </div>
  );
}
