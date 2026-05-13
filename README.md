# Thrifty Assignment — Collaborative AI Workspace

Full-stack **Next.js 16** app in [`client/`](client/) with **Supabase** (Auth, Postgres, Row Level Security, Realtime broadcast, **pgvector**), **Yjs + Tiptap** collaborative editing, and **OpenAI** for structured meeting intelligence plus grounded Ask mode.

## Quick start

1. **Create a Supabase project** and run SQL migrations **in filename order** from [`supabase/migrations/`](supabase/migrations/) (`20250512000000` → `00001` → `00002`). Paste each file whole into the SQL editor and run. If a previous failed run left half-created objects, use a fresh Supabase project or drop the affected `public.*` objects before re-running `00000`.
2. Enable **pgvector** (included in first migration).
3. In Supabase **Auth → URL configuration**, add your site URL and redirect: `http://localhost:3000/auth/callback` (and production URL when deployed).
4. For local demos, consider **disabling email confirmation** in Auth settings so sign-up is immediate.
5. Copy [`client/.env.example`](client/.env.example) to `client/.env.local` and fill values.
6. From `client/`: `npm install` then `npm run dev`.

## Deploy (Vercel + Supabase)

- Deploy the **`client`** directory (or monorepo root with Root Directory = `client` on Vercel).
- Set the same environment variables in Vercel as in `.env.local`.
- Use a production Supabase URL and keys; never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser (server-only).

## Repository layout

| Path | Purpose |
|------|---------|
| `client/` | Next.js application |
| `supabase/migrations/` | Schema, RLS, triggers, `match_note_chunks` RPC |
| [`AI_USAGE.md`](AI_USAGE.md) | Models, prompts, embeddings, tradeoffs |
| [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) | Suggested demo video flow |

## Scripts (in `client/`)

- `npm run dev` — local development
- `npm run build` / `npm start` — production build

## License

Private assignment repository.
