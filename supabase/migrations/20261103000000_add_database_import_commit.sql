create function private.apply_database_import_publication_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.database_import_context', true) = 'on' then
    new.id := nullif(current_setting('app.database_import_publication_id', true), '')::uuid;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_database_import_publication_id()
  from public, anon, authenticated;

create trigger publications_apply_database_import_id
  before insert on public.publications
  for each row execute function private.apply_database_import_publication_id();

create function private.apply_database_import_recipe_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.database_import_context', true) = 'on' then
    new.id := nullif(current_setting('app.database_import_recipe_id', true), '')::uuid;
    new.is_private := coalesce(
      nullif(current_setting('app.database_import_recipe_is_private', true), '')::boolean,
      new.is_private
    );
    if tg_op = 'INSERT' then
      new.created_at := coalesce(
        nullif(current_setting('app.database_import_recipe_created_at', true), '')::timestamptz,
        new.created_at
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_database_import_recipe_context()
  from public, anon, authenticated;

create trigger recipes_apply_database_import_context
  before insert or update on public.recipes
  for each row execute function private.apply_database_import_recipe_context();

create function private.apply_database_import_recipe_ingredient_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  imported_id uuid;
begin
  if current_setting('app.database_import_context', true) = 'on' then
    select (ingredient->>'id')::uuid into imported_id
    from jsonb_array_elements(
      nullif(current_setting('app.database_import_recipe_ingredients', true), '')::jsonb
    ) as item(ingredient)
    where ingredient->>'recipe_id' = new.recipe_id::text
      and (ingredient->>'position')::integer = new.position;
    if imported_id is null then
      raise exception 'The import plan is missing a recipe ingredient identifier.'
        using errcode = '23514';
    end if;
    new.id := imported_id;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_database_import_recipe_ingredient_id()
  from public, anon, authenticated;

create trigger recipe_ingredients_apply_database_import_id
  before insert on public.recipe_ingredients
  for each row execute function private.apply_database_import_recipe_ingredient_id();

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
declare
  owner_id uuid := p_account_id;
  entry jsonb;
  record_data jsonb;
  recipe_id uuid;
  target_publication_id uuid;
  expected_version integer;
  current_version integer;
  saved_id uuid;
  before_tags jsonb;
  after_tags jsonb;
  ingredient_rows jsonb;
  instruction_steps jsonb;
  recipe_tags uuid[];
  publication_tag_ids uuid[];
  imported_recipe_ids uuid[] := array[]::uuid[];
  table_name text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if owner_id is null or not exists (
    select 1 from public.accounts as account where account.id = owner_id
  ) then
    raise exception 'Account is unavailable.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_account_preferences) is distinct from 'object'
    or jsonb_typeof(p_records) is distinct from 'object'
    or jsonb_typeof(p_expected_versions) is distinct from 'array'
    or p_replace_recipe_ids is null
    or p_replace_publication_ids is null then
    raise exception 'The import plan is invalid.' using errcode = '23514';
  end if;

  foreach table_name in array array[
    'recipes', 'publications', 'recipe_picklist_values', 'recipe_picklist_assignments',
    'ingredients', 'recipe_ingredients', 'recipe_ingredient_measurements', 'recipe_steps',
    'recipe_step_mentions', 'recipe_site_listings', 'recipe_pairings', 'recipe_references',
    'ingredient_densities', 'tags', 'recipe_tags', 'publication_tags', 'explorer_state',
    'media_assets'
  ] loop
    if jsonb_typeof(p_records->table_name) is distinct from 'array' then
      raise exception 'The import plan is missing a record collection.' using errcode = '23514';
    end if;
  end loop;

  for record_data in
    select item.value
    from jsonb_array_elements(p_records->'publications') as item(value)
    where nullif(item.value->>'trashed_at', '') is not null
  loop
    target_publication_id := (record_data->>'id')::uuid;
    if exists (
      select 1
      from jsonb_array_elements(p_records->'recipes') as item(recipe)
      where recipe->>'publication_id' = target_publication_id::text
        and nullif(recipe->>'trashed_at', '') is null
    ) then
      raise exception 'An imported trashed publication cannot retain active recipes.'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = owner_id
        and recipe.publication_id = target_publication_id
        and recipe.trashed_at is null
        and not exists (
          select 1
          from jsonb_array_elements(p_records->'recipes') as item(incoming_recipe)
          where incoming_recipe->>'id' = recipe.id::text
        )
    ) then
      raise exception 'A trashed publication import would affect an active recipe outside the import.'
        using errcode = '23514';
    end if;
  end loop;
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_id::text, true);
  perform pg_catalog.set_config('app.database_import_context', 'on', true);
  perform pg_catalog.set_config(
    'app.database_import_recipe_ingredients',
    (p_records->'recipe_ingredients')::text,
    true
  );

  for entry in
    select item.value
    from jsonb_array_elements(p_expected_versions) as item(value)
    order by item.value->>'kind', item.value->>'targetId'
  loop
    if entry->>'kind' = 'recipe' then
      select recipe.version into current_version
      from public.recipes as recipe
      where recipe.account_id = owner_id
        and recipe.id = (entry->>'targetId')::uuid
      for update;
    elsif entry->>'kind' = 'publication' then
      select publication.version into current_version
      from public.publications as publication
      where publication.account_id = owner_id
        and publication.id = (entry->>'targetId')::uuid
      for update;
    else
      raise exception 'The import version check is invalid.' using errcode = '23514';
    end if;
    if current_version is null then
      raise exception 'A selected record is no longer available.' using errcode = 'P0002';
    end if;
    if current_version is distinct from (entry->>'version')::integer then
      raise exception 'A selected record changed after preview.' using errcode = 'P0001';
    end if;
    current_version := null;
  end loop;

  for record_data in select item.value from jsonb_array_elements(p_records->'ingredients') as item(value)
  loop
    insert into public.ingredients (id, account_id, name, created_at, sort_order)
    values (
      (record_data->>'id')::uuid, owner_id, record_data->>'name',
      coalesce(nullif(record_data->>'created_at', '')::timestamptz, now()),
      coalesce(nullif(record_data->>'sort_order', '')::integer, 0)
    );
  end loop;

  for record_data in
    select item.value from jsonb_array_elements(p_records->'recipe_picklist_values') as item(value)
  loop
    insert into public.recipe_picklist_values (
      id, account_id, category, value, display_value, sort_order, is_protected, created_at
    ) values (
      (record_data->>'id')::uuid, owner_id, record_data->>'category', record_data->>'value',
      record_data->>'display_value', (record_data->>'sort_order')::integer,
      coalesce((record_data->>'is_protected')::boolean, false),
      coalesce(nullif(record_data->>'created_at', '')::timestamptz, now())
    );
  end loop;

  for record_data in select item.value from jsonb_array_elements(p_records->'tags') as item(value)
  loop
    insert into public.tags (id, account_id, name, created_at, sort_order, color_key)
    values (
      (record_data->>'id')::uuid, owner_id, record_data->>'name',
      coalesce(nullif(record_data->>'created_at', '')::timestamptz, now()),
      coalesce(nullif(record_data->>'sort_order', '')::integer, 0),
      coalesce(record_data->>'color_key', 'grey')
    );
  end loop;

  for record_data in select item.value from jsonb_array_elements(p_records->'publications') as item(value)
  loop
    target_publication_id := (record_data->>'id')::uuid;
    if record_data->>'publication_type' = 'collection' then
      raise exception 'Recipe Tin cannot be imported or replaced.' using errcode = '23514';
    end if;

    select coalesce(array_agg((assignment->>'tag_id')::uuid), array[]::uuid[])
    into publication_tag_ids
    from jsonb_array_elements(p_records->'publication_tags') as item(assignment)
    where item.assignment->>'publication_id' = target_publication_id::text;

    if exists (
      select 1 from public.publications as publication
      where publication.account_id = owner_id and publication.id = target_publication_id
    ) then
      select (item.value->>'version')::integer into expected_version
      from jsonb_array_elements(p_expected_versions) as item(value)
      where item.value->>'kind' = 'publication'
        and item.value->>'targetId' = target_publication_id::text;
      if expected_version is null then
        raise exception 'The import plan contains an unverified publication.' using errcode = '23514';
      end if;

      select private.publication_tag_snapshot(owner_id, target_publication_id)
      into before_tags;
      select coalesce(
        jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
        '[]'::jsonb
      ) into after_tags
      from public.tags as tag
      where tag.account_id = owner_id and tag.id = any(publication_tag_ids);
      perform pg_catalog.set_config(
        'app.publication_tags_before',
        jsonb_build_object(target_publication_id::text, before_tags)::text,
        true
      );
      perform pg_catalog.set_config(
        'app.publication_tags_after',
        jsonb_build_object(target_publication_id::text, after_tags)::text,
        true
      );
      perform pg_catalog.set_config('app.tag_assignment_context', 'on', true);
      update public.publications as publication
      set name = record_data->>'name',
          author = record_data->>'author',
          edition = record_data->>'edition',
          isbn = record_data->>'isbn',
          retailer_url = record_data->>'retailer_url',
          site_url = record_data->>'site_url',
          version = publication.version + 1
      where publication.account_id = owner_id
        and publication.id = target_publication_id
        and publication.version = expected_version
        and publication.trashed_at is null;
      if not found then
        raise exception 'A selected publication changed after preview.' using errcode = 'P0001';
      end if;
      delete from public.publication_tags
      where account_id = owner_id
        and publication_tags.publication_id = target_publication_id;
      insert into public.publication_tags (account_id, publication_id, tag_id)
      select owner_id, target_publication_id, unnest(publication_tag_ids);
    else
      perform pg_catalog.set_config(
        'app.database_import_publication_id', target_publication_id::text, true
      );
      saved_id := public.create_publication(
        record_data->>'name', record_data->>'publication_type', record_data->>'author',
        record_data->>'edition', record_data->>'isbn', record_data->>'retailer_url',
        record_data->>'issue', record_data->>'site_url', publication_tag_ids
      );
      if saved_id is distinct from target_publication_id then
        raise exception 'The imported publication ID could not be preserved.';
      end if;
      update public.publications as publication
      set created_at = coalesce(nullif(record_data->>'created_at', '')::timestamptz, publication.created_at),
          trashed_at = null
      where publication.account_id = owner_id and publication.id = target_publication_id;
    end if;
  end loop;

  for record_data in
    select item.value from jsonb_array_elements(p_records->'ingredient_densities') as item(value)
  loop
    insert into public.ingredient_densities (
      account_id, ingredient_id, volume_amount, volume_unit_code,
      weight_amount, weight_unit_code, created_at, updated_at
    ) values (
      owner_id, (record_data->>'ingredient_id')::uuid,
      (record_data->>'volume_amount')::numeric, record_data->>'volume_unit_code',
      (record_data->>'weight_amount')::numeric, record_data->>'weight_unit_code',
      coalesce(nullif(record_data->>'created_at', '')::timestamptz, now()),
      coalesce(nullif(record_data->>'updated_at', '')::timestamptz, now())
    );
  end loop;

  for record_data in select item.value from jsonb_array_elements(p_records->'recipes') as item(value)
  loop
    recipe_id := (record_data->>'id')::uuid;
    select coalesce(array_agg((assignment->>'tag_id')::uuid), array[]::uuid[])
    into recipe_tags
    from jsonb_array_elements(p_records->'recipe_tags') as item(assignment)
    where item.assignment->>'recipe_id' = recipe_id::text;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ingredient_id', ingredient->'ingredient_id',
          'is_main', ingredient->'is_main',
          'detail', ingredient->'detail',
          'preparation', ingredient->'preparation',
          'measurements', coalesce((
            select jsonb_agg(jsonb_build_object(
              'measurement_type', measurement->'measurement_type',
              'amount_min', measurement->'amount_min',
              'amount_max', measurement->'amount_max',
              'unit_code', measurement->'unit_code',
              'picklist_value_id', measurement->'picklist_value_id'
            ) order by (measurement->>'position')::integer)
            from jsonb_array_elements(p_records->'recipe_ingredient_measurements') as item(measurement)
            where measurement->>'recipe_ingredient_id' = ingredient->>'id'
          ), '[]'::jsonb)
        ) order by (ingredient->>'position')::integer
      ), '[]'::jsonb
    ) into ingredient_rows
    from jsonb_array_elements(p_records->'recipe_ingredients') as item(ingredient)
    where ingredient->>'recipe_id' = recipe_id::text;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', step->'id',
      'position', step->'position',
      'content_markdown', step->'content_markdown',
      'plain_text', step->'plain_text'
    ) order by (step->>'position')::integer), '[]'::jsonb)
    into instruction_steps
    from jsonb_array_elements(p_records->'recipe_steps') as item(step)
    where step->>'recipe_id' = recipe_id::text;

    select (item.value->>'version')::integer into expected_version
    from jsonb_array_elements(p_expected_versions) as item(value)
    where item.value->>'kind' = 'recipe'
      and item.value->>'targetId' = recipe_id::text;
    if not exists (
      select 1 from public.recipes as recipe
      where recipe.account_id = owner_id and recipe.id = recipe_id
    ) then
      expected_version := null;
    elsif expected_version is null then
      raise exception 'The import plan contains an unverified recipe.' using errcode = '23514';
    end if;

    perform pg_catalog.set_config('app.database_import_recipe_id', recipe_id::text, true);
    perform pg_catalog.set_config(
      'app.database_import_recipe_is_private',
      coalesce(record_data->>'is_private', 'true'),
      true
    );
    perform pg_catalog.set_config(
      'app.database_import_recipe_created_at',
      coalesce(record_data->>'created_at', ''),
      true
    );

    select saved.id into saved_id
    from public.save_recipe_with_relationships(
      case when expected_version is null then null else recipe_id end,
      expected_version,
      record_data->>'name',
      nullif(record_data->>'food_type_id', '')::uuid,
      record_data->>'state',
      nullif(record_data->>'verdict_id', '')::uuid,
      nullif(record_data->>'enthusiasm_id', '')::uuid,
      record_data->>'occasion_details',
      record_data->>'reason',
      nullif(record_data->>'serves', '')::integer,
      nullif(record_data->>'prep_time_minutes', '')::integer,
      nullif(record_data->>'mixing_time_minutes', '')::integer,
      nullif(record_data->>'marinate_time_minutes', '')::integer,
      nullif(record_data->>'chill_time_minutes', '')::integer,
      nullif(record_data->>'freeze_time_minutes', '')::integer,
      nullif(record_data->>'cook_time_minutes', '')::integer,
      nullif(record_data->>'bake_time_minutes', '')::integer,
      nullif(record_data->>'cooling_time_minutes', '')::integer,
      nullif(record_data->>'rest_time_minutes', '')::integer,
      nullif(record_data->>'total_time_minutes', '')::integer,
      record_data->>'notes_markdown',
      array(select (assignment->>'picklist_value_id')::uuid
        from jsonb_array_elements(p_records->'recipe_picklist_assignments') as item(assignment)
        where assignment->>'recipe_id' = recipe_id::text and assignment->>'category' = 'meal_type'),
      array(select (assignment->>'picklist_value_id')::uuid
        from jsonb_array_elements(p_records->'recipe_picklist_assignments') as item(assignment)
        where assignment->>'recipe_id' = recipe_id::text and assignment->>'category' = 'cuisine'),
      array(select (assignment->>'picklist_value_id')::uuid
        from jsonb_array_elements(p_records->'recipe_picklist_assignments') as item(assignment)
        where assignment->>'recipe_id' = recipe_id::text and assignment->>'category' = 'equipment'),
      ingredient_rows,
      instruction_steps,
      nullif(record_data->>'publication_id', '')::uuid,
      record_data->>'publication_page',
      record_data->>'recipe_url',
      jsonb_build_object('site_listing', null, 'pairings', '[]'::jsonb, 'references', '[]'::jsonb),
      recipe_tags
    ) as saved;
    if saved_id is distinct from recipe_id then
      raise exception 'The imported recipe ID could not be preserved.';
    end if;

    set constraints public.recipe_history_after_save immediate;
    set constraints public.recipe_history_after_save deferred;
    imported_recipe_ids := array_append(imported_recipe_ids, recipe_id);
  end loop;

  perform pg_catalog.set_config('app.recipe_save_context', 'on', true);
  for record_data in select item.value from jsonb_array_elements(p_records->'recipe_site_listings') as item(value)
  loop
    if not exists (
      select 1
      from public.recipes as recipe
      join public.publications as primary_publication
        on primary_publication.account_id = owner_id
        and primary_publication.id = recipe.publication_id
      join public.publications as site_publication
        on site_publication.account_id = owner_id
        and site_publication.id = (record_data->>'site_publication_id')::uuid
      where recipe.account_id = owner_id
        and recipe.id = (record_data->>'recipe_id')::uuid
        and primary_publication.publication_type = 'magazine'
        and site_publication.publication_type = 'site'
    ) then
      raise exception 'A Site listing is not compatible with its recipe.' using errcode = '23514';
    end if;
    insert into public.recipe_site_listings (
      id, account_id, recipe_id, site_publication_id, recipe_url
    ) values (
      (record_data->>'id')::uuid, owner_id, (record_data->>'recipe_id')::uuid,
      (record_data->>'site_publication_id')::uuid, record_data->>'recipe_url'
    );
  end loop;

  for record_data in select item.value from jsonb_array_elements(p_records->'recipe_pairings') as item(value)
  loop
    insert into public.recipe_pairings (
      id, account_id, source_recipe_id, linked_recipe_id, display_text, position
    ) values (
      (record_data->>'id')::uuid, owner_id, (record_data->>'source_recipe_id')::uuid,
      nullif(record_data->>'linked_recipe_id', '')::uuid, record_data->>'display_text',
      (record_data->>'position')::smallint
    );
  end loop;

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

  update public.recipe_history as history
  set after_data = history.after_data || jsonb_build_object(
    'relationships', public.recipe_relationship_snapshot(owner_id, history.record_id)
  )
  where history.account_id = owner_id
    and history.record_id = any(imported_recipe_ids)
    and history.created_at = transaction_timestamp()
    and history.event_type in ('recipe.created', 'recipe.updated');

  delete from public.media_assets as media
  where media.account_id = owner_id
    and (
      media.recipe_id = any(p_replace_recipe_ids)
      or media.publication_id = any(p_replace_publication_ids)
    );

  if (
    select coalesce(sum(media.byte_size), 0)
    from public.media_assets as media
    where media.account_id = owner_id and media.status = 'ready'
  ) + coalesce((
    select sum((asset->>'byte_size')::bigint)
    from jsonb_array_elements(p_records->'media_assets') as item(asset)
  ), 0) > 1073741824 then
    raise exception 'The imported images exceed the 1 GiB storage limit.'
      using errcode = '54000';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records->'media_assets') as item(asset)
    where asset->>'status' <> 'ready'
      or asset->>'content_type' <> 'image/webp'
      or (asset->>'byte_size')::bigint <= 0
      or (asset->>'width')::integer not between 1 and 2048
      or (asset->>'height')::integer not between 1 and 2048
      or length(coalesce(asset->>'description', '')) > 250
  ) then
    raise exception 'An imported image record is invalid.' using errcode = '23514';
  end if;

  if exists (
    select asset->>'recipe_id'
    from jsonb_array_elements(p_records->'media_assets') as item(asset)
    where asset->>'asset_type' = 'recipe_photo'
    group by asset->>'recipe_id'
    having count(*) > 12
  ) then
    raise exception 'An imported recipe has too many photos.' using errcode = '23514';
  end if;

  insert into public.media_assets (
    id, account_id, recipe_id, publication_id, asset_type, status,
    full_path, thumbnail_path, content_type, description, position, is_primary,
    byte_size, width, height, created_by_user_id, updated_by_user_id, created_at, updated_at
  )
  select
    (asset->>'id')::uuid,
    owner_id,
    nullif(asset->>'recipe_id', '')::uuid,
    nullif(asset->>'publication_id', '')::uuid,
    asset->>'asset_type',
    'ready',
    owner_id::text || '/assets/' || (asset->>'id') || '/full.webp',
    owner_id::text || '/assets/' || (asset->>'id') || '/thumb.webp',
    'image/webp',
    coalesce(asset->>'description', ''),
    coalesce((asset->>'position')::integer, 0),
    coalesce((asset->>'is_primary')::boolean, false),
    (asset->>'byte_size')::bigint,
    (asset->>'width')::integer,
    (asset->>'height')::integer,
    owner_id,
    owner_id,
    coalesce(nullif(asset->>'created_at', '')::timestamptz, now()),
    now()
  from jsonb_array_elements(p_records->'media_assets') as item(asset);

  for record_data in
    select item.value
    from jsonb_array_elements(p_records->'recipes') as item(value)
    where nullif(item.value->>'trashed_at', '') is not null
  loop
    recipe_id := (record_data->>'id')::uuid;
    select recipe.version into current_version
    from public.recipes as recipe
    where recipe.account_id = owner_id and recipe.id = recipe_id;
    if current_version is null then
      raise exception 'An imported recipe could not be moved to Trash.' using errcode = '23514';
    end if;
    perform public.trash_recipe(recipe_id, current_version);
    current_version := null;
  end loop;

  for record_data in
    select item.value
    from jsonb_array_elements(p_records->'publications') as item(value)
    where nullif(item.value->>'trashed_at', '') is not null
  loop
    target_publication_id := (record_data->>'id')::uuid;
    select publication.version into current_version
    from public.publications as publication
    where publication.account_id = owner_id and publication.id = target_publication_id;
    if current_version is null then
      raise exception 'An imported publication could not be moved to Trash.' using errcode = '23514';
    end if;
    perform public.trash_publication(target_publication_id, current_version, 'delete', null);
    current_version := null;
  end loop;

  for record_data in select item.value from jsonb_array_elements(p_records->'explorer_state') as item(value)
  loop
    perform public.update_explorer_state(record_data->>'context_key', record_data->'state');
  end loop;

  update public.accounts as account
  set volume_system = coalesce(p_account_preferences->>'volume_system', account.volume_system),
      weight_system = coalesce(p_account_preferences->>'weight_system', account.weight_system),
      ingredient_presentation = coalesce(
        p_account_preferences->>'ingredient_presentation', account.ingredient_presentation
      ),
      hand_preference = coalesce(p_account_preferences->>'hand_preference', account.hand_preference),
      recipe_column_order = case
        when p_account_preferences ? 'recipe_column_order' then
          array(select jsonb_array_elements_text(p_account_preferences->'recipe_column_order'))
        else account.recipe_column_order
      end,
      recipe_hidden_columns = case
        when p_account_preferences ? 'recipe_hidden_columns' then
          array(select jsonb_array_elements_text(p_account_preferences->'recipe_hidden_columns'))
        else account.recipe_hidden_columns
      end
  where account.id = owner_id;

  return jsonb_build_object(
    'recipes', jsonb_array_length(p_records->'recipes'),
    'publications', jsonb_array_length(p_records->'publications'),
    'ingredients', jsonb_array_length(p_records->'ingredients'),
    'picklistValues', jsonb_array_length(p_records->'recipe_picklist_values'),
    'tags', jsonb_array_length(p_records->'tags'),
    'mediaAssets', jsonb_array_length(p_records->'media_assets')
  );
end;
$$;

revoke all on function public.commit_database_import(uuid, jsonb, jsonb, jsonb, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.commit_database_import(uuid, jsonb, jsonb, jsonb, uuid[], uuid[])
  to service_role;

notify pgrst, 'reload schema';