import { embedQuery, getOpenAI } from "@/lib/ai/openai";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return new Response(JSON.stringify({ error: "question required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(question);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Embed failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: matches, error: mErr } = await supabase.rpc("match_note_chunks", {
    p_workspace_id: id,
    p_query_embedding: toVectorLiteral(queryEmbedding),
    p_match_count: 10,
  });

  if (mErr) {
    return new Response(JSON.stringify({ error: mErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contextBlocks = (matches ?? [])
    .map(
      (m: { chunk_text: string; similarity?: number }, i: number) =>
        `[#${i + 1}] ${m.chunk_text}`,
    )
    .join("\n\n");

  const openai = getOpenAI();
  const stream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using ONLY the provided meeting note excerpts. If insufficient context, say what is missing. Reference excerpt numbers like [#1] when helpful.",
      },
      {
        role: "user",
        content: `Context excerpts:\n${contextBlocks || "(no indexed chunks — answer from general reasoning only if truly empty)"}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.2,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of stream) {
          const token = part.choices[0]?.delta?.content ?? "";
          if (token) controller.enqueue(encoder.encode(token));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(`\n[stream error: ${e instanceof Error ? e.message : "unknown"}]`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
