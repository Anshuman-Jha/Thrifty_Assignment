-- Collaborative AI workspace schema + RLS
-- Run in Supabase SQL editor (full file) or via supabase db push.
-- Then run 20250512000001_match_chunks_auth.sql and 20250512000002_workspace_delete_owner.sql in order.

create extension if not exists "vector";

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- Workspaces (table only first — policies below reference workspace_members)
-- -----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_created_by_idx on public.workspaces (created_by);

-- -----------------------------------------------------------------------------
-- Workspace members (must exist before workspaces SELECT/UPDATE policies)
-- -----------------------------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

alter table public.workspace_members enable row level security;

create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_insert_owner"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id and w.created_by = auth.uid()
    )
  );

create policy "workspace_members_insert_creator"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.created_by = auth.uid()
        and workspace_members.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Workspaces RLS (after workspace_members exists)
-- -----------------------------------------------------------------------------
alter table public.workspaces enable row level security;

create policy "workspaces_select_member"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
    )
  );

create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (auth.uid() = created_by);

create policy "workspaces_update_member"
  on public.workspaces for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Invites
-- -----------------------------------------------------------------------------
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_token_idx on public.workspace_invites (token);

alter table public.workspace_invites enable row level security;

create policy "workspace_invites_select_member"
  on public.workspace_invites for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "workspace_invites_insert_member"
  on public.workspace_invites for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id and wm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Documents (Yjs snapshot + derived plain text / hash)
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  yjs_state bytea not null default '\x'::bytea,
  plain_text text not null default '',
  content_hash text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_select_member"
  on public.documents for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = documents.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "documents_write_member"
  on public.documents for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = documents.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "documents_update_member"
  on public.documents for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = documents.workspace_id and wm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- AI artifacts
-- -----------------------------------------------------------------------------
create table if not exists public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  artifact_type text not null check (artifact_type in ('summary', 'action_items', 'decisions', 'follow_up_email')),
  data jsonb not null default '{}'::jsonb,
  source_content_hash text not null default '',
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, artifact_type)
);

create index if not exists ai_artifacts_workspace_idx on public.ai_artifacts (workspace_id);

alter table public.ai_artifacts enable row level security;

create policy "ai_artifacts_select_member"
  on public.ai_artifacts for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_artifacts.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "ai_artifacts_write_member"
  on public.ai_artifacts for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_artifacts.workspace_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_artifacts.workspace_id and wm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Note chunks (RAG)
-- -----------------------------------------------------------------------------
create table if not exists public.note_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists note_chunks_workspace_idx on public.note_chunks (workspace_id);

alter table public.note_chunks enable row level security;

create policy "note_chunks_select_member"
  on public.note_chunks for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = note_chunks.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "note_chunks_write_member"
  on public.note_chunks for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = note_chunks.workspace_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = note_chunks.workspace_id and wm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RPC: vector match (member check added in migration 00001)
-- -----------------------------------------------------------------------------
create or replace function public.match_note_chunks (
  p_workspace_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 8
)
returns table (id uuid, chunk_text text, similarity float)
language sql
stable
as $$
  select nc.id, nc.chunk_text,
    1 - (nc.embedding <=> p_query_embedding) as similarity
  from public.note_chunks nc
  where nc.workspace_id = p_workspace_id
    and nc.embedding is not null
  order by nc.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_note_chunks(uuid, vector, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Auth: auto-create profile
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Workspaces: auto owner row + empty document (security definer — bypasses RLS)
-- -----------------------------------------------------------------------------
create or replace function public.after_workspace_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.documents (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_workspace_created on public.workspaces;
create trigger trg_workspace_created
  after insert on public.workspaces
  for each row execute function public.after_workspace_created();
