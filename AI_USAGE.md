# AI usage (Collab Notes AI)

This document describes how AI is used in the assignment implementation, where to look in code, and deliberate tradeoffs.

## Models

- **Chat (default):** `gpt-4o-mini` via `OPENAI_CHAT_MODEL` (see [`client/lib/ai/openai.ts`](client/lib/ai/openai.ts)).
- **Embeddings (default):** `text-embedding-3-small` (1536 dimensions) via `OPENAI_EMBED_MODEL`, aligned with the `vector(1536)` column in [`supabase/migrations/20250512000000_initial_schema.sql`](supabase/migrations/20250512000000_initial_schema.sql).

## Meeting intelligence (structured JSON)

- **Entry point:** [`client/app/api/workspaces/[id]/ai/run/route.ts`](client/app/api/workspaces/[id]/ai/run/route.ts) calls `generateMeetingBundle()` which requests **`response_format: { type: "json_object" }`** and validates with Zod in [`client/lib/ai/schemas.ts`](client/lib/ai/schemas.ts).
- **Persisted outputs:** one row per workspace per `artifact_type` in `ai_artifacts` (`summary`, `action_items`, `decisions`, `follow_up_email`).
- **Grounding text:** server reads `documents.plain_text` (maintained by the editor save path) so AI always runs on the latest saved plaintext snapshot.

## Staleness and document hash

- Each document save updates `documents.content_hash` = **SHA-256 of `plain_text`** (see [`client/lib/hash.ts`](client/lib/hash.ts) and document PUT handler).
- Each AI run stores `ai_artifacts.source_content_hash` to the hash at generation time.
- On save, [`syncArtifactStaleness`](client/app/api/workspaces/[id]/document/route.ts) sets `stale` when `source_content_hash !==` the current document hash (and clears staleness if the user edits back to the same hash).

## Selective regeneration and editable outputs

- **Regenerate one tab:** [`client/app/api/workspaces/[id]/ai/regenerate/route.ts`](client/app/api/workspaces/[id]/ai/regenerate/route.ts) calls `regenerateArtifact()` in [`client/lib/ai/regenerate.ts`](client/lib/ai/regenerate.ts), sending both **current notes** and **current JSON** for that artifact so the model can preserve user edits when reasonable (especially stable `id` fields on tasks).
- **Manual edits:** [`PATCH /api/workspaces/[id]/artifacts`](client/app/api/workspaces/[id]/artifacts/route.ts) updates `data` without resetting `source_content_hash` / staleness logic unless the document hash drifted (staleness is driven by notes hash, not manual JSON edits).

## Ask mode (RAG)

- **Indexing:** [`POST /api/workspaces/[id]/index`](client/app/api/workspaces/[id]/index/route.ts) deletes prior `note_chunks`, splits plaintext into overlapping windows (~900 chars, ~120 overlap), embeds batches, and inserts rows with `embedding` as a pgvector literal string.
- **Retrieval:** [`POST /api/workspaces/[id]/ask`](client/app/api/workspaces/[id]/ask/route.ts) embeds the question and calls Supabase RPC **`match_note_chunks`** (member-gated in [`20250512000001_match_chunks_auth.sql`](supabase/migrations/20250512000001_match_chunks_auth.sql)).
- **Answer:** OpenAI chat completion with **streaming** plain text to the client.

## Realtime collaboration (non-AI)

- **Yjs + Tiptap** merge concurrent edits locally; **Supabase Realtime broadcast** propagates Yjs binary updates between clients on channel `yjs:{workspaceId}` (see [`client/components/collaborative-editor.tsx`](client/components/collaborative-editor.tsx)).
- **Persistence:** debounced `PUT` saves full Yjs state (`bytea`) plus plaintext for hashing/AI/RAG.

## Tradeoffs and known limits

- **Broadcast payload size:** very large single updates could hit Realtime message limits; typical meeting notes stay well below.
- **Plaintext derivation:** `editor.getText()` is used for AI/RAG; rich structure (headings/lists) is preserved in Yjs/Tiptap but not in a semantic tree for retrieval.
- **Invite email delivery:** invites are **link-based** (copy URL); no transactional email integration.
- **Embedding insert format:** relies on PostgREST accepting bracketed vector literals; if your Supabase version differs, adjust insert format or use an RPC.

## Cost and latency tips

- Use `gpt-4o-mini` for development; upgrade only for demos if needed.
- Indexing runs **debounced ~4s after typing stops** from the editor client to limit embedding spend.
