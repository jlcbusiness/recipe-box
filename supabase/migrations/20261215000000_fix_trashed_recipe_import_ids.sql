create or replace function private.apply_database_import_recipe_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.database_import_context', true) = 'on' then
    if tg_op = 'INSERT' then
      new.id := nullif(current_setting('app.database_import_recipe_id', true), '')::uuid;
      new.created_at := coalesce(
        nullif(current_setting('app.database_import_recipe_created_at', true), '')::timestamptz,
        new.created_at
      );
    end if;
    new.is_private := coalesce(
      nullif(current_setting('app.database_import_recipe_is_private', true), '')::boolean,
      new.is_private
    );
  end if;
  return new;
end;
$$;

do $$
declare
  function_source text;
  old_recipe_save_context constant text :=
    $pattern$perform pg_catalog.set_config('app.recipe_save_context', 'on', true);$pattern$;
  new_recipe_save_context constant text :=
    $pattern$perform pg_catalog.set_config('app.database_import_context', 'off', true);
  perform pg_catalog.set_config('app.recipe_save_context', 'on', true);$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_recipe_save_context) = 0
    or pg_catalog.strpos(
      pg_catalog.replace(function_source, old_recipe_save_context, ''),
      old_recipe_save_context
    ) > 0 then
    raise exception 'Expected recipe save context step was not found exactly once';
  end if;

  execute pg_catalog.replace(
    function_source,
    old_recipe_save_context,
    new_recipe_save_context
  );
end;
$$;
