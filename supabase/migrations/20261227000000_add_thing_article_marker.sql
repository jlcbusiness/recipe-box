alter table public.recipe_ingredient_measurements
  add column amount_is_a boolean not null default false,
  add constraint recipe_ingredient_measurements_a_marker_check
    check (
      not amount_is_a
      or (
        measurement_type = 'informal'
        and amount_min = 1
        and amount_max is null
      )
    );

do $$
declare
  function_source text;
  old_declaration constant text := $pattern$  picklist_value_id uuid;
  measurement_position integer;$pattern$;
  new_declaration constant text := $pattern$  picklist_value_id uuid;
  amount_is_a boolean;
  measurement_position integer;$pattern$;
  old_key_list constant text :=
    $pattern$'measurement_type', 'amount_min', 'amount_max', 'unit_code', 'picklist_value_id'$pattern$;
  new_key_list constant text :=
    $pattern$'measurement_type', 'amount_min', 'amount_max', 'unit_code', 'picklist_value_id',
        'amount_is_a'$pattern$;
  old_parse constant text := $pattern$      picklist_value_id := nullif(measurement_data->>'picklist_value_id', '')::uuid;

      if measurement_type = 'unmeasured' then$pattern$;
  new_parse constant text := $pattern$      picklist_value_id := nullif(measurement_data->>'picklist_value_id', '')::uuid;
      if measurement_data ? 'amount_is_a'
        and jsonb_typeof(measurement_data->'amount_is_a') is distinct from 'boolean' then
        raise exception 'The Things article marker must be boolean.' using errcode = '23514';
      end if;
      amount_is_a := coalesce((measurement_data->>'amount_is_a')::boolean, false);
      if amount_is_a and (
        measurement_type <> 'informal'
        or amount_min <> 1
        or amount_max is not null
      ) then
        raise exception 'The a marker requires a scalar Things amount of one.' using errcode = '23514';
      end if;

      if measurement_type = 'unmeasured' then$pattern$;
  old_insert constant text := $pattern$        amount_min, amount_max, unit_code, picklist_value_id
      )
      values (
        owner_id, row_ingredient_id, measurement_position, measurement_type,
        amount_min, amount_max, unit_code, picklist_value_id
      );$pattern$;
  new_insert constant text := $pattern$        amount_min, amount_max, unit_code, picklist_value_id, amount_is_a
      )
      values (
        owner_id, row_ingredient_id, measurement_position, measurement_type,
        amount_min, amount_max, unit_code, picklist_value_id, amount_is_a
      );$pattern$;
  old_snapshot constant text :=
    $pattern$                'picklist_value_id', measurement.picklist_value_id,
                'picklist_value', picklist.value$pattern$;
  new_snapshot constant text :=
    $pattern$                'picklist_value_id', measurement.picklist_value_id,
                'amount_is_a', measurement.amount_is_a,
                'picklist_value', picklist.value$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_recipe(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,jsonb,uuid[],uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_declaration) = 0
    or pg_catalog.strpos(function_source, old_key_list) = 0
    or pg_catalog.strpos(function_source, old_parse) = 0
    or pg_catalog.strpos(function_source, old_insert) = 0
    or pg_catalog.strpos(function_source, old_snapshot) = 0 then
    raise exception 'Expected recipe measurement save fragments were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_declaration, new_declaration);
  function_source := pg_catalog.replace(function_source, old_key_list, new_key_list);
  function_source := pg_catalog.replace(function_source, old_parse, new_parse);
  function_source := pg_catalog.replace(function_source, old_insert, new_insert);
  function_source := pg_catalog.replace(function_source, old_snapshot, new_snapshot);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_snapshot constant text :=
    $pattern$        'picklist_value_id', measurement.picklist_value_id,
        'picklist_value', picklist.value$pattern$;
  new_snapshot constant text :=
    $pattern$        'picklist_value_id', measurement.picklist_value_id,
        'amount_is_a', measurement.amount_is_a,
        'picklist_value', picklist.value$pattern$;
begin
  select pg_catalog.pg_get_functiondef('public.recipe_history_after_save()'::regprocedure)
  into function_source;

  if pg_catalog.strpos(function_source, old_snapshot) = 0 then
    raise exception 'Expected recipe history measurement snapshot was not found';
  end if;

  execute pg_catalog.replace(function_source, old_snapshot, new_snapshot);
end;
$$;

do $$
declare
  function_source text;
  old_snapshot constant text :=
    $pattern$              'picklist_value_id', measurement.picklist_value_id,
              'picklist_value', picklist.value$pattern$;
  new_snapshot constant text :=
    $pattern$              'picklist_value_id', measurement.picklist_value_id,
              'amount_is_a', measurement.amount_is_a,
              'picklist_value', picklist.value$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.recipe_ingredient_history_snapshot(uuid,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_snapshot) = 0 then
    raise exception 'Expected picklist history measurement snapshot was not found';
  end if;

  execute pg_catalog.replace(function_source, old_snapshot, new_snapshot);
end;
$$;

do $$
declare
  function_source text;
  old_measurement constant text :=
    $pattern$              'picklist_value_id', measurement->'picklist_value_id'$pattern$;
  new_measurement constant text :=
    $pattern$              'picklist_value_id', measurement->'picklist_value_id',
              'amount_is_a', coalesce(measurement->'amount_is_a', 'false'::jsonb)$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_measurement) = 0 then
    raise exception 'Expected database import measurement mapping was not found';
  end if;

  execute pg_catalog.replace(function_source, old_measurement, new_measurement);
end;
$$;
