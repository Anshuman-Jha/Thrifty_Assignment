import { z } from "zod";
import { getOpenAI } from "@/lib/ai/openai";
import type { AiBundle, ArtifactType } from "@/lib/ai/schemas";

const MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

type RegenerateInput = {
  notes: string;
  artifactType: ArtifactType;
  currentData: unknown;
};

export async function regenerateArtifact({
  notes,
  artifactType,
  currentData,
}: RegenerateInput): Promise<unknown> {
  const openai = getOpenAI();
  const system = `You update ONE section of meeting outputs. Preserve user-edited wording where it does not contradict the notes. If notes clearly override an item, follow the notes.
Return ONLY JSON for the requested section shape:
- summary: { "text": string }
- action_items: { "items": Array<{ "id": string, "task": string, "owner": string|null, "priority": string, "due_date": string|null }> } — reuse the same "id" values from the previous items when the task is still valid; only add new ids for genuinely new tasks.
- decisions: { "items": string[] }
- follow_up_email: { "subject": string, "body": string }`;

  const user = JSON.stringify({
    artifactType,
    previous: currentData,
    notes: notes.slice(0, 120_000),
  });

  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.25,
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty model response");
  const obj = JSON.parse(raw) as Record<string, unknown>;

  if (artifactType === "summary") {
    return z.object({ text: z.string() }).parse(obj);
  }
  if (artifactType === "action_items") {
    return z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            task: z.string(),
            owner: z.string().nullable(),
            priority: z.string(),
            due_date: z.string().nullable(),
          }),
        ),
      })
      .parse(obj);
  }
  if (artifactType === "decisions") {
    return z.object({ items: z.array(z.string()) }).parse(obj);
  }
  if (artifactType === "follow_up_email") {
    return z
      .object({ subject: z.string(), body: z.string() })
      .parse(obj);
  }
  throw new Error("Unknown artifact type");
}

export function bundleToArtifacts(
  bundle: AiBundle,
): Record<ArtifactType, unknown> {
  return {
    summary: { text: bundle.summary },
    action_items: { items: bundle.action_items },
    decisions: { items: bundle.decisions },
    follow_up_email: bundle.follow_up_email,
  };
}
