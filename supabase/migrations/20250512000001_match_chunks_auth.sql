-- Harden match_note_chunks (member gate) and idempotent profile trigger.
-- Requires 20250512000000_initial_schema.sql applied first.

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
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
    )
  order by nc.embedding <=> p_query_embedding
  limit p_match_count;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set display_name = excluded.display_name
  where profiles.display_name is distinct from excluded.display_name;
  return new;
end;
$$;
