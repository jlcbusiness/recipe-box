alter table public.recipe_ingredients
  add column alternate_note text not null default '';

do $$
declare
  function_source text;
  old_declaration constant text := $pattern$  row_detail text;
  row_preparation text;$pattern$;
  new_declaration constant text := $pattern$  row_detail text;
  row_alternate_note text;
  row_preparation text;$pattern$;
  old_before_snapshot constant text :=
    $pattern$          'detail', recipe_ingredient.detail,
          'preparation', recipe_ingredient.preparation,$pattern$;
  new_before_snapshot constant text :=
    $pattern$          'detail', recipe_ingredient.detail,
          'alternate_note', recipe_ingredient.alternate_note,
          'preparation', recipe_ingredient.preparation,$pattern$;
  old_parse constant text := $pattern$    row_detail := trim(coalesce(row_data->>'detail', ''));
    row_preparation := trim(coalesce(row_data->>'preparation', ''));$pattern$;
  new_parse constant text :=
    $pattern$    row_detail := trim(coalesce(row_data->>'detail', ''));
    row_alternate_note := trim(coalesce(row_data->>'alternate_note', ''));
    row_preparation := trim(coalesce(row_data->>'preparation', ''));$pattern$;
  old_insert constant text :=
    $pattern$      account_id, recipe_id, ingredient_id, position, is_main, detail, preparation
    )
    values (
      owner_id, saved_id, resolved_ingredient_id, row_position,
      row_is_main, row_detail, row_preparation
    )$pattern$;
  new_insert constant text :=
    $pattern$      account_id, recipe_id, ingredient_id, position, is_main, detail,
      alternate_note, preparation
    )
    values (
      owner_id, saved_id, resolved_ingredient_id, row_position,
      row_is_main, row_detail, row_alternate_note, row_preparation
    )$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_recipe(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,jsonb,uuid[],uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_declaration) = 0
    or pg_catalog.strpos(function_source, old_before_snapshot) = 0
    or pg_catalog.strpos(function_source, old_parse) = 0
    or pg_catalog.strpos(function_source, old_insert) = 0 then
    raise exception 'Expected recipe ingredient note save fragments were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_declaration, new_declaration);
  function_source := pg_catalog.replace(function_source, old_before_snapshot, new_before_snapshot);
  function_source := pg_catalog.replace(function_source, old_parse, new_parse);
  function_source := pg_catalog.replace(function_source, old_insert, new_insert);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_snapshot constant text :=
    $pattern$    'detail', recipe_ingredient.detail,
    'preparation', recipe_ingredient.preparation,$pattern$;
  new_snapshot constant text :=
    $pattern$    'detail', recipe_ingredient.detail,
    'alternate_note', recipe_ingredient.alternate_note,
    'preparation', recipe_ingredient.preparation,$pattern$;
begin
  select pg_catalog.pg_get_functiondef('public.recipe_history_after_save()'::regprocedure)
  into function_source;

  if pg_catalog.strpos(function_source, old_snapshot) = 0 then
    raise exception 'Expected recipe history ingredient snapshot was not found';
  end if;

  execute pg_catalog.replace(function_source, old_snapshot, new_snapshot);
end;
$$;

do $$
declare
  function_source text;
  old_snapshot constant text :=
    $pattern$        'detail', recipe_ingredient.detail,
        'preparation', recipe_ingredient.preparation,$pattern$;
  new_snapshot constant text :=
    $pattern$        'detail', recipe_ingredient.detail,
        'alternate_note', recipe_ingredient.alternate_note,
        'preparation', recipe_ingredient.preparation,$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.recipe_ingredient_history_snapshot(uuid,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_snapshot) = 0 then
    raise exception 'Expected private ingredient history snapshot was not found';
  end if;

  execute pg_catalog.replace(function_source, old_snapshot, new_snapshot);
end;
$$;

do $$
declare
  function_source text;
  old_import_row constant text :=
    $pattern$          'detail', ingredient->'detail',
          'preparation', ingredient->'preparation',$pattern$;
  new_import_row constant text :=
    $pattern$          'detail', ingredient->'detail',
          'alternate_note', coalesce(ingredient->'alternate_note', '""'::jsonb),
          'preparation', ingredient->'preparation',$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_import_row) = 0 then
    raise exception 'Expected database import ingredient mapping was not found';
  end if;

  execute pg_catalog.replace(function_source, old_import_row, new_import_row);
end;
$$;
