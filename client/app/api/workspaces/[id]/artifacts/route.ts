import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ai_artifacts")
    .select("artifact_type, data, source_content_hash, stale, updated_at")
    .eq("workspace_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ artifacts: data ?? [] });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const artifactType = body?.artifact_type as string | undefined;
  const data = body?.data;
  if (!artifactType || data === undefined) {
    return NextResponse.json(
      { error: "artifact_type and data required" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("ai_artifacts")
    .select("source_content_hash, stale")
    .eq("workspace_id", id)
    .eq("artifact_type", artifactType)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const { error } = await supabase
      .from("ai_artifacts")
      .update({ data, updated_at: now })
      .eq("workspace_id", id)
      .eq("artifact_type", artifactType);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("ai_artifacts").insert({
      workspace_id: id,
      artifact_type: artifactType,
      data,
      source_content_hash: "",
      stale: true,
      updated_at: now,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
