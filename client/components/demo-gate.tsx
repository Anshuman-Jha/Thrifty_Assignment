"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * When NEXT_PUBLIC_SKIP_AUTH=true, waits for an anonymous Supabase session so
 * RLS-backed data works without manual login.
 *
 * Supabase: Authentication → Providers → enable **Anonymous**.
 */
export function DemoGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const skip =
    typeof process.env.NEXT_PUBLIC_SKIP_AUTH === "string" &&
    process.env.NEXT_PUBLIC_SKIP_AUTH === "true";
  const [ready, setReady] = useState(!skip);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!skip) return;

    let cancelled = false;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        if (!cancelled) setReady(true);
        return;
      }

      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        if (!cancelled) {
          setError(
            `${anonErr.message} — In Supabase: Authentication → Providers → enable Anonymous.`,
          );
        }
        return;
      }

      router.refresh();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, skip]);

  if (!skip) {
    return <>{children}</>;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-8 text-center dark:bg-zinc-950">
        <p className="max-w-md text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Starting demo session…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
