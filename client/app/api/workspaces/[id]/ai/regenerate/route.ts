import { NextResponse } from "next/server";
import { regenerateArtifact } from "@/lib/ai/regenerate";
import { sha256Hex } from "@/lib/hash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ArtifactType } from "@/lib/ai/schemas";
import { artifactTypes } from "@/lib/ai/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const t = body?.artifact_type as string | undefined;
  if (!t || !artifactTypes.includes(t as ArtifactType)) {
    return NextResponse.json({ error: "Invalid artifact_type" }, { status: 400 });
  }
  const artifactType = t as ArtifactType;

  const { data: doc, error: dErr } = await supabase
    .from("documents")
    .select("plain_text, content_hash")
    .eq("workspace_id", id)
    .single();

  if (dErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const notes = doc.plain_text ?? "";
  const { data: existing } = await supabase
    .from("ai_artifacts")
    .select("data")
    .eq("workspace_id", id)
    .eq("artifact_type", artifactType)
    .maybeSingle();

  const currentData =
    existing?.data ??
    (artifactType === "summary"
      ? { text: "" }
      : artifactType === "action_items"
        ? { items: [] }
        : artifactType === "decisions"
          ? { items: [] }
          : { subject: "", body: "" });

  let nextData: unknown;
  try {
    nextData = await regenerateArtifact({
      notes,
      artifactType,
      currentData,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const sourceHash = doc.content_hash || sha256Hex(notes);
  const now = new Date().toISOString();

  const { error: uErr } = await supabase.from("ai_artifacts").upsert(
    {
      workspace_id: id,
      artifact_type: artifactType,
      data: nextData as object,
      source_content_hash: sourceHash,
      stale: false,
      updated_at: now,
    },
    { onConflict: "workspace_id,artifact_type" },
  );

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: nextData });
}
