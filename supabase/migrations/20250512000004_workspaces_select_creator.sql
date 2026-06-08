-- Fix: INSERT workspace → trigger inserts workspace_members → INSERT policies on
-- workspace_members subquery workspaces, but workspaces_select_member required a
-- membership row first → "new row violates row-level security policy" on workspaces.
-- Allow creators to SELECT their own workspace rows without membership.

drop policy if exists "workspaces_select_creator" on public.workspaces;

create policy "workspaces_select_creator"
  on public.workspaces for select
  using (created_by = auth.uid());
