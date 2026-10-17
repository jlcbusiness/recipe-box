do $$
declare
  function_source text;
  old_recipe_tin_check constant text :=
    $fragment$when recipe.publication_id is null then$fragment$;
  new_recipe_tin_check constant text :=
    $fragment$when recipe.publication_id is null
          or recipe.publication_id = private.ensure_recipe_tin(owner_id) then$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.restore_publication(uuid,integer)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_recipe_tin_check) = 0
    or (pg_catalog.length(function_source) - pg_catalog.length(
      pg_catalog.replace(function_source, old_recipe_tin_check, '')
    )) <> pg_catalog.length(old_recipe_tin_check) * 2 then
    raise exception 'Could not safely update Recipe Tin publication restore provenance.';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_recipe_tin_check,
    new_recipe_tin_check
  );

  execute function_source;
end;
$$;