# Collab Notes AI (client)

Next.js app — see the [repository README](../README.md) for setup and deployment.

## Local

```bash
cp .env.example .env.local
# fill env vars
npm install
npm run dev
```

## Key routes

- `/app` — workspace dashboard (search, create, delete)
- `/workspace/[id]` — collaborative editor + AI panel + invites
- `/invite/[token]` — accept workspace invite

## Tech

Next.js App Router, Supabase Auth + RLS, Yjs + Tiptap, OpenAI (structured JSON + streaming + embeddings), pgvector RPC `match_note_chunks`.
