do $$
declare
  function_source text;
  matching_functions integer;
  old_duplicate_validation constant text :=
    $pattern$  if (
    select count(*) <> count(distinct (
      (item.value->>'ingredient_set_id')::uuid,
      lower(normalize(btrim(coalesce(
        canonical.name,
        nullif(item.value->>'ingredient_name', '')
      )), NFKC))
    ))
    from jsonb_array_elements(p_ingredient_rows) as item(value)
    left join public.ingredients as canonical
      on canonical.account_id = owner_id
      and canonical.id = nullif(item.value->>'ingredient_id', '')::uuid
  ) then
    raise exception 'An ingredient can appear only once in each section.' using errcode = '23505';
  end if;$pattern$;
  new_duplicate_validation constant text :=
    $pattern$  if (
    select count(*) <> count(distinct (
      (item.value->>'ingredient_set_id')::uuid,
      lower(normalize(btrim(coalesce(
        canonical.name,
        nullif(item.value->>'ingredient_name', '')
      )), NFKC)),
      lower(normalize(btrim(coalesce(item.value->>'detail', '')), NFKC))
    ))
    from jsonb_array_elements(p_ingredient_rows) as item(value)
    left join public.ingredients as canonical
      on canonical.account_id = owner_id
      and canonical.id = nullif(item.value->>'ingredient_id', '')::uuid
  ) then
    raise exception 'An ingredient with the same name and detail can appear only once in each section.'
      using errcode = '23505';
  end if;$pattern$;
begin
  select count(*)
  into matching_functions
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'save_recipe_with_ingredient_sets';

  if matching_functions <> 1 then
    raise exception 'Expected one recipe save function while updating ingredient uniqueness';
  end if;

  select pg_catalog.pg_get_functiondef(proc.oid)
  into function_source
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'save_recipe_with_ingredient_sets';

  if pg_catalog.strpos(function_source, old_duplicate_validation) = 0 then
    raise exception 'Expected recipe save ingredient uniqueness validation was not found';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_duplicate_validation,
    new_duplicate_validation
  );
  execute function_source;
end;
$$;
