"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, LogOut, UserPlus } from "lucide-react";
import { AiPanel } from "@/components/ai-panel";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Props = {
  workspaceId: string;
  title: string;
  initialYjsBase64: string;
  userEmail: string;
  displayName: string;
};

export function WorkspaceShell({
  workspaceId,
  title,
  initialYjsBase64,
  userEmail,
  displayName,
}: Props) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const signOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const createInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteLink(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Invite failed");
        return;
      }
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setInviteLink(`${origin}/invite/${j.invite.token}`);
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        >
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">
          {title}
        </h1>
        <span className="hidden text-xs text-zinc-500 sm:inline">
          {displayName}
          {userEmail ? ` · ${userEmail}` : ""}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col gap-3">
          <CollaborativeEditor
            workspaceId={workspaceId}
            initialYjsBase64={initialYjsBase64}
          />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="mb-2 flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100">
              <UserPlus className="size-4" />
              Invite collaborator
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              Creates a link (7-day expiry). The invitee must sign in with the
              same email you enter.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                disabled={inviteBusy}
                onClick={() => void createInvite()}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {inviteBusy ? "…" : "Create link"}
              </button>
            </div>
            {inviteLink ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-2 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                <div className="mb-1 font-medium">Copy invite URL</div>
                <code className="block break-all">{inviteLink}</code>
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-h-[420px] lg:min-h-0">
          <AiPanel workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
