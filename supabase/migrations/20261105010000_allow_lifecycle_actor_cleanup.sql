create or replace function public.guard_recipe_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_actor_reference_cleanup boolean :=
    session_user = 'supabase_auth_admin'
    and old.trashed_at is not null
    and old.trashed_at is not distinct from new.trashed_at
    and old.trashed_by_user_id is not null
    and new.trashed_by_user_id is null
    and old.publication_trash_id is not distinct from new.publication_trash_id
    and old.publication_trash_previous_page is not distinct from new.publication_trash_previous_page
    and old.publication_trash_previous_url is not distinct from new.publication_trash_previous_url;
begin
  if current_setting('app.recipe_lifecycle_context', true) is distinct from 'on'
    and not is_actor_reference_cleanup
    and (
      old.trashed_at is not null
      or old.trashed_at is distinct from new.trashed_at
      or old.trashed_by_user_id is distinct from new.trashed_by_user_id
      or old.publication_trash_id is distinct from new.publication_trash_id
      or old.publication_trash_previous_page is distinct from new.publication_trash_previous_page
      or old.publication_trash_previous_url is distinct from new.publication_trash_previous_url
    )
  then
    raise exception 'Recipe lifecycle changes require an authorized lifecycle action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;