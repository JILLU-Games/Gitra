import { renderUiView } from "@/client/server/render";
import type { Viewer } from "@/client/server/viewer";
import { escapeHtml } from "@/shared/web/format";
import { isHttpError } from "@/shared/web/http";

function isRecordWithProperty<Key extends string>(
  value: unknown,
  key: Key
): value is Record<Key, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || "Unknown error";
  }
  if (typeof error === "string") {
    return error || "Unknown error";
  }
  if (isRecordWithProperty(error, "message") && typeof error.message === "string") {
    return error.message || "Unknown error";
  }
  if (error === undefined || error === null) {
    return "Unknown error";
  }
  return String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.stack === "string" && error.stack.length > 0) {
    return error.stack;
  }
  if (
    isRecordWithProperty(error, "stack") &&
    typeof error.stack === "string" &&
    error.stack.length > 0
  ) {
    return error.stack;
  }
  return undefined;
}

export function resolveErrorStatus(error: unknown): number {
  if (isHttpError(error)) {
    return error.status;
  }
  if (
    isRecordWithProperty(error, "status") &&
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
  ) {
    return error.status;
  }
  return /not found/i.test(getErrorMessage(error)) ? 404 : 500;
}

export function isGitReadMissError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /(ref not found|object not found|path not found|path not a directory|not a blob|not a tree|unsupported object)/i.test(
    message
  );
}

export function buildEscapedErrorHtmlDocument(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${safeTitle}</title>`,
    "</head>",
    '<body style="margin:0;background:#09090b;color:#f4f4f5;font-family:&quot;Segoe UI&quot;,-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif">',
    '<main style="max-width:40rem;margin:4rem auto;padding:1.25rem;border:1px solid #242429;border-radius:6px;background:#111114">',
    `<h1 style="margin:0 0 0.75rem;font-size:1.125rem;font-weight:600">${safeTitle}</h1>`,
    `<pre style="margin:0;white-space:pre-wrap;font-size:0.8125rem;color:#a1a1aa">${safeMessage}</pre>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

export async function handleError(
  env: Env,
  error: unknown,
  fallbackTitle: string,
  extra?: {
    owner?: string;
    repo?: string;
    refEnc?: string;
    path?: string;
    viewer?: Viewer | null;
  }
): Promise<Response> {
  const debug = String(env.LOG_LEVEL || "").toLowerCase() === "debug";
  const status = resolveErrorStatus(error);
  const message = getErrorMessage(error);
  const stack = debug ? getErrorStack(error) : undefined;

  try {
    const html = await renderUiView(
      env,
      "error",
      {
        title: fallbackTitle,
        message,
        owner: extra?.owner,
        repo: extra?.repo,
        refEnc: extra?.refEnc,
        path: extra?.path,
        stack,
      },
      { viewer: extra?.viewer ?? null }
    );
    if (html) {
      return new Response(html, {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }
  } catch {
    // Fall through to escaped standalone HTML error page when SSR itself fails.
  }

  return new Response(buildEscapedErrorHtmlDocument(fallbackTitle, message), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
