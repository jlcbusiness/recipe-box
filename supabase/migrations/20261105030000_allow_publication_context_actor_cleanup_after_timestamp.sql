do $$
declare
  function_source text;
  old_actor_cleanup constant text :=
    $fragment$and (to_jsonb(old) - 'trashed_by_user_id')
      is not distinct from (to_jsonb(new) - 'trashed_by_user_id')$fragment$;
  new_actor_cleanup constant text :=
    $fragment$and (to_jsonb(old) - 'trashed_by_user_id' - 'updated_at')
      is not distinct from (to_jsonb(new) - 'trashed_by_user_id' - 'updated_at')$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_recipe_publication_context()'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_actor_cleanup) = 0
    or (pg_catalog.length(function_source) - pg_catalog.length(
      pg_catalog.replace(function_source, old_actor_cleanup, '')
    )) <> pg_catalog.length(old_actor_cleanup) then
    raise exception 'Could not safely update Auth recipe actor cleanup.';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_actor_cleanup,
    new_actor_cleanup
  );

  execute function_source;
end;
$$;