import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const admin = createAdminSupabaseClient();
  const { data: inv, error } = await admin
    .from("workspace_invites")
    .select("id, workspace_id, email, role, expires_at, workspaces(name)")
    .eq("token", token)
    .maybeSingle();

  if (error || !inv) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const ws = inv.workspaces as { name?: string } | null;
  return NextResponse.json({
    workspace_name: ws?.name ?? "Workspace",
    email: inv.email,
    expires_at: inv.expires_at,
  });
}

export async function POST(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: inv, error: iErr } = await admin
    .from("workspace_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (iErr || !inv) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  const email = (user.email ?? "").toLowerCase();
  if (email && inv.email.toLowerCase() !== email) {
    return NextResponse.json(
      { error: "Signed in as a different email than the invite." },
      { status: 403 },
    );
  }

  const { error: mErr } = await admin.from("workspace_members").upsert(
    {
      workspace_id: inv.workspace_id,
      user_id: user.id,
      role: inv.role ?? "editor",
    },
    { onConflict: "workspace_id,user_id" },
  );

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  await admin.from("workspace_invites").delete().eq("id", inv.id);

  return NextResponse.json({ ok: true, workspace_id: inv.workspace_id });
}
