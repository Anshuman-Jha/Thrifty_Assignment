"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { WorkspaceListItem } from "@/lib/workspaces";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function DashboardClient({
  initialWorkspaces,
}: {
  initialWorkspaces: WorkspaceListItem[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(s));
  }, [workspaces, q]);

  const refresh = () => {
    router.refresh();
  };

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Could not create workspace");
        return;
      }
      setName("");
      setWorkspaces((prev) => [
        {
          id: j.workspace.id,
          name: j.workspace.name,
          created_at: j.workspace.created_at,
          updated_at: j.workspace.updated_at,
          document_updated_at: j.workspace.updated_at,
          preview: "",
          has_stale_ai: false,
        },
        ...prev,
      ]);
      router.push(`/workspace/${j.workspace.id}`);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this workspace and all notes?")) return;
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Delete failed");
      return;
    }
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    refresh();
  };

  const signOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Collaborative meeting notes with AI summaries and tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Sign out
        </button>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="text-sm font-medium">New workspace</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sprint planning — May 12"
            className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => void create()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search meetings…"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        />
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
            No workspaces match your search.
          </li>
        ) : (
          filtered.map((w) => (
            <li
              key={w.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/workspace/${w.id}`}
                    className="truncate text-base font-semibold text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {w.name}
                  </Link>
                  {w.has_stale_ai ? (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
                      Stale AI
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                  {w.preview || "No notes yet"}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Updated{" "}
                  {new Date(w.document_updated_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/workspace/${w.id}`}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(w.id)}
                  className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:hover:bg-red-950/40 dark:hover:text-red-200"
                  title="Delete workspace"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
