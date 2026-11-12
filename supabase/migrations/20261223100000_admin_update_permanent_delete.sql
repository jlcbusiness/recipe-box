create function public.admin_update_delete(p_id uuid, p_revision integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_update public.app_updates%rowtype;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null then
    raise exception 'A valid update and revision are required.' using errcode = '22023';
  end if;

  select update_row.*
  into current_update
  from public.app_updates as update_row
  where update_row.id = p_id
  for update;
  if not found then
    raise exception 'Update not found.' using errcode = 'P0002';
  end if;
  if current_update.revision <> p_revision then
    raise exception 'This update changed in another session.' using errcode = 'PT409';
  end if;

  delete from public.admin_update_events
  where update_id = p_id;
  delete from public.app_updates
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function public.admin_update_delete(uuid, integer)
  from public, anon, service_role;
grant execute on function public.admin_update_delete(uuid, integer) to authenticated;
