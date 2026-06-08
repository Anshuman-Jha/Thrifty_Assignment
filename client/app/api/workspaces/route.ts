import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWorkspacesForUser } from "@/lib/workspaces";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaces = await listWorkspacesForUser(supabase, user.id);
    return NextResponse.json({ workspaces });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list workspaces";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: newId, error: rpcErr } = await supabase.rpc("create_workspace", {
    p_name: name,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  if (typeof newId !== "string") {
    return NextResponse.json(
      { error: "create_workspace did not return an id — run migration 20250512000005_create_workspace_rpc.sql in Supabase SQL editor." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, created_at, updated_at")
    .eq("id", newId)
    .single();

  if (error) {
    return NextResponse.json({
      workspace: {
        id: newId,
        name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({ workspace: data });
}
