-- Reliable workspace creation: SECURITY DEFINER RPC bypasses RLS on INSERT so the
-- AFTER INSERT trigger can add workspace_members + documents without PostgREST
-- "new row violates row-level security policy for table workspaces" edge cases.
-- Run in SQL editor if create workspace still fails after 00004.

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if trim(p_name) = '' then
    raise exception 'name required';
  end if;

  insert into public.workspaces (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.create_workspace(text) to authenticated;
