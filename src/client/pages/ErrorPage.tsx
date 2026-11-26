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
    <div className="mx-auto max-w-lg space-y-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-grid h-10 w-10 place-items-center rounded-md border border-red-500/30 bg-red-500/10">
          <TriangleAlert className="h-5 w-5 text-red-400" aria-hidden="true" />
        </span>
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-red-400">
            Error
          </span>
          <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">
            Something went wrong
          </h1>
          {message ? <p className="m-0 mt-1.5 text-[13px] text-fgBody">{message}</p> : null}
        </div>
      </div>
      {stack ? (
        <details className="rounded-md border border-border bg-surface p-3.5 text-[12px]">
          <summary className="cursor-pointer font-medium text-fgBody select-none">
            Stack trace
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-canvas p-3 font-mono text-[11px] text-fg">
            {stack}
          </pre>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
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
