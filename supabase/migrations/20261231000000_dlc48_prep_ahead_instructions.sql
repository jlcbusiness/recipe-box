alter table public.recipes
  add column prep_ahead_markdown text not null default '';

create function private.apply_recipe_prep_ahead_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('app.recipe_prep_ahead_save_context', true) = 'on' then
    new.prep_ahead_markdown := coalesce(
      pg_catalog.current_setting('app.recipe_prep_ahead_markdown', true),
      ''
    );
  end if;
  return new;
end;
$$;

revoke all on function private.apply_recipe_prep_ahead_context()
  from public, anon, authenticated;

create trigger recipes_apply_prep_ahead_context
  before insert or update on public.recipes
  for each row execute function private.apply_recipe_prep_ahead_context();

create function public.save_recipe_with_time_entries(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_serves integer,
  p_notes_markdown text,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[],
  p_ingredient_rows jsonb,
  p_instruction_steps jsonb,
  p_publication_id uuid,
  p_publication_page text,
  p_recipe_url text,
  p_recipe_relationships jsonb,
  p_tag_ids uuid[],
  p_ingredient_sets jsonb,
  p_score smallint,
  p_makes_quantity integer,
  p_makes_thing text,
  p_nutrition_overrides jsonb,
  p_time_entries jsonb,
  p_prep_ahead_markdown text
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_context text := coalesce(
    pg_catalog.current_setting('app.recipe_prep_ahead_save_context', true),
    ''
  );
  previous_value text := coalesce(
    pg_catalog.current_setting('app.recipe_prep_ahead_markdown', true),
    ''
  );
begin
  perform pg_catalog.set_config('app.recipe_prep_ahead_save_context', 'on', true);
  perform pg_catalog.set_config(
    'app.recipe_prep_ahead_markdown',
    coalesce(p_prep_ahead_markdown, ''),
    true
  );

  return query
  select saved.id, saved.version
  from public.save_recipe_with_time_entries(
    p_recipe_id,
    p_expected_version,
    p_name,
    p_food_type_id,
    p_state,
    p_verdict_id,
    p_enthusiasm_id,
    p_occasion_details,
    p_reason,
    p_serves,
    p_notes_markdown,
    p_meal_type_ids,
    p_cuisine_ids,
    p_equipment_ids,
    p_ingredient_rows,
    p_instruction_steps,
    p_publication_id,
    p_publication_page,
    p_recipe_url,
    p_recipe_relationships,
    p_tag_ids,
    p_ingredient_sets,
    p_score,
    p_makes_quantity,
    p_makes_thing,
    p_nutrition_overrides,
    p_time_entries
  ) as saved;

  perform pg_catalog.set_config('app.recipe_prep_ahead_save_context', previous_context, true);
  perform pg_catalog.set_config('app.recipe_prep_ahead_markdown', previous_value, true);
end;
$$;

revoke all on function public.save_recipe_with_time_entries(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer, text, uuid[], uuid[],
  uuid[], jsonb, jsonb, uuid, text, text, jsonb, uuid[], jsonb, smallint, integer, text,
  jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.save_recipe_with_time_entries(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer, text, uuid[], uuid[],
  uuid[], jsonb, jsonb, uuid, text, text, jsonb, uuid[], jsonb, smallint, integer, text,
  jsonb, jsonb, text
) to authenticated;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)'::regprocedure
  );
  old_validation text := $old$
  if jsonb_typeof(recipe_payload->'p_recipe_relationships') is distinct from 'object'
    or jsonb_typeof(recipe_payload->'p_recipe_relationships'->'references')
      is distinct from 'array'
    or jsonb_typeof(recipe_payload->'p_equipment_names') is distinct from 'array'
  then
$old$;
  new_validation text := $new$
  if jsonb_typeof(recipe_payload->'p_recipe_relationships') is distinct from 'object'
    or jsonb_typeof(recipe_payload->'p_recipe_relationships'->'references')
      is distinct from 'array'
    or jsonb_typeof(recipe_payload->'p_equipment_names') is distinct from 'array'
    or (
      recipe_payload ? 'p_prep_ahead_markdown'
      and jsonb_typeof(recipe_payload->'p_prep_ahead_markdown') is distinct from 'string'
    )
  then
$new$;
  old_context text := $old$
  perform pg_catalog.set_config('app.public_recipe_copy_context', 'on', true);
  select saved.id into copied_recipe_id
$old$;
  new_context text := $new$
  perform pg_catalog.set_config(
    'app.recipe_prep_ahead_save_context',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'app.recipe_prep_ahead_markdown',
    coalesce(recipe_payload->>'p_prep_ahead_markdown', ''),
    true
  );
  perform pg_catalog.set_config('app.public_recipe_copy_context', 'on', true);
  select saved.id into copied_recipe_id
$new$;
  old_saved_check text := $old$  ) as saved;
  if copied_recipe_id is null then
$old$;
  new_saved_check text := $new$  ) as saved;
  perform pg_catalog.set_config('app.recipe_prep_ahead_save_context', '', true);
  perform pg_catalog.set_config('app.recipe_prep_ahead_markdown', '', true);
  if copied_recipe_id is null then
$new$;
  validation_occurrences integer;
  context_occurrences integer;
  saved_check_occurrences integer;
begin
  validation_occurrences :=
    (
      pg_catalog.length(function_definition) -
      pg_catalog.length(pg_catalog.replace(function_definition, old_validation, ''))
    ) / pg_catalog.length(old_validation);
  context_occurrences :=
    (
      pg_catalog.length(function_definition) -
      pg_catalog.length(pg_catalog.replace(function_definition, old_context, ''))
    ) / pg_catalog.length(old_context);
  saved_check_occurrences :=
    (
      pg_catalog.length(function_definition) -
      pg_catalog.length(pg_catalog.replace(function_definition, old_saved_check, ''))
    ) / pg_catalog.length(old_saved_check);
  if validation_occurrences <> 1
    or context_occurrences <> 1
    or saved_check_occurrences <> 1 then
    raise exception 'Expected public recipe copy fragments were not found.';
  end if;

  function_definition := pg_catalog.replace(function_definition, old_validation, new_validation);
  function_definition := pg_catalog.replace(function_definition, old_context, new_context);
  execute pg_catalog.replace(function_definition, old_saved_check, new_saved_check);
end;
$$;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
  );
  old_recipe_context text := $old$
    perform pg_catalog.set_config(
      'app.database_import_recipe_created_at',
      coalesce(record_data->>'created_at', ''),
      true
    );
    perform pg_catalog.set_config(
      'app.recipe_time_entries_before',
$old$;
  new_recipe_context text := $new$
    perform pg_catalog.set_config(
      'app.database_import_recipe_created_at',
      coalesce(record_data->>'created_at', ''),
      true
    );
    perform pg_catalog.set_config('app.recipe_prep_ahead_save_context', 'on', true);
    perform pg_catalog.set_config(
      'app.recipe_prep_ahead_markdown',
      coalesce(record_data->>'prep_ahead_markdown', ''),
      true
    );
    perform pg_catalog.set_config(
      'app.recipe_time_entries_before',
$new$;
  old_saved_check text := $old$
    set constraints public.recipe_history_after_save immediate;
    set constraints public.recipe_history_after_save deferred;
    perform pg_catalog.set_config('app.recipe_time_entries_before', '', true);
$old$;
  new_saved_check text := $new$
    perform pg_catalog.set_config('app.recipe_prep_ahead_save_context', '', true);
    perform pg_catalog.set_config('app.recipe_prep_ahead_markdown', '', true);
    set constraints public.recipe_history_after_save immediate;
    set constraints public.recipe_history_after_save deferred;
    perform pg_catalog.set_config('app.recipe_time_entries_before', '', true);
$new$;
  recipe_context_occurrences integer;
  saved_check_occurrences integer;
begin
  recipe_context_occurrences :=
    (
      pg_catalog.length(function_definition) -
      pg_catalog.length(pg_catalog.replace(function_definition, old_recipe_context, ''))
    ) / pg_catalog.length(old_recipe_context);
  saved_check_occurrences :=
    (
      pg_catalog.length(function_definition) -
      pg_catalog.length(pg_catalog.replace(function_definition, old_saved_check, ''))
    ) / pg_catalog.length(old_saved_check);
  if recipe_context_occurrences <> 1 or saved_check_occurrences <> 1 then
    raise exception 'Expected database import recipe fragments were not found.';
  end if;

  function_definition := pg_catalog.replace(
    function_definition,
    old_recipe_context,
    new_recipe_context
  );
  execute pg_catalog.replace(function_definition, old_saved_check, new_saved_check);
end;
$$;

notify pgrst, 'reload schema';
