import { NextResponse } from "next/server";
import { bundleToArtifacts } from "@/lib/ai/regenerate";
import { generateMeetingBundle } from "@/lib/ai/openai";
import { sha256Hex } from "@/lib/hash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ArtifactType } from "@/lib/ai/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: doc, error: dErr } = await supabase
    .from("documents")
    .select("plain_text, content_hash")
    .eq("workspace_id", id)
    .single();

  if (dErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const notes = doc.plain_text ?? "";
  if (!notes.trim()) {
    return NextResponse.json(
      { error: "Add meeting notes before running AI." },
      { status: 400 },
    );
  }

  let bundle;
  try {
    bundle = await generateMeetingBundle(notes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const sourceHash = doc.content_hash || sha256Hex(notes);
  const artifacts = bundleToArtifacts(bundle);
  const now = new Date().toISOString();

  const rows = (Object.keys(artifacts) as ArtifactType[]).map((artifact_type) => ({
    workspace_id: id,
    artifact_type,
    data: artifacts[artifact_type] as object,
    source_content_hash: sourceHash,
    stale: false,
    updated_at: now,
  }));

  const { error: uErr } = await supabase.from("ai_artifacts").upsert(rows, {
    onConflict: "workspace_id,artifact_type",
  });

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source_content_hash: sourceHash });
}
