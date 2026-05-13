import { NextResponse } from "next/server";
import { base64ToUint8 } from "@/lib/binary";
import { byteaToBase64 } from "@/lib/bytea";
import { sha256Hex } from "@/lib/hash";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function syncArtifactStaleness(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workspaceId: string,
  contentHash: string,
) {
  const { data: rows } = await supabase
    .from("ai_artifacts")
    .select("id, source_content_hash")
    .eq("workspace_id", workspaceId);

  const now = new Date().toISOString();
  for (const row of rows ?? []) {
    const stale = row.source_content_hash !== contentHash;
    await supabase
      .from("ai_artifacts")
      .update({ stale, updated_at: now })
      .eq("id", row.id);
  }
}

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
    .from("documents")
    .select("yjs_state, plain_text, content_hash, updated_at")
    .eq("workspace_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    yjs_state_base64: byteaToBase64(data.yjs_state),
    plain_text: data.plain_text ?? "",
    content_hash: data.content_hash ?? "",
    updated_at: data.updated_at,
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const b64 =
    typeof body?.yjs_state_base64 === "string" ? body.yjs_state_base64 : "";
  const plainText =
    typeof body?.plain_text === "string" ? body.plain_text : "";

  let buf: Buffer;
  try {
    buf = Buffer.from(base64ToUint8(b64));
  } catch {
    return NextResponse.json({ error: "Invalid yjs payload" }, { status: 400 });
  }

  const contentHash = sha256Hex(plainText);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("documents")
    .update({
      yjs_state: buf,
      plain_text: plainText,
      content_hash: contentHash,
      updated_at: now,
    })
    .eq("workspace_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("workspaces")
    .update({ updated_at: now })
    .eq("id", id);

  await syncArtifactStaleness(supabase, id, contentHash);

  return NextResponse.json({ ok: true, content_hash: contentHash });
}
