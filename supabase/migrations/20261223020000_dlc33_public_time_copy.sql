do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)'::regprocedure
  );
  old_declaration constant text := $old$  equipment_revision integer;
  equipment_attempt integer;
  photo jsonb;
$old$;
  new_declaration constant text := $new$  equipment_revision integer;
  equipment_attempt integer;
  time_entry jsonb;
  time_entry_ordinal bigint;
  time_type_name text;
  time_type_id uuid;
  time_type_revision integer;
  time_type_attempt integer;
  time_entries jsonb := '[]'::jsonb;
  time_minutes bigint;
  time_position bigint;
  time_total bigint := 0;
  photo jsonb;
$new$;
  old_relationships constant text := $old$  relationships := recipe_payload->'p_recipe_relationships';
$old$;
  new_time_entry_validation constant text := $new$  if jsonb_typeof(recipe_payload->'p_time_entries')
    is distinct from 'array' then
    raise exception 'The public recipe time entries are invalid.' using errcode = '23514';
  end if;

  for time_entry, time_entry_ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(recipe_payload->'p_time_entries')
      with ordinality as item(value, ordinality)
  loop
    if jsonb_typeof(time_entry) is distinct from 'object' then
      raise exception 'The public recipe time entries are invalid.' using errcode = '23514';
    end if;
    if jsonb_object_length(time_entry) <> 3
      or not (time_entry ?& array['time_type', 'minutes', 'position'])
      or jsonb_typeof(time_entry->'time_type') is distinct from 'string'
      or jsonb_typeof(time_entry->'minutes') is distinct from 'number'
      or (time_entry->>'minutes') !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(time_entry->'position') is distinct from 'number'
      or (time_entry->>'position') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'The public recipe time entries are invalid.' using errcode = '23514';
    end if;

    time_type_name := btrim(
      regexp_replace(time_entry->>'time_type', '[[:space:]]+', ' ', 'g')
    );
    time_minutes := (time_entry->>'minutes')::bigint;
    time_position := (time_entry->>'position')::bigint;
    if time_type_name = '' or char_length(time_type_name) > 80
      or time_minutes > 2147483647
      or time_position <> time_entry_ordinal - 1 then
      raise exception 'The public recipe time entries are invalid.' using errcode = '23514';
    end if;

    time_total := time_total + time_minutes;
    if time_total > 2147483647 then
      raise exception 'The public recipe time total exceeds the supported range.'
        using errcode = '23514';
    end if;

    select picklist.id into time_type_id
    from public.recipe_picklist_values as picklist
    where picklist.account_id = destination_id
      and picklist.category = 'time_type'
      and lower(regexp_replace(btrim(picklist.display_value), '[[:space:]]+', ' ', 'g'))
        = lower(time_type_name);
    if time_type_id is null then
      for time_type_attempt in 1..3 loop
        select revision into time_type_revision
        from public.recipe_picklist_revisions
        where account_id = destination_id and category = 'time_type';
        if time_type_revision is null then
          raise exception 'The destination Time Type catalog is unavailable.'
            using errcode = 'P0002';
        end if;
        begin
          perform public.manage_recipe_picklist(
            p_action => 'add',
            p_category => 'time_type',
            p_expected_revision => time_type_revision,
            p_value => time_type_name
          );
        exception
          when sqlstate '40001' then
            null;
          when unique_violation then
            null;
        end;
        select picklist.id into time_type_id
        from public.recipe_picklist_values as picklist
        where picklist.account_id = destination_id
          and picklist.category = 'time_type'
          and lower(regexp_replace(btrim(picklist.display_value), '[[:space:]]+', ' ', 'g'))
            = lower(time_type_name);
        exit when time_type_id is not null;
      end loop;
    end if;
    if time_type_id is null then
      raise exception 'Unable to save copied Time Type data.' using errcode = '23514';
    end if;

    time_entries := time_entries || jsonb_build_array(jsonb_build_object(
      'time_type_id', time_type_id,
      'minutes', time_minutes,
      'position', time_position
    ));
  end loop;

  relationships := recipe_payload->'p_recipe_relationships';
$new$;
  old_save_function constant text := 'from public.save_recipe_with_nutrition(';
  new_save_function constant text := 'from public.save_recipe_with_time_entries(';
  old_time_arguments constant text := $old$    nullif(recipe_payload->>'p_prep_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_mixing_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_marinate_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_chill_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_freeze_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_cook_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_bake_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_cooling_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_rest_time_minutes', '')::integer,
    nullif(recipe_payload->>'p_total_time_minutes', '')::integer,
$old$;
  new_save_tail constant text := $new$    coalesce(recipe_payload->'p_nutrition_overrides', '{}'::jsonb),
    time_entries
  ) as saved;$new$;
  old_save_tail constant text := $old$    coalesce(recipe_payload->'p_nutrition_overrides', '{}'::jsonb)
  ) as saved;$old$;
begin
  if pg_catalog.strpos(function_definition, old_declaration) = 0
    or pg_catalog.strpos(function_definition, old_relationships) = 0
    or pg_catalog.strpos(function_definition, old_save_function) = 0
    or pg_catalog.strpos(function_definition, old_time_arguments) = 0
    or pg_catalog.strpos(function_definition, old_save_tail) = 0 then
    raise exception 'Could not extend public recipe copying for configurable times.';
  end if;

  function_definition := pg_catalog.replace(function_definition, old_declaration, new_declaration);
  function_definition := pg_catalog.replace(
    function_definition, old_relationships, new_time_entry_validation
  );
  function_definition := pg_catalog.replace(
    function_definition, old_save_function, new_save_function
  );
  function_definition := pg_catalog.replace(function_definition, old_time_arguments, '');
  function_definition := pg_catalog.replace(function_definition, old_save_tail, new_save_tail);
  execute function_definition;
end
$$;

notify pgrst, 'reload schema';
