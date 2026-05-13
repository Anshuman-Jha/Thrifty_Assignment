-- Owners may delete a workspace (cascades to members, documents, etc.)
-- Safe to re-run.

drop policy if exists "workspaces_delete_owner" on public.workspaces;

create policy "workspaces_delete_owner"
  on public.workspaces for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );
