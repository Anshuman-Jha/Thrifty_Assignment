"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() || undefined },
          emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`,
        },
      });
      if (err) {
        setError(err.message);
        return;
      }
      router.push("/app");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create an account to get started.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Display name (optional)
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
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
            autoComplete="new-password"
            required
            minLength={6}
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
          {busy ? "Creating…" : "Sign up"}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Sign in
        </Link>
      </p>
    </div>
  );
}
