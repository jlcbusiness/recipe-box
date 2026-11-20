do $$
declare
  target_function regprocedure :=
    'public.save_public_recipe_copy(uuid, uuid, text, jsonb, jsonb)'::regprocedure;
  function_definition text;
  old_lookup text := $old$
  select recipe.id into existing_recipe_id
  from public.recipes as recipe
  where recipe.account_id = destination_id
    and recipe.saved_from_public_id = requested_source_public_id
    and recipe.trashed_at is null;
$old$;
  new_lookup text := $new$
  if exists (
    select 1
    from public.recipes as source_row
    where source_row.public_id = requested_source_public_id
      and source_row.account_id = destination_id
      and not source_row.is_private
      and source_row.trashed_at is null
  ) then
    raise exception 'You already have this recipe. Use "copy" if you wish a duplicate.'
      using errcode = 'PT409';
  end if;

  select recipe.id into existing_recipe_id
  from public.recipes as recipe
  where recipe.account_id = destination_id
    and recipe.saved_from_public_id = requested_source_public_id
    and recipe.trashed_at is null;
$new$;
  occurrence_count integer;
begin
  select pg_catalog.pg_get_functiondef(target_function)
  into function_definition;

  occurrence_count :=
    (length(function_definition) - length(replace(function_definition, old_lookup, '')))
      / length(old_lookup);
  if occurrence_count <> 1 then
    raise exception 'Expected exactly one active direct-save lookup fragment.';
  end if;

  execute replace(function_definition, old_lookup, new_lookup);
end;
$$;
