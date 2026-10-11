create or replace function private.recipe_tag_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if p_account_id is distinct from auth.uid()
    and auth.role() is distinct from 'service_role'
  then
    raise exception 'Recipe tags are not available to this account.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  ) into snapshot
  from public.recipe_tags as assignment
  join public.tags as tag
    on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
  where assignment.account_id = p_account_id and assignment.recipe_id = p_recipe_id;

  return snapshot;
end;
$$;

revoke all on function private.recipe_tag_snapshot(uuid, uuid) from public, anon;
grant execute on function private.recipe_tag_snapshot(uuid, uuid) to authenticated;