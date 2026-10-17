do $$
declare
  function_source text;
  old_actor_cleanup constant text :=
    $fragment$and (to_jsonb(old) - 'trashed_by_user_id' - 'updated_at')
      is not distinct from (to_jsonb(new) - 'trashed_by_user_id' - 'updated_at')$fragment$;
  new_actor_cleanup constant text := $fragment$and old.account_id is not distinct from new.account_id
    and old.publication_id is not distinct from new.publication_id
    and old.publication_page is not distinct from new.publication_page
    and old.recipe_url is not distinct from new.recipe_url
    and old.trashed_at is not distinct from new.trashed_at
    and old.publication_trash_id is not distinct from new.publication_trash_id
    and old.publication_trash_previous_page is not distinct from new.publication_trash_previous_page
    and old.publication_trash_previous_url is not distinct from new.publication_trash_previous_url$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_recipe_publication_context()'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_actor_cleanup) = 0
    or (pg_catalog.length(function_source) - pg_catalog.length(
      pg_catalog.replace(function_source, old_actor_cleanup, '')
    )) <> pg_catalog.length(old_actor_cleanup) then
    raise exception 'Could not safely narrow Auth recipe actor cleanup.';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_actor_cleanup,
    new_actor_cleanup
  );

  execute function_source;
end;
$$;