import { ArrowRight, LogIn, User } from "lucide-react";

import { Button, Card, ErrorBanner, Input, PageHeader } from "@/client/components/ui";

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
  demoMode = true,
  demoUsername = "admin",
  demoPassword = "admin123",
  demoUserUsername = "alex-dev",
  demoUserPassword = "devuser123",
  nextPath,
}: AuthSignInPageProps) {
  const errorText = describeError(errorCode);

  return (
    <div className="mx-auto max-w-md py-10 sm:py-14">
      <PageHeader className="!mb-5">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Sign in
          </h1>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Sign in with your username or <span className="font-mono">@handle</span> and password to
            access repositories and account settings.
          </p>
        </div>
      </PageHeader>

      {errorText ? (
        <div className="mb-5">
          <ErrorBanner>{errorText}</ErrorBanner>
        </div>
      ) : null}

      <Card>
        <form method="post" action="/auth/login" className="grid gap-5">
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <Input
            label="Username"
            id="admin-username"
            name="username"
            type="text"
            autoComplete="username"
            autoFocus
            placeholder={demoUsername}
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
          <>
            <div className="my-6 border-t border-zinc-200 dark:border-zinc-800/70" />
            <div className="grid gap-2.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <form method="post" action="/auth/demo-login">
                  {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
                  <input type="hidden" name="account" value="admin" />
                  <Button type="submit" variant="secondary" size="md" className="w-full">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    Quick Demo Login
                  </Button>
                </form>
                <form method="post" action="/auth/demo-login">
                  <input type="hidden" name="next" value={nextPath ?? "/user/profile"} />
                  <input type="hidden" name="account" value="user" />
                  <Button type="submit" variant="secondary" size="md" className="w-full">
                    <User className="h-4 w-4" aria-hidden="true" />
                    Demo User Panel
                  </Button>
                </form>
              </div>
              <div className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <p className="m-0 flex items-center justify-between gap-3">
                  <span>Admin demo account</span>
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {`${demoUsername} / ${demoPassword}`}
                  </span>
                </p>
                <p className="m-0 flex items-center justify-between gap-3">
                  <span>Test user (Users Panel)</span>
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {`${demoUserUsername} / ${demoUserPassword}`}
                  </span>
                </p>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
