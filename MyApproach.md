# My approach — thought process & tradeoffs

This document is for **hiring reviewers**: why the system is shaped the way it is, what I optimized for, and what I would revisit with more time or different constraints. It complements the feature-oriented [`README.md`](README.md) and the implementation notes in [`AI_USAGE.md`](AI_USAGE.md).

**Under the hood (how to read this doc):** Each section below pairs **product/architecture intent** with a short **mechanics** note—what actually runs on the wire or in Postgres—so you can map jargon (RLS, CRDT, RAG) to concrete behavior without rereading the whole codebase.

---

## 1. What I was optimizing for

| Priority | What it means in practice |
|----------|---------------------------|
| **Clarity for review** | One deployable app (`client/`), obvious boundaries (Route Handlers = “backend”), migrations you can paste into Supabase in order. |
| **Real multi-user semantics** | Workspace isolation, membership, and **Row Level Security (RLS)** so authorization is not only enforced in TypeScript. |
| **Honest collaboration** | Real-time editing with a **CRDT** (Yjs), not “last write wins” on a textarea. |
| **Honest AI** | Structured outputs validated on the server, **staleness** when notes change, **RAG** for Ask mode instead of pretending the model “just knows” the doc. |
| **Pragmatic scope** | No separate microservices unless the assignment demanded it; ship a coherent vertical slice. |

**Under the hood:** **RLS** means every query carries an implicit `WHERE` derived from policies—authorization lives in the database engine, not only in your API layer. A **CRDT** is a data structure with commutative merge rules so two offline edits converge to one state without a central “lock.” **RAG** (retrieval-augmented generation) means the model’s context window is filled with *retrieved excerpts* from your data (here: vector-similar chunks), then it answers—reducing confabulation versus “prompt only.” **Staleness** ties UI truth to a **content hash**: same bytes → same hash → artifact still “about” that snapshot; any edit changes the hash → UI can warn before you trust old AI output.

---

## 2. Big architectural choice: Next.js + Supabase, no standalone API server

**Choice:** A single **Next.js** application (App Router) where the UI and **Route Handlers** (`app/api/...`) live together, talking to **Supabase** (Postgres, Auth, Realtime) and **OpenAI** only from the server.

**Why**

- **Operational simplicity:** One repo, one Vercel (or similar) project, one set of env vars. Reviewers can run `npm run dev` and apply SQL without orchestrating three services.
- **Security default:** OpenAI keys and the Supabase **service role** key never ship to the browser. The browser uses the **anon** key + user session; privileged operations stay in Route Handlers or SQL.
- **RLS stays meaningful:** Most reads/writes use a **server Supabase client** created from the user’s cookies, so PostgREST queries run **as that user** and policies apply consistently.

**Tradeoffs**

| Upside | Downside |
|--------|----------|
| Fast to build and deploy | Route Handlers are not a full “domain layer”; logic grows in `app/api` unless you extract libs (I used `lib/` for AI, hashing, workspaces). |
| Great fit for Supabase | Cold starts and serverless timeouts matter for very long AI jobs (mitigated with streaming and bounded prompts). |
| Clear story for “where is the backend?” | If the product grew into a large org, you might split a dedicated BFF or worker queue later—not needed for this scope. |

**Alternative I considered:** Express/Fastify + separate SPA. **Rejected for this assignment** because it doubles deployment and auth cookie plumbing without adding unique product value for the rubric.

**Under the hood:** Supabase exposes **PostgREST**: HTTP `GET/POST/PATCH` on `/rest/v1/...` is translated to SQL with the **JWT’s role and claims** attached to the DB session (`request.jwt.claims` → `auth.uid()` in policies). The **anon** key only ever proves “I am allowed to talk to the API”; **who you are** comes from the **user JWT** (refresh token in cookie, access token short-lived). Route Handlers run on the **server** (Node runtime where configured), so they can hold **secrets**, stream responses, and forward cookies to Supabase. That is why “same repo” still respects a classic **three-tier boundary**: browser = presentation + public keys; server handlers = orchestration + secrets; Postgres = persistence + authorization rules.

---

## 3. Authorization: RLS first, with two deliberate “escapes”

**Principle:** If a user should not see a row, **Postgres** should not return it—even if someone mis-wires a client or calls an API with a guessed UUID. That is why almost every table has RLS and policies keyed off `auth.uid()` and membership.

**Escape 1 — `SECURITY DEFINER` RPC (`create_workspace`)**

Creating the first workspace row interacts awkwardly with triggers and membership: you can hit **chicken-and-egg** and PostgREST **INSERT + RETURNING** edge cases under strict RLS. Rather than weakening `workspaces` INSERT policies for everyone, I added a **narrow, audited function** that:

- Runs as the definer (bypasses RLS *inside* the function body for that insert).
- Still checks **`auth.uid()`** and validates input before inserting.

So: **RLS everywhere by default**, **one blessed path** for bootstrap writes. That is a standard Supabase pattern.

**Escape 2 — Service role for invite token lookup**

Invite acceptance must read a row keyed by an **unguessable token** before the user is necessarily a member. RLS for `workspace_invites` would either block legitimate flows or become overly permissive. I use the **service role only** in the invite Route Handler ([`client/lib/supabase/admin.ts`](client/lib/supabase/admin.ts), [`client/app/api/invites/[token]/route.ts`](client/app/api/invites/[token]/route.ts)) and keep the surface area small (token lookup + controlled membership insert after validation).

**Tradeoff:** Service role is powerful; any bug there is high impact. Mitigation: minimal queries, validate token/expiry, then use normal user client where possible for subsequent operations.

**RLS lesson learned:** An early `workspace_members` policy that **selected from the same table** caused **infinite recursion**. The fix ([`20250512000003_fix_workspace_members_rls.sql`](supabase/migrations/20250512000003_fix_workspace_members_rls.sql)) was to express membership visibility in a way that does not self-join the protected table in a circular policy. This is the kind of issue you catch when you treat RLS as real code, not boilerplate.

**Under the hood:** When RLS is **on**, Postgres evaluates **USING** (for read/update/delete visibility) and **WITH CHECK** (for insert/update row payloads) expressions per policy. **`auth.uid()`** reads the current session’s user id from the JWT claim Supabase sets. **`SECURITY DEFINER`** switches the **effective user** for *statements inside the function* to the **function owner** (typically a superuser-capable role), so RLS is **not applied** to those inner statements—unless the function re-enables it—while **`auth.uid()` still reflects the caller’s JWT**, so you can keep “only logged-in users” and “set `created_by` to me” semantics. The **service role** JWT bypasses RLS entirely for the whole request: use it like `sudo`—short, audited, never in the browser. **Policy recursion** happens when evaluating policy A requires reading the same table, which re-triggers policy A; breaking the cycle means simpler predicates (e.g. “user can see rows where `user_id = auth.uid()`”) or helper tables/functions designed not to loop.

---

## 4. Collaboration: Yjs + Tiptap + two channels (Realtime + HTTP)

**Choice:** **Yjs** for the document model (conflict-free merges), **Tiptap** for rich editing, **Supabase Realtime broadcast** for low-latency peer updates, and **HTTP PUT** to persist **Yjs state + plain text** to Postgres on a debounce.

**Why two channels?**

| Channel | Role |
|---------|------|
| **Broadcast** | Fast, ephemeral sync between live tabs/users. |
| **HTTP + Postgres** | Durable source of truth for reload, AI input, embeddings, and audits. |

**Tradeoffs**

- **Pros:** True concurrent editing; refresh does not lose the doc; AI always runs on saved plaintext/hash.
- **Cons:** More moving parts than “only WebSocket” or “only polling.” Broadcast has **payload size** limits; huge single edits could be problematic (acceptable for meeting notes).
- **Plaintext for AI/RAG:** Derived from the editor (`getText()`-style). Rich structure lives in Yjs/Tiptap but **retrieval is not a semantic HTML tree**—a deliberate simplification; see [`AI_USAGE.md`](AI_USAGE.md).

**Alternative:** Liveblocks / Partykit / dedicated collab server. **Rejected here** to avoid vendor lock-in and extra accounts for reviewers; Yjs + Supabase is enough to demonstrate the concept.

**Under the hood:** **Yjs** stores the document as a replicated structure; each keystroke produces **small binary updates** (awareness + document ops) that can be **ordered and merged** so two editors converge. **Tiptap** binds that shared Yjs type to ProseMirror’s editor state. **Broadcast** here is *not* claiming the DB row is updated every keystroke—it is a **fan-out pub/sub** for live peers. **Debounced PUT** batches work: fewer writes, smaller bill, and a stable snapshot for **hashing** and **embeddings**. On reload, the client **hydrates Yjs from the saved blob** (bytea) so the CRDT state is restored, not reconstructed by replaying chat history.

---

## 5. AI design: structure, staleness, regeneration, RAG

**Structured “meeting bundle”**

- Model returns **JSON**; the server validates with **Zod** before persisting. That avoids “half a JSON blob” in the database and gives predictable UI binding.

**Staleness**

- Each save hashes **plain text** (`content_hash`). Artifacts store **`source_content_hash`**. When notes change, artifacts flip to **stale** so the UI does not imply the summary is still about the current meeting.

**Selective regenerate**

- Regenerating one tab sends **current notes + current artifact JSON** so the model can **preserve user edits** where reasonable (e.g. stable ids on tasks). That is better UX than blind full regen.

**Ask mode (RAG)**

- Chunk notes, **embed**, store in **pgvector**, retrieve via an RPC **`match_note_chunks`** with **member checks** in SQL ([`20250512000001_match_chunks_auth.sql`](supabase/migrations/20250512000001_match_chunks_auth.sql)). Answer is **streamed** from the server.

**Tradeoffs**

| Decision | Tradeoff |
|----------|----------|
| Re-index on a debounce | Cost/latency vs freshness; configurable balance. |
| pgvector + simple chunking | Good demo; production might add hybrid search, reranking, metadata filters. |
| gpt-4o-mini default | Cheap and fast; quality ceiling lower than flagship models for edge cases. |

**Under the hood:** **Structured outputs** use the API’s JSON mode so the completion is parseable; **Zod** parses *at runtime* and strips unknown fields—this is your contract between “messy LLM” and “typed DB row.” **SHA-256** on plaintext gives a deterministic **fingerprint** of the meeting body; comparing artifact `source_content_hash` to live `content_hash` is O(1) and avoids diffing prose in app code. **Regenerate** is a second inference pass with **extra conditioning**: prior JSON becomes soft constraints so the model can do **merge-style** updates rather than replace-everything. **Embeddings** map text chunks to **high-dimensional vectors**; **pgvector** stores them and supports **distance operators** (e.g. cosine `<=>`); the **RPC** runs retrieval **in SQL** so the same membership rules gate which chunks are even visible to the similarity search. **Streaming** sends tokens (or chunks) down the HTTP response as they are generated—lower perceived latency and no single huge JSON timeout for long answers.

---

## 6. Recruiter / demo mode

**Choice:** Optional **`NEXT_PUBLIC_SKIP_AUTH`** plus Supabase **Anonymous** sign-in so a reviewer can land in the app without typing credentials.

**Tradeoff:** Must be **off** for a serious production launch; anonymous sessions have different abuse and quota implications. Documented in README and env example so it is an explicit knob, not a hidden bypass.

**Under the hood:** `NEXT_PUBLIC_*` vars are **inlined into client bundles**—safe only for **non-secrets** (feature flags, Supabase URL, anon key). **Anonymous auth** still produces a **real Supabase user id** (`auth.uid()` is non-null); it is a *low-friction identity*, not “no auth.” Middleware can branch on the flag to **skip redirect-to-login** while the client or a small bootstrap routine establishes an anonymous session so RLS-aware queries still have a subject.

---

## 7. What I would improve with more time

- **Observability:** Structured logging, request ids, and basic metrics around AI and index routes.
- **Tests:** Integration tests for RLS (Supabase local) and API contracts; unit tests for Zod schemas and hash/stale helpers.
- **Collaboration scale:** Presence, cursors, and conflict UX polish; optional compaction strategy for Yjs persistence.
- **Email:** Real invite emails via Resend/SendGrid instead of copy-paste links only.
- **Stricter admin boundaries:** Rotate audit of every `createAdminSupabaseClient()` call site.

**Under the hood:** **Observability** means you can answer “which user hit which policy / which OpenAI call failed” from logs, not from reproducing locally. **RLS integration tests** typically spin **Postgres + pgTAP or Supabase test client**, swap JWTs, and assert `select`/`insert` outcomes—because policies are code. **Yjs compaction** matters when update vectors grow; you periodically **merge history** into a snapshot format to shrink payloads. **Email invites** are another async **delivery channel** with their own failure modes (bounces, spam), hence a provider abstraction in mature products.

---

## 8. How to read this repo in 5 minutes (for reviewers)

1. **Migrations** — [`supabase/migrations/`](supabase/migrations/): schema, RLS, RPCs (including `create_workspace` and `match_note_chunks`).
2. **API surface** — [`client/app/api/`](client/app/api/): workspaces, document save, AI run/regenerate, artifacts PATCH, index, ask, invites.
3. **Editor** — [`client/components/collaborative-editor.tsx`](client/components/collaborative-editor.tsx): Yjs + Realtime + debounced save.
4. **AI logic** — [`client/lib/ai/`](client/lib/ai/): OpenAI wrapper, schemas, regenerate helpers.

**Under the hood:** Read **migrations first** if you care about *why the app behaves* (policies are the contract). **Route Handlers** are thin **orchestrators**: parse body → call Supabase as user → call OpenAI → write results → return JSON/stream. **`collaborative-editor`** is where **network + state** meet: subscribe to broadcast, apply Yjs updates, schedule saves. **`lib/ai`** keeps **vendor-specific** and **schema-specific** code out of route files so you can test parsing without HTTP.

---

## 9. Summary sentence

I treated **Supabase + RLS** as the authority for who can see what, used **Yjs + Realtime** for real collaboration with **Postgres** as the durable backbone, and used **Route Handlers** as a thin, reviewable backend for **structured AI**, **staleness**, and **grounded Ask**—accepting operational simplicity of a monolith over distributed complexity, and documenting the few **intentional privileged paths** (RPC bootstrap, service role for invites) so they stay narrow and justified.

**Under the hood (one picture):** Browser holds **UI + editor state**; server holds **secrets and orchestration**; Postgres holds **data + RLS + vectors**; Realtime carries **ephemeral CRDT deltas**; HTTP carries **durable snapshots** and **AI side effects**. Anything that breaks that separation (e.g. service role in the client) would be an architectural regression, not a shortcut.
