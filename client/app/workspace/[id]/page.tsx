import { redirect } from "next/navigation";
import { byteaToBase64 } from "@/lib/bytea";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "./workspace-shell";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/workspace/${id}`)}`);
  }

  const { data: ws, error } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (error || !ws) {
    redirect("/app");
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("yjs_state")
    .eq("workspace_id", id)
    .maybeSingle();

  const initialYjs = doc?.yjs_state ? byteaToBase64(doc.yjs_state) : "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <WorkspaceShell
      workspaceId={id}
      title={ws.name}
      initialYjsBase64={initialYjs}
      userEmail={user.email ?? ""}
      displayName={profile?.display_name ?? user.email ?? "You"}
    />
  );
}
