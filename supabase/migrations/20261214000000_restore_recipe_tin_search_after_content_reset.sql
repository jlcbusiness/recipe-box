do $$
declare
  function_source text;
  old_recipe_tin_step constant text :=
    $pattern$perform private.ensure_recipe_tin(owner_id);$pattern$;
  new_recipe_tin_step constant text :=
    $pattern$perform private.refresh_publication_search_document(
    owner_id,
    private.ensure_recipe_tin(owner_id)
  );$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.reset_account_content(uuid,text)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_recipe_tin_step) = 0
    or pg_catalog.strpos(
      pg_catalog.replace(function_source, old_recipe_tin_step, ''),
      old_recipe_tin_step
    ) > 0 then
    raise exception 'Expected Recipe Tin reset step was not found exactly once';
  end if;

  execute pg_catalog.replace(function_source, old_recipe_tin_step, new_recipe_tin_step);
end;
$$;

do $$
declare
  missing_collection record;
begin
  for missing_collection in
    select publication.account_id, publication.id
    from public.publications as publication
    where publication.publication_type = 'collection'
      and not exists (
        select 1
        from public.publication_search_documents as search_document
        where search_document.account_id = publication.account_id
          and search_document.publication_id = publication.id
      )
  loop
    perform private.refresh_publication_search_document(
      missing_collection.account_id,
      missing_collection.id
    );
  end loop;
end;
$$;
