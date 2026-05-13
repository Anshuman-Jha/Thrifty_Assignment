import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceListItem = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  document_updated_at: string;
  preview: string;
  has_stale_ai: boolean;
};

export async function listWorkspacesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkspaceListItem[]> {
  const { data: memberships, error: mErr } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);

  if (mErr) throw new Error(mErr.message);

  const ids = (memberships ?? []).map((m) => m.workspace_id);
  if (ids.length === 0) return [];

  const { data: workspaces, error: wErr } = await supabase
    .from("workspaces")
    .select("id, name, created_at, updated_at")
    .in("id", ids);

  if (wErr) throw new Error(wErr.message);

  const { data: docs } = await supabase
    .from("documents")
    .select("workspace_id, updated_at, plain_text, content_hash")
    .in("workspace_id", ids);

  const { data: arts } = await supabase
    .from("ai_artifacts")
    .select("workspace_id, stale")
    .in("workspace_id", ids);

  const docByWs = new Map(
    (docs ?? []).map((d) => [d.workspace_id, d]),
  );
  const staleByWs = new Map<string, boolean>();
  for (const a of arts ?? []) {
    if (a.stale) staleByWs.set(a.workspace_id, true);
  }

  const merged: WorkspaceListItem[] = (workspaces ?? []).map((w) => {
    const d = docByWs.get(w.id);
    return {
      id: w.id,
      name: w.name,
      created_at: w.created_at,
      updated_at: w.updated_at,
      document_updated_at: d?.updated_at ?? w.updated_at,
      preview: (d?.plain_text ?? "").slice(0, 180),
      has_stale_ai: staleByWs.get(w.id) ?? false,
    };
  });

  merged.sort(
    (a, b) =>
      new Date(b.document_updated_at).getTime() -
      new Date(a.document_updated_at).getTime(),
  );

  return merged;
}
