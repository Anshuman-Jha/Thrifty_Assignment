import OpenAI from "openai";
import { aiBundleSchema, type AiBundle } from "@/lib/ai/schemas";

const MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

export async function generateMeetingBundle(notes: string): Promise<AiBundle> {
  const openai = getOpenAI();
  const system = `You extract structured meeting intelligence from notes. Return ONLY valid JSON matching this shape:
{
  "summary": string (concise overview),
  "action_items": array of { "id": unique string id, "task", "owner": string|null, "priority": "low"|"medium"|"high"|"unknown", "due_date": ISO date string or null },
  "decisions": string[] (each a clear decision),
  "follow_up_email": { "subject", "body" } professional follow-up to attendees
}
Use "unknown" for owner or priority if not stated. Invent stable-looking ids for action items (e.g. ai_1, ai_2).`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Meeting notes:\n\n${notes.slice(0, 120_000)}`,
      },
    ],
    temperature: 0.3,
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty model response");
  const parsed = JSON.parse(raw) as unknown;
  return aiBundleSchema.parse(parsed);
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: inputs,
  });
  return res.data.map((d) => d.embedding as number[]);
}

export async function embedQuery(q: string): Promise<number[]> {
  const [v] = await embedTexts([q]);
  return v ?? [];
}
