import { Search } from "lucide-react";
import { Button } from "@/client/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="inline-grid h-12 w-12 place-items-center rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <Search className="h-6 w-6 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
      </span>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          404
        </span>
        <h1 className="m-0 mb-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Not Found
        </h1>
        <p className="m-0 text-sm text-zinc-600 dark:text-zinc-400">
          The page you are looking for doesn't exist.
        </p>
      </div>
      <Button href="/">Go home</Button>
    </div>
  );
}
