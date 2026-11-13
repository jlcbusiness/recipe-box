alter table public.recipes
  add column saved_from_public_id uuid;

-- Only an unambiguous protected source can be backfilled as direct-save identity.
alter table public.recipes disable trigger recipe_history_after_save;

with single_source as (
  select
    reference.account_id,
    reference.recipe_id,
    min(reference.source_public_id::text)::uuid as source_public_id
  from public.recipe_references as reference
  where reference.is_protected_source
  group by reference.account_id, reference.recipe_id
  having count(distinct reference.source_public_id) = 1
)
update public.recipes as recipe
set saved_from_public_id = single_source.source_public_id
from single_source
where recipe.account_id = single_source.account_id
  and recipe.id = single_source.recipe_id;

alter table public.recipes enable trigger recipe_history_after_save;

drop trigger recipe_references_guard_active_source_copy on public.recipe_references;
drop function private.prevent_duplicate_active_public_recipe_copy();
drop trigger recipes_guard_active_public_recipe_restore on public.recipes;
drop function private.prevent_duplicate_active_public_recipe_restore();

create unique index recipes_account_active_saved_from_public_id_key
  on public.recipes (account_id, saved_from_public_id)
  where saved_from_public_id is not null and trashed_at is null;

create function private.apply_recipe_saved_from_public_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_records jsonb;
  import_marker text;
begin
  if auth.role() = 'service_role'
    and current_setting('app.public_recipe_copy_context', true) = 'on'
  then
    new.saved_from_public_id :=
      nullif(current_setting('app.public_recipe_saved_from_public_id', true), '')::uuid;
    return new;
  end if;

  if auth.role() = 'service_role' then
    import_records := nullif(current_setting('app.database_import_recipes', true), '')::jsonb;
    if import_records is not null then
      select item.value->>'saved_from_public_id'
      into import_marker
      from jsonb_array_elements(import_records) as item(value)
      where item.value->>'id' = new.id::text;
      if found then
        new.saved_from_public_id := nullif(import_marker, '')::uuid;
        return new;
      end if;
    end if;
  end if;

  if (tg_op = 'INSERT' and new.saved_from_public_id is not null)
    or (
      tg_op = 'UPDATE'
      and new.saved_from_public_id is distinct from old.saved_from_public_id
    )
  then
    raise exception 'Direct-save identity can only be set by a trusted copy or import.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.apply_recipe_saved_from_public_id()
  from public, anon, authenticated;

create trigger recipes_apply_saved_from_public_id_before_save
  before insert or update on public.recipes
  for each row execute function private.apply_recipe_saved_from_public_id();

create function private.prevent_duplicate_active_direct_public_recipe_restore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.trashed_at is not distinct from new.trashed_at
    and old.saved_from_public_id is not distinct from new.saved_from_public_id
  then
    return new;
  end if;

  if new.saved_from_public_id is null or new.trashed_at is not null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.account_id::text || ':' || new.saved_from_public_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.recipes as existing_recipe
    where existing_recipe.account_id = new.account_id
      and existing_recipe.saved_from_public_id = new.saved_from_public_id
      and existing_recipe.trashed_at is null
      and existing_recipe.id is distinct from new.id
  ) then
    raise exception 'An active direct save of this public recipe already exists.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_duplicate_active_direct_public_recipe_restore()
  from public, anon, authenticated;

create trigger recipes_guard_active_direct_public_recipe_restore
  before insert or update on public.recipes
  for each row execute function private.prevent_duplicate_active_direct_public_recipe_restore();

do $$
declare
  target_function regprocedure :=
    'public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)'::regprocedure;
  function_definition text;
  old_lookup text := $old$
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
$old$;
  new_lookup text := $new$
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(destination_id::text || ':' || requested_source_public_id::text, 0)
  );

  select recipe.id into existing_recipe_id
  from public.recipes as recipe
  where recipe.account_id = destination_id
    and recipe.saved_from_public_id = requested_source_public_id
    and recipe.trashed_at is null;
$new$;
  old_context text := $old$
  perform pg_catalog.set_config('app.public_recipe_copy_context', 'on', true);
  select saved.id into copied_recipe_id
$old$;
  new_context text := $new$
  perform pg_catalog.set_config(
    'app.public_recipe_saved_from_public_id',
    requested_source_public_id::text,
    true
  );
  perform pg_catalog.set_config('app.public_recipe_copy_context', 'on', true);
  select saved.id into copied_recipe_id
$new$;
  lookup_count integer;
  context_count integer;
begin
  select pg_catalog.pg_get_functiondef(target_function)
  into function_definition;

  lookup_count :=
    (length(function_definition) - length(replace(function_definition, old_lookup, '')))
      / length(old_lookup);
  if lookup_count <> 1 then
    raise exception 'Expected exactly one direct-save lookup fragment.';
  end if;
  function_definition := replace(function_definition, old_lookup, new_lookup);

  context_count :=
    (length(function_definition) - length(replace(function_definition, old_context, '')))
      / length(old_context);
  if context_count <> 1 then
    raise exception 'Expected exactly one public-copy context fragment.';
  end if;
  execute replace(function_definition, old_context, new_context);
end;
$$;

create function public.commit_recipe_duplicate_with_media_sources(
  p_account_id uuid,
  p_source_recipe_id uuid,
  p_expected_source_version integer,
  p_destination_publication_id uuid,
  p_account_preferences jsonb,
  p_records jsonb,
  p_expected_versions jsonb,
  p_replace_recipe_ids uuid[],
  p_replace_publication_ids uuid[],
  p_media_sources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_version integer;
  source_is_active boolean;
  destination_is_active boolean;
  new_recipe jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if p_account_id is null or p_source_recipe_id is null
    or p_expected_source_version is null or p_expected_source_version < 1
    or p_destination_publication_id is null
    or jsonb_typeof(p_records) is distinct from 'object'
    or jsonb_typeof(p_records->'recipes') is distinct from 'array'
    or coalesce(
      jsonb_array_length(
        case
          when jsonb_typeof(p_records->'recipes') = 'array' then p_records->'recipes'
          else '[]'::jsonb
        end
      ),
      0
    ) <> 1
  then
    raise exception 'The recipe duplicate request is invalid.' using errcode = '23514';
  end if;

  new_recipe := p_records->'recipes'->0;
  if jsonb_typeof(new_recipe) is distinct from 'object' then
    raise exception 'The recipe duplicate data is invalid.' using errcode = '23514';
  end if;
  if new_recipe->>'id' is null
    or new_recipe->>'id' = p_source_recipe_id::text
    or nullif(pg_catalog.btrim(new_recipe->>'name'), '') is null
    or new_recipe->>'publication_id' is distinct from p_destination_publication_id::text
    or new_recipe->'is_private' is distinct from 'true'::jsonb
    or nullif(new_recipe->>'saved_from_public_id', '') is not null
  then
    raise exception 'The recipe duplicate data is invalid.' using errcode = '23514';
  end if;

  select recipe.version, recipe.trashed_at is null
  into source_version, source_is_active
  from public.recipes as recipe
  where recipe.account_id = p_account_id
    and recipe.id = p_source_recipe_id
  for update;
  if not found or source_is_active is not true then
    raise exception 'The source recipe is unavailable.' using errcode = 'P0002';
  end if;
  if source_version <> p_expected_source_version then
    raise exception 'The source recipe changed before it could be copied.'
      using errcode = 'PT409';
  end if;

  select publication.trashed_at is null
  into destination_is_active
  from public.publications as publication
  where publication.account_id = p_account_id
    and publication.id = p_destination_publication_id
  for share;
  if not found or destination_is_active is not true then
    raise exception 'The destination publication is unavailable.' using errcode = 'P0002';
  end if;

  return public.commit_database_import_with_media_sources(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids,
    p_media_sources
  );
end;
$$;

revoke all on function public.commit_recipe_duplicate_with_media_sources(
  uuid, uuid, integer, uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.commit_recipe_duplicate_with_media_sources(
  uuid, uuid, integer, uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) to service_role;

notify pgrst, 'reload schema';
