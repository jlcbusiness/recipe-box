create or replace function public.guard_recipe_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_actor_reference_cleanup boolean :=
    pg_catalog.pg_trigger_depth() > 1
    and old.trashed_at is not null
    and old.trashed_at is not distinct from new.trashed_at
    and old.trashed_by_user_id is not null
    and new.trashed_by_user_id is null
    and (to_jsonb(old) - 'trashed_by_user_id' - 'updated_at')
      is not distinct from (to_jsonb(new) - 'trashed_by_user_id' - 'updated_at');
begin
  if current_setting('app.recipe_lifecycle_context', true) is distinct from 'on'
    and (
      (old.trashed_at is not null and not is_actor_reference_cleanup)
      or old.trashed_at is distinct from new.trashed_at
      or (
        old.trashed_by_user_id is distinct from new.trashed_by_user_id
        and not is_actor_reference_cleanup
      )
    )
  then
    raise exception 'Recipe lifecycle changes require an authorized lifecycle action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;