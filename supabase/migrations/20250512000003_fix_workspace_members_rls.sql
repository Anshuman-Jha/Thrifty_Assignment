-- Fix infinite recursion on workspace_members RLS (policies must not SELECT the same table).
-- Run after 00000 if you already applied the old policies. Safe to re-run.

drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
drop policy if exists "workspace_members_select_own" on public.workspace_members;

create policy "workspace_members_select_own"
  on public.workspace_members for select
  using (user_id = auth.uid());

drop policy if exists "workspace_members_insert_owner" on public.workspace_members;

create policy "workspace_members_insert_owner"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.created_by = auth.uid()
    )
  );
