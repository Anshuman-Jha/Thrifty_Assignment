"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function InvitePage() {
  const params = useParams();
  const token = String(params.token ?? "");
  const router = useRouter();
  const [info, setInfo] = useState<{
    workspace_name: string;
    email: string;
    expires_at: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/invites/${token}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Invalid invite");
        return;
      }
      setInfo(j);
    })();
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`);
        return;
      }
      const res = await fetch(`/api/invites/${token}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Could not accept invite");
        return;
      }
      router.push(`/workspace/${j.workspace_id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Workspace invite</h1>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="font-medium">{info.workspace_name}</p>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Invited email: <strong>{info.email}</strong>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Expires {new Date(info.expires_at).toLocaleString()}
          </p>
        </div>
      ) : !error ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : null}
      <button
        type="button"
        disabled={busy || !info}
        onClick={() => void accept()}
        className="rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Joining…" : "Accept invite"}
      </button>
      <Link href="/app" className="text-center text-sm text-zinc-500 underline">
        Back to dashboard
      </Link>
    </div>
  );
}
