import { NextResponse } from "next/server";
import { embedTexts } from "@/lib/ai/openai";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const CHUNK = 900;
const CHUNK_OVERLAP = 120;

function chunkText(text: string): { index: number; text: string }[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const out: { index: number; text: string }[] = [];
  let start = 0;
  let idx = 0;
  while (start < t.length) {
    const end = Math.min(t.length, start + CHUNK);
    out.push({ index: idx++, text: t.slice(start, end) });
    if (end >= t.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return out;
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

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
    .select("plain_text")
    .eq("workspace_id", id)
    .single();

  if (dErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const plain = doc.plain_text ?? "";
  const chunks = chunkText(plain);

  await supabase.from("note_chunks").delete().eq("workspace_id", id);

  if (chunks.length === 0) {
    return NextResponse.json({ ok: true, chunks: 0 });
  }

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks.map((c) => c.text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Embedding failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const rows = chunks.map((c, i) => ({
    workspace_id: id,
    chunk_index: c.index,
    chunk_text: c.text,
    embedding: toVectorLiteral(embeddings[i] ?? []),
  }));

  const { error: insErr } = await supabase.from("note_chunks").insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chunks: rows.length });
}
