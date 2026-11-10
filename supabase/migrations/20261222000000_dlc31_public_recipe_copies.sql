alter table public.recipe_references
  add column is_protected_source boolean not null default false,
  add column source_public_id uuid,
  add constraint recipe_references_protected_source_metadata_check check (
    (
      is_protected_source
      and source_public_id is not null
      and reference_type = 'external_url'
      and publication_id is null
      and linked_recipe_id is null
    )
    or (not is_protected_source and source_public_id is null)
  );

create unique index recipe_references_account_source_public_id_key
  on public.recipe_references (account_id, source_public_id)
  where is_protected_source;

create function private.prevent_protected_source_reference_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_protected_source and exists (
    select 1
    from public.recipes as recipe
    where recipe.account_id = old.account_id and recipe.id = old.recipe_id
  ) then
    raise exception 'Protected source attribution cannot be changed while its recipe exists.'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_protected_source_reference_mutation()
  from public, anon, authenticated;

create trigger recipe_references_protect_source_attribution
  before update or delete on public.recipe_references
  for each row execute function private.prevent_protected_source_reference_mutation();

do $$
declare
  target_function regprocedure :=
    'public.save_recipe_with_publication(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,uuid[],uuid[],uuid[],jsonb,jsonb,uuid,text,text,jsonb)'::regprocedure;
  function_definition text := pg_get_functiondef(target_function);
  old_delete text := $old$
  delete from public.recipe_references as recipe_reference
  where recipe_reference.account_id = owner_id and recipe_reference.recipe_id = saved_id;
$old$;
  new_delete text := $new$
  delete from public.recipe_references as recipe_reference
  where recipe_reference.account_id = owner_id
    and recipe_reference.recipe_id = saved_id
    and not recipe_reference.is_protected_source;
$new$;
  old_references text := $old$
  entry_position := 0;

  for entry in
    select item.value from jsonb_array_elements(p_recipe_relationships->'references')
      with ordinality as item(value, ordinal) order by item.ordinal
  loop
    reference_kind := entry->>'reference_type';
    target_id := nullif(entry->>'publication_id', '')::uuid;
    entry_url := nullif(trim(entry->>'url'), '');
    entry_text := nullif(trim(entry->>'display_text'), '');
    if reference_kind = 'publication' then
      select publication.name into entry_text
      from public.publications as publication
      where publication.account_id = owner_id and publication.id = target_id;
    elsif reference_kind = 'external_url' then
      entry_text := entry_url;
    end if;
    entry_id := coalesce(nullif(entry->>'id', '')::uuid, gen_random_uuid());
    insert into public.recipe_references (
      id, account_id, recipe_id, reference_type, publication_id, display_text, url, position
    ) values (
      entry_id, owner_id, saved_id, reference_kind, target_id, entry_text, entry_url, entry_position
    );
    entry_position := entry_position + 1;
  end loop;
$old$;
  new_references text := $new$
  select coalesce(max(recipe_reference.position) + 1, 0)
  into entry_position
  from public.recipe_references as recipe_reference
  where recipe_reference.account_id = owner_id
    and recipe_reference.recipe_id = saved_id
    and recipe_reference.is_protected_source;

  for entry in
    select item.value from jsonb_array_elements(p_recipe_relationships->'references')
      with ordinality as item(value, ordinal) order by item.ordinal
  loop
    entry_source_is_protected := coalesce((entry->>'is_protected_source')::boolean, false);
    entry_source_public_id := nullif(entry->>'source_public_id', '')::uuid;
    if entry_source_is_protected and (
      auth.role() is distinct from 'service_role'
      or current_setting('app.public_recipe_copy_context', true) is distinct from 'on'
    ) then
      if exists (
        select 1 from public.recipe_references as recipe_reference
        where recipe_reference.account_id = owner_id
          and recipe_reference.recipe_id = saved_id
          and recipe_reference.is_protected_source
          and recipe_reference.source_public_id = entry_source_public_id
      ) then
        continue;
      end if;
      raise exception 'Protected source attribution can only be created by a public recipe copy.'
        using errcode = '23514';
    end if;

    reference_kind := entry->>'reference_type';
    target_id := nullif(entry->>'publication_id', '')::uuid;
    entry_url := nullif(trim(entry->>'url'), '');
    entry_text := nullif(trim(entry->>'display_text'), '');
    if entry_source_is_protected then
      if entry_source_public_id is null or reference_kind <> 'external_url' then
        raise exception 'Protected source attribution is invalid.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.recipe_references as recipe_reference
        where recipe_reference.account_id = owner_id
          and recipe_reference.recipe_id = saved_id
          and recipe_reference.is_protected_source
          and recipe_reference.source_public_id = entry_source_public_id
      ) then
        continue;
      end if;
    elsif entry ? 'source_public_id' and entry->'source_public_id' <> 'null'::jsonb then
      raise exception 'Editable references cannot contain protected source identity.'
        using errcode = '23514';
    end if;
    if reference_kind = 'publication' then
      select publication.name into entry_text
      from public.publications as publication
      where publication.account_id = owner_id and publication.id = target_id;
    elsif reference_kind = 'external_url' then
      entry_text := coalesce(entry_text, entry_url);
    end if;
    entry_id := coalesce(nullif(entry->>'id', '')::uuid, gen_random_uuid());
    insert into public.recipe_references (
      id, account_id, recipe_id, reference_type, publication_id, display_text, url, position,
      is_protected_source, source_public_id
    ) values (
      entry_id, owner_id, saved_id, reference_kind, target_id, entry_text, entry_url, entry_position,
      entry_source_is_protected, case when entry_source_is_protected then entry_source_public_id end
    );
    entry_position := entry_position + 1;
  end loop;
$new$;
  occurrence_count integer;
begin
  if position(old_delete in function_definition) = 0
    or position(old_references in function_definition) = 0 then
    raise exception 'The active recipe reference save function has changed.';
  end if;
  occurrence_count :=
    (length(function_definition) - length(replace(function_definition, old_delete, '')))
      / length(old_delete);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one recipe reference delete fragment.';
  end if;
  function_definition := replace(function_definition, old_delete, new_delete);
  occurrence_count :=
    (length(function_definition) - length(replace(function_definition, old_references, '')))
      / length(old_references);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one recipe reference insert fragment.';
  end if;
  function_definition := replace(function_definition, old_references, new_references);

  if position('entry_source_is_protected boolean' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '  entry_text text;',
      '  entry_text text;' || E'\n' ||
      '  entry_source_is_protected boolean;' || E'\n' ||
      '  entry_source_public_id uuid;'
    );
  end if;
  if position('entry_source_is_protected boolean' in function_definition) = 0 then
    raise exception 'Could not add protected source state to the recipe save function.';
  end if;
  execute function_definition;
end;
$$;

do $$
declare
  target_function regprocedure :=
    'public.save_recipe_with_publication(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,uuid[],uuid[],uuid[],jsonb,jsonb,uuid,text,text,jsonb)'::regprocedure;
  function_definition text := pg_get_functiondef(target_function);
  old_reference_fields text := $old$
      where fields.key not in ('id', 'reference_type', 'display_text', 'publication_id', 'url')
$old$;
  new_reference_fields text := $new$
      where fields.key not in (
        'id', 'reference_type', 'display_text', 'linked_recipe_id', 'publication_id', 'url',
        'is_protected_source', 'source_public_id'
      )
$new$;
  occurrence_count integer;
begin
  occurrence_count :=
    (length(function_definition) - length(replace(function_definition, old_reference_fields, '')))
      / length(old_reference_fields);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one recipe relationship reference field allow-list.';
  end if;
  execute replace(function_definition, old_reference_fields, new_reference_fields);
end;
$$;

create function public.save_public_recipe_copy(
  p_destination_account_id uuid,
  p_source_public_id uuid,
  p_public_url text,
  p_recipe_payload jsonb,
  p_photo_assets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  destination_id uuid := p_destination_account_id;
  requested_source_public_id uuid := p_source_public_id;
  destination_tin_id uuid;
  copied_recipe_id uuid;
  existing_recipe_id uuid;
  source_recipe public.recipes%rowtype;
  source_username text;
  recipe_payload jsonb := p_recipe_payload;
  relationships jsonb;
  equipment_name text;
  equipment_id uuid;
  equipment_ids uuid[] := array[]::uuid[];
  equipment_revision integer;
  equipment_attempt integer;
  photo jsonb;
  expected_full_path text;
  expected_thumbnail_path text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if destination_id is null or requested_source_public_id is null
    or jsonb_typeof(recipe_payload) is distinct from 'object'
    or jsonb_typeof(p_photo_assets) is distinct from 'array'
    or p_public_url is null
    or p_public_url !~* (
      '^https?://[^[:space:]]+/r/' || requested_source_public_id::text || '$'
    )
  then
    raise exception 'The public recipe copy request is invalid.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.accounts where id = destination_id) then
    raise exception 'The destination account is unavailable.' using errcode = 'P0002';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', destination_id::text, true);

  select reference.recipe_id into existing_recipe_id
  from public.recipe_references as reference
  where reference.account_id = destination_id
    and reference.source_public_id = requested_source_public_id
    and reference.is_protected_source;
  if existing_recipe_id is not null then
    return jsonb_build_object('recipe_id', existing_recipe_id, 'already_saved', true);
  end if;

  select recipe.* into source_recipe
  from public.recipes as recipe
  where recipe.public_id = requested_source_public_id
    and not recipe.is_private
    and recipe.trashed_at is null
  for share;
  if not found then
    raise exception 'The public recipe is unavailable.' using errcode = 'P0002';
  end if;

  select account.public_username into source_username
  from public.accounts as account
  where account.id = source_recipe.account_id
    and account.public_username is not null;
  if source_username is null then
    raise exception 'The public recipe is unavailable.' using errcode = 'P0002';
  end if;

  select publication.id into destination_tin_id
  from public.publications as publication
  where publication.account_id = destination_id
    and publication.publication_type = 'collection'
    and publication.trashed_at is null
  order by publication.created_at, publication.id
  limit 1
  for share;
  if destination_tin_id is null then
    raise exception 'The destination Recipe Tin is unavailable.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(recipe_payload->'p_recipe_relationships') is distinct from 'object'
    or jsonb_typeof(recipe_payload->'p_recipe_relationships'->'references')
      is distinct from 'array'
    or jsonb_typeof(recipe_payload->'p_equipment_names') is distinct from 'array'
  then
    raise exception 'The public recipe copy data is invalid.' using errcode = '23514';
  end if;

  for equipment_name in
    select distinct btrim(item.value)
    from jsonb_array_elements_text(recipe_payload->'p_equipment_names') as item(value)
    where btrim(item.value) <> ''
    order by btrim(item.value)
  loop
    if char_length(equipment_name) > 80 then
      raise exception 'A copied equipment label is invalid.' using errcode = '23514';
    end if;
    select picklist.id into equipment_id
    from public.recipe_picklist_values as picklist
    where picklist.account_id = destination_id
      and picklist.category = 'equipment'
      and lower(regexp_replace(btrim(picklist.display_value), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(equipment_name), '[[:space:]]+', ' ', 'g'));
    if equipment_id is null then
      for equipment_attempt in 1..3 loop
        select revision into equipment_revision
        from public.recipe_picklist_revisions
        where account_id = destination_id and category = 'equipment';
        if equipment_revision is null then
          raise exception 'The destination equipment catalog is unavailable.' using errcode = 'P0002';
        end if;
        begin
          perform public.manage_recipe_picklist(
            p_action => 'add',
            p_category => 'equipment',
            p_expected_revision => equipment_revision,
            p_value => equipment_name
          );
        exception
          when sqlstate '40001' then
            null;
          when unique_violation then
            null;
        end;
        select picklist.id into equipment_id
        from public.recipe_picklist_values as picklist
        where picklist.account_id = destination_id
          and picklist.category = 'equipment'
          and lower(regexp_replace(btrim(picklist.display_value), '[[:space:]]+', ' ', 'g'))
            = lower(regexp_replace(btrim(equipment_name), '[[:space:]]+', ' ', 'g'));
        exit when equipment_id is not null;
      end loop;
    end if;
    if equipment_id is null then
      raise exception 'Unable to save copied equipment data.' using errcode = '23514';
    end if;
    equipment_ids := array_append(equipment_ids, equipment_id);
    equipment_id := null;
  end loop;

  relationships := recipe_payload->'p_recipe_relationships';
  relationships := jsonb_set(
    relationships,
    '{references}',
    relationships->'references' || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'reference_type', 'external_url',
      'display_text', source_username || '''s ' || source_recipe.name,
      'linked_recipe_id', null,
      'publication_id', null,
      'url', p_public_url,
      'is_protected_source', true,
      'source_public_id', requested_source_public_id
    )),
    true
  );
  recipe_payload := jsonb_set(recipe_payload, '{p_recipe_relationships}', relationships, true);

  perform pg_catalog.set_config('app.public_recipe_copy_context', 'on', true);
  select saved.id into copied_recipe_id
  from public.save_recipe_with_nutrition(
    (recipe_payload->>'p_recipe_id')::uuid,
    nullif(recipe_payload->>'p_expected_version', '')::integer,
    recipe_payload->>'p_name',
    nullif(recipe_payload->>'p_food_type_id', '')::uuid,
    recipe_payload->>'p_state',
    nullif(recipe_payload->>'p_verdict_id', '')::uuid,
    nullif(recipe_payload->>'p_enthusiasm_id', '')::uuid,
    recipe_payload->>'p_occasion_details',
    recipe_payload->>'p_reason',
    nullif(recipe_payload->>'p_serves', '')::integer,
    nullif(recipe_payload->>'p_prep_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_mixing_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_marinate_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_chill_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_freeze_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_cook_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_bake_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_cooling_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_rest_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_total_time_minutes', '')::integer,
    coalesce(recipe_payload->>'p_notes_markdown', ''),
    array(select value::uuid from jsonb_array_elements_text(
      coalesce(recipe_payload->'p_meal_type_ids', '[]'::jsonb)
    ) as item(value)),
    array(select value::uuid from jsonb_array_elements_text(
      coalesce(recipe_payload->'p_cuisine_ids', '[]'::jsonb)
    ) as item(value)),
    equipment_ids,
    coalesce(recipe_payload->'p_ingredient_rows', '[]'::jsonb),
    coalesce(recipe_payload->'p_instruction_steps', '[]'::jsonb),
    destination_tin_id,
    null,
    null,
    relationships,
    array[]::uuid[],
    coalesce(recipe_payload->'p_ingredient_sets', '[]'::jsonb),
    nullif(recipe_payload->>'p_score', '')::smallint,
    nullif(recipe_payload->>'p_makes_quantity', '')::integer,
    recipe_payload->>'p_makes_thing',
    coalesce(recipe_payload->'p_nutrition_overrides', '{}'::jsonb)
  ) as saved;
  if copied_recipe_id is null then
    raise exception 'The public recipe copy could not be saved.' using errcode = '23514';
  end if;

  for photo in select item.value from jsonb_array_elements(p_photo_assets) as item(value)
  loop
    expected_full_path := destination_id::text || '/assets/' ||
      (photo->>'id') || '/full.webp';
    expected_thumbnail_path := destination_id::text || '/assets/' ||
      (photo->>'id') || '/thumb.webp';
    if jsonb_typeof(photo) is distinct from 'object'
      or photo->>'full_path' is distinct from expected_full_path
      or photo->>'thumbnail_path' is distinct from expected_thumbnail_path
      or photo->>'source_full_path' is distinct from expected_full_path
      or photo->>'source_thumbnail_path' is distinct from expected_thumbnail_path
      or photo->>'content_type' is distinct from 'image/webp'
    then
      raise exception 'The copied recipe photo metadata is invalid.' using errcode = '23514';
    end if;
    insert into public.media_assets (
      id, account_id, recipe_id, asset_type, status, full_path, thumbnail_path,
      source_full_path, source_thumbnail_path, source_byte_size, content_type,
      description, position, is_primary, byte_size, width, height,
      display_width, display_height, crop, created_by_user_id, updated_by_user_id
    ) values (
      (photo->>'id')::uuid, destination_id, copied_recipe_id, 'recipe_photo', 'ready',
      expected_full_path, expected_thumbnail_path, expected_full_path, expected_thumbnail_path,
      (photo->>'source_byte_size')::bigint, 'image/webp', photo->>'description',
      (photo->>'position')::integer, coalesce((photo->>'is_primary')::boolean, false),
      (photo->>'byte_size')::bigint, (photo->>'width')::integer, (photo->>'height')::integer,
      (photo->>'width')::integer, (photo->>'height')::integer, null, destination_id, destination_id
    );
  end loop;

  return jsonb_build_object('recipe_id', copied_recipe_id, 'already_saved', false);
end;
$$;

revoke all on function public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)
  to service_role;

do $$
declare
  target_function regprocedure :=
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure;
  function_definition text := pg_get_functiondef(target_function);
  old_fragment text := $old$
  for record_data in select item.value from jsonb_array_elements(p_records->'recipe_references') as item(value)
  loop
    insert into public.recipe_references (
      id, account_id, recipe_id, reference_type, publication_id,
      display_text, url, position, linked_recipe_id
    ) values (
      (record_data->>'id')::uuid, owner_id, (record_data->>'recipe_id')::uuid,
      record_data->>'reference_type', nullif(record_data->>'publication_id', '')::uuid,
      record_data->>'display_text', record_data->>'url',
      (record_data->>'position')::smallint, nullif(record_data->>'linked_recipe_id', '')::uuid
    );
  end loop;
$old$;
  new_fragment text := $new$
  for record_data in select item.value from jsonb_array_elements(p_records->'recipe_references') as item(value)
  loop
    if coalesce((record_data->>'is_protected_source')::boolean, false)
      and exists (
        select 1 from public.recipe_references as existing_reference
        where existing_reference.account_id = owner_id
          and existing_reference.recipe_id = (record_data->>'recipe_id')::uuid
          and existing_reference.source_public_id = (record_data->>'source_public_id')::uuid
          and existing_reference.is_protected_source
      ) then
      continue;
    end if;
    insert into public.recipe_references (
      id, account_id, recipe_id, reference_type, publication_id,
      display_text, url, position, linked_recipe_id, is_protected_source, source_public_id
    ) values (
      (record_data->>'id')::uuid, owner_id, (record_data->>'recipe_id')::uuid,
      record_data->>'reference_type', nullif(record_data->>'publication_id', '')::uuid,
      record_data->>'display_text', record_data->>'url',
      ((record_data->>'position')::integer + coalesce((
        select max(existing_reference.position) + 1
        from public.recipe_references as existing_reference
        where existing_reference.account_id = owner_id
          and existing_reference.recipe_id = (record_data->>'recipe_id')::uuid
          and existing_reference.is_protected_source
      ), 0))::smallint,
      nullif(record_data->>'linked_recipe_id', '')::uuid,
      coalesce((record_data->>'is_protected_source')::boolean, false),
      nullif(record_data->>'source_public_id', '')::uuid
    );
  end loop;
$new$;
  occurrence_count integer;
begin
  occurrence_count :=
    (length(function_definition) - length(replace(function_definition, old_fragment, '')))
      / length(old_fragment);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one database import recipe reference insert fragment.';
  end if;
  execute replace(function_definition, old_fragment, new_fragment);
end;
$$;

notify pgrst, 'reload schema';
