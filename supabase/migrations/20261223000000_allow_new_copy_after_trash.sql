drop index public.recipe_references_account_source_public_id_key;

create index recipe_references_account_source_public_id_idx
  on public.recipe_references (account_id, source_public_id)
  where is_protected_source;

create function private.prevent_duplicate_active_public_recipe_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_active boolean;
begin
  if not new.is_protected_source or new.source_public_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.account_id::text || ':' || new.source_public_id::text, 0)
  );

  select recipe.trashed_at is null
  into target_is_active
  from public.recipes as recipe
  where recipe.account_id = new.account_id
    and recipe.id = new.recipe_id;

  if target_is_active is not true then
    return new;
  end if;

  if exists (
    select 1
    from public.recipe_references as existing_reference
    join public.recipes as existing_recipe
      on existing_recipe.account_id = existing_reference.account_id
      and existing_recipe.id = existing_reference.recipe_id
    where existing_reference.account_id = new.account_id
      and existing_reference.source_public_id = new.source_public_id
      and existing_reference.is_protected_source
      and existing_reference.id is distinct from new.id
      and existing_recipe.trashed_at is null
  ) then
    raise exception 'An active copy of this public recipe already exists.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_duplicate_active_public_recipe_copy()
  from public, anon, authenticated;

create trigger recipe_references_guard_active_source_copy
  before insert or update of account_id, recipe_id, is_protected_source, source_public_id
  on public.recipe_references
  for each row execute function private.prevent_duplicate_active_public_recipe_copy();

create function private.prevent_duplicate_active_public_recipe_restore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_source_id uuid;
begin
  if old.trashed_at is not distinct from new.trashed_at then
    return new;
  end if;

  for protected_source_id in
    select distinct reference.source_public_id
    from public.recipe_references as reference
    where reference.account_id = new.account_id
      and reference.recipe_id = new.id
      and reference.is_protected_source
    order by reference.source_public_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.account_id::text || ':' || protected_source_id::text, 0)
    );

    if new.trashed_at is null and exists (
      select 1
      from public.recipe_references as existing_reference
      join public.recipes as existing_recipe
        on existing_recipe.account_id = existing_reference.account_id
        and existing_recipe.id = existing_reference.recipe_id
      where existing_reference.account_id = new.account_id
        and existing_reference.source_public_id = protected_source_id
        and existing_reference.is_protected_source
        and existing_reference.recipe_id <> new.id
        and existing_recipe.trashed_at is null
    ) then
      raise exception 'An active copy of this public recipe already exists.'
        using errcode = '23505';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.prevent_duplicate_active_public_recipe_restore()
  from public, anon, authenticated;

create trigger recipes_guard_active_public_recipe_restore
  before update of trashed_at on public.recipes
  for each row execute function private.prevent_duplicate_active_public_recipe_restore();

do $$
declare
  target_function regprocedure :=
    'public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)'::regprocedure;
  function_definition text;
  old_fragment text := $old$
  select reference.recipe_id into existing_recipe_id
  from public.recipe_references as reference
  where reference.account_id = destination_id
    and reference.source_public_id = requested_source_public_id
    and reference.is_protected_source;
$old$;
  new_fragment text := $new$
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(destination_id::text || ':' || requested_source_public_id::text, 0)
  );

  select reference.recipe_id into existing_recipe_id
  from public.recipe_references as reference
  join public.recipes as existing_recipe
    on existing_recipe.account_id = reference.account_id
    and existing_recipe.id = reference.recipe_id
  where reference.account_id = destination_id
    and reference.source_public_id = requested_source_public_id
    and reference.is_protected_source
    and existing_recipe.trashed_at is null;
$new$;
  occurrence_count integer;
begin
  select pg_catalog.pg_get_functiondef(target_function)
  into function_definition;

  occurrence_count :=
    (length(function_definition) - length(replace(function_definition, old_fragment, '')))
      / length(old_fragment);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one saved-copy lookup fragment.';
  end if;

  execute replace(function_definition, old_fragment, new_fragment);
end;
$$;

notify pgrst, 'reload schema';
