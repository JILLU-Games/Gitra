import { TriangleAlert } from "lucide-react";
import { Button } from "@/client/components/ui/button";

export type ErrorPageProps = {
  message?: string;
  stack?: string;
  owner?: string;
  repo?: string;
  refEnc?: string;
  path?: string;
};

export function ErrorPage({ message, stack, owner, repo, refEnc, path }: ErrorPageProps) {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-md border border-red-500/30 bg-red-500/10">
          <TriangleAlert className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
        </span>
        <div>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
            Error
          </span>
          <h1 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Something went wrong
          </h1>
          {message ? (
            <p className="m-0 mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          ) : null}
        </div>
      </div>
      {stack ? (
        <details className="rounded-md border border-zinc-200 bg-white p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer font-medium text-zinc-700 select-none dark:text-zinc-300">
            Stack trace
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {stack}
          </pre>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <Button href="/">Home</Button>
        {owner && repo ? (
          <Button variant="secondary" href={`/${owner}/${repo}`}>
            Repository
          </Button>
        ) : null}
        {owner && repo && refEnc ? (
          <Button
            variant="secondary"
            href={`/${owner}/${repo}/tree?ref=${refEnc}${path ? `&path=${encodeURIComponent(path)}` : ""}`}
          >
            Browse
          </Button>
        ) : null}
      </div>
    </div>
  );
}
