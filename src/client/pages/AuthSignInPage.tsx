import { ArrowRight, KeyRound, LogIn, ShieldCheck, User } from "lucide-react";

import { Button, Card, ErrorBanner, Input } from "@/client/components/ui";

export type AuthSignInPageProps = {
  errorCode?: string;
  demoMode?: boolean;
  demoUsername?: string;
  demoPassword?: string;
  demoUserUsername?: string;
  demoUserPassword?: string;
  nextPath?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_credentials: "Enter both a username and password to sign in.",
  invalid_credentials: "Invalid username or password. Check your credentials and try again.",
  account_disabled: "This account is disabled. Contact an administrator to restore access.",
  session_create_failed:
    "Could not start a session after sign-in. Try again, then check the worker logs if it persists.",
};

function describeError(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Sign-in failed. Try again.";
}

export function AuthSignInPage({
  errorCode,
  demoMode = false,
  demoUsername = "admin",
  demoPassword = "admin123",
  demoUserUsername = "alex-dev",
  demoUserPassword = "devuser123",
  nextPath,
}: AuthSignInPageProps) {
  const errorText = describeError(errorCode);

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12">
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h1 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Sign in
          </h1>
          <span
            className={
              demoMode
                ? "inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-700 dark:text-amber-300"
                : "inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
            }
          >
            {demoMode ? (
              <>
                <KeyRound className="h-3 w-3" aria-hidden="true" />
                Dev / Demo Mode
              </>
            ) : (
              <>
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Production Auth
              </>
            )}
          </span>
        </div>
        <p className="m-0 text-[13px] leading-5 text-zinc-600 dark:text-zinc-300">
          Team member &amp; Admin login — sign in with your username or{" "}
          <span className="font-mono text-zinc-800 dark:text-zinc-200">@handle</span> and password
          to access repositories and workspace settings.
        </p>
      </div>

      {errorText ? (
        <div className="mb-4">
          <ErrorBanner>{errorText}</ErrorBanner>
        </div>
      ) : null}

      <Card className="p-4 sm:p-5">
        <form method="post" action="/auth/login" className="grid gap-4">
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <Input
            label="Username or @handle"
            id="admin-username"
            name="username"
            type="text"
            autoComplete="username"
            autoFocus
            placeholder={demoMode ? demoUsername : "username or @handle"}
            required
          />
          <Input
            label="Password"
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            required
          />
          <Button type="submit" variant="primary" size="md" className="w-full">
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in
          </Button>
        </form>

        {demoMode ? (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-zinc-700 uppercase dark:text-zinc-300">
                Local Dev Quick Access
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                Disabled in production builds
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <form method="post" action="/auth/demo-login">
                {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
                <input type="hidden" name="account" value="admin" />
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Quick Demo Login
                </Button>
              </form>
              <form method="post" action="/auth/demo-login">
                <input type="hidden" name="next" value={nextPath ?? "/user/profile"} />
                <input type="hidden" name="account" value="user" />
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  Demo User Panel
                </Button>
              </form>
            </div>
            <div className="mt-2.5 grid gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700/80 dark:bg-zinc-800/45 dark:text-zinc-300">
              <p className="m-0 flex items-center justify-between gap-3">
                <span>Admin demo account</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                  {`${demoUsername} / ${demoPassword}`}
                </span>
              </p>
              <p className="m-0 flex items-center justify-between gap-3">
                <span>Test user (Users Panel)</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                  {`${demoUserUsername} / ${demoUserPassword}`}
                </span>
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Authenticated sessions use encrypted HttpOnly cookies backed by Cloudflare D1.
          </div>
        )}
      </Card>
    </div>
  );
}
