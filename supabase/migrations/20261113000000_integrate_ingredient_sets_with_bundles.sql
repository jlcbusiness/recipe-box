create or replace function private.create_default_recipe_ingredient_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.database_import_context', true) = 'on' then
    return new;
  end if;
  insert into public.recipe_ingredient_sets (account_id, recipe_id, label, position)
  values (new.account_id, new.id, 'Main', 0);
  return new;
end;
$$;

grant select on public.recipe_ingredient_sets to service_role;

create function private.capture_recipe_ingredient_sets_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_sets jsonb;
begin
  if current_setting('app.recipe_ingredient_set_save_context', true) = 'on' then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ingredient_set.id,
    'label', ingredient_set.label,
    'position', ingredient_set.position
  ) order by ingredient_set.position), '[]'::jsonb)
  into before_sets
  from public.recipe_ingredient_sets as ingredient_set
  where ingredient_set.account_id = old.account_id
    and ingredient_set.recipe_id = old.id;
  perform pg_catalog.set_config('app.recipe_ingredient_sets_before', before_sets::text, true);
  return new;
end;
$$;

revoke all on function private.capture_recipe_ingredient_sets_before()
  from public, anon, authenticated;

create trigger recipes_capture_ingredient_sets_before
  before update on public.recipes
  for each row execute function private.capture_recipe_ingredient_sets_before();

create function private.apply_database_import_recipe_ingredient_sets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_data jsonb;
  imported_sets jsonb;
begin
  if current_setting('app.database_import_context', true) is distinct from 'on' then
    return new;
  end if;
  imported_sets := nullif(
    current_setting('app.database_import_ingredient_sets', true), ''
  )::jsonb;
  if jsonb_typeof(imported_sets) is distinct from 'array' then
    raise exception 'The import plan is missing ingredient sets.' using errcode = '23514';
  end if;

  update public.recipe_ingredient_sets as existing
  set label = substr(md5(existing.id::text || txid_current()::text), 1, 32)
  where existing.account_id = new.account_id
    and existing.recipe_id = new.id;

  for set_data in
    select item.value
    from jsonb_array_elements(imported_sets) as item(value)
    where item.value->>'recipe_id' = new.id::text
  loop
    insert into public.recipe_ingredient_sets (account_id, recipe_id, id, label, position)
    values (
      new.account_id,
      new.id,
      (set_data->>'id')::uuid,
      btrim(set_data->>'label'),
      (set_data->>'position')::integer
    )
    on conflict (account_id, recipe_id, id)
    do update set label = excluded.label, position = excluded.position;
  end loop;

  delete from public.recipe_ingredient_sets as existing
  where existing.account_id = new.account_id
    and existing.recipe_id = new.id
    and not exists (
      select 1
      from jsonb_array_elements(imported_sets) as submitted(value)
      where submitted.value->>'id' = existing.id::text
    )
    and not exists (
      select 1
      from public.recipe_ingredients as ingredient
      where ingredient.account_id = existing.account_id
        and ingredient.recipe_id = existing.recipe_id
        and ingredient.ingredient_set_id = existing.id
    );
  return new;
end;
$$;

revoke all on function private.apply_database_import_recipe_ingredient_sets()
  from public, anon, authenticated;

create trigger recipes_apply_database_import_ingredient_sets
  after insert or update on public.recipes
  for each row execute function private.apply_database_import_recipe_ingredient_sets();

create or replace function private.assign_default_recipe_ingredient_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  imported_set_id uuid;
begin
  if current_setting('app.database_import_context', true) = 'on' then
    select nullif(ingredient->>'ingredient_set_id', '')::uuid
    into imported_set_id
    from jsonb_array_elements(
      nullif(current_setting('app.database_import_recipe_ingredients', true), '')::jsonb
    ) as item(ingredient)
    where ingredient->>'recipe_id' = new.recipe_id::text
      and (ingredient->>'position')::integer = new.position;
    new.ingredient_set_id := imported_set_id;
  end if;

  if current_setting('app.recipe_ingredient_set_save_context', true) = 'on' then
    select nullif(row_data->>'ingredient_set_id', '')::uuid
    into new.ingredient_set_id
    from jsonb_array_elements(
      nullif(current_setting('app.recipe_ingredient_set_save_rows', true), '')::jsonb
    ) with ordinality as item(row_data, row_position)
    where item.row_position - 1 = new.position;
  end if;

  if new.ingredient_set_id is null then
    select ingredient_set.id into new.ingredient_set_id
    from public.recipe_ingredient_sets as ingredient_set
    where ingredient_set.account_id = new.account_id
      and ingredient_set.recipe_id = new.recipe_id
      and ingredient_set.label = 'Main';
  end if;
  if new.ingredient_set_id is null then
    raise exception 'A recipe ingredient set is required.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.prune_database_import_recipe_ingredient_sets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := coalesce(new.account_id, old.account_id);
  recipe_key uuid := coalesce(new.recipe_id, old.recipe_id);
  imported_sets jsonb;
begin
  if current_setting('app.database_import_context', true) is distinct from 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  imported_sets := nullif(
    current_setting('app.database_import_ingredient_sets', true), ''
  )::jsonb;
  delete from public.recipe_ingredient_sets as existing
  where existing.account_id = owner_id
    and existing.recipe_id = recipe_key
    and not exists (
      select 1
      from jsonb_array_elements(imported_sets) as submitted(value)
      where submitted.value->>'id' = existing.id::text
    )
    and not exists (
      select 1
      from public.recipe_ingredients as ingredient
      where ingredient.account_id = existing.account_id
        and ingredient.recipe_id = existing.recipe_id
        and ingredient.ingredient_set_id = existing.id
    );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prune_database_import_recipe_ingredient_sets()
  from public, anon, authenticated;

create trigger recipe_ingredients_prune_imported_sets
  after insert or delete on public.recipe_ingredients
  for each row execute function private.prune_database_import_recipe_ingredient_sets();

alter function public.read_export_snapshot(uuid)
  rename to read_export_snapshot_without_ingredient_sets;

create function public.read_export_snapshot(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  snapshot := public.read_export_snapshot_without_ingredient_sets(p_account_id);
  if snapshot is null then
    return null;
  end if;
  return jsonb_set(
    snapshot,
    '{records,recipe_ingredient_sets}',
    coalesce((
      select jsonb_agg(to_jsonb(record_row))
      from public.recipe_ingredient_sets as record_row
      where record_row.account_id = p_account_id
    ), '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function public.read_export_snapshot_without_ingredient_sets(uuid)
  from public, anon, authenticated;
grant execute on function public.read_export_snapshot_without_ingredient_sets(uuid)
  to service_role;
revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;

alter function public.commit_database_import(uuid, jsonb, jsonb, jsonb, uuid[], uuid[])
  rename to commit_database_import_without_ingredient_sets;

create function public.commit_database_import(
  p_account_id uuid,
  p_account_preferences jsonb,
  p_records jsonb,
  p_expected_versions jsonb,
  p_replace_recipe_ids uuid[],
  p_replace_publication_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_records->'recipe_ingredient_sets') is distinct from 'array' then
    raise exception 'The import plan is missing ingredient sets.' using errcode = '23514';
  end if;
  perform pg_catalog.set_config(
    'app.database_import_ingredient_sets',
    (p_records->'recipe_ingredient_sets')::text,
    true
  );
  return public.commit_database_import_without_ingredient_sets(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids
  );
end;
$$;

revoke all on function public.commit_database_import_without_ingredient_sets(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) from public, anon, authenticated;
grant execute on function public.commit_database_import_without_ingredient_sets(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) to service_role;
revoke all on function public.commit_database_import(uuid, jsonb, jsonb, jsonb, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.commit_database_import(uuid, jsonb, jsonb, jsonb, uuid[], uuid[])
  to service_role;

notify pgrst, 'reload schema';