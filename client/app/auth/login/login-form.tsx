"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Login with your email and password.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-500">
        No account?{" "}
        <Link
          href="/auth/signup"
          className="font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
