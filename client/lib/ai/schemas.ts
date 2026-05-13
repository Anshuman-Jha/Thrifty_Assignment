import { z } from "zod";

export const actionItemSchema = z.object({
  id: z.string(),
  task: z.string(),
  owner: z.string().nullable(),
  priority: z.string(),
  due_date: z.string().nullable(),
});

export const aiBundleSchema = z.object({
  summary: z.string(),
  action_items: z.array(actionItemSchema),
  decisions: z.array(z.string()),
  follow_up_email: z.object({
    subject: z.string(),
    body: z.string(),
  }),
});

export type AiBundle = z.infer<typeof aiBundleSchema>;
export type ActionItem = z.infer<typeof actionItemSchema>;

export const artifactTypes = [
  "summary",
  "action_items",
  "decisions",
  "follow_up_email",
] as const;

export type ArtifactType = (typeof artifactTypes)[number];
