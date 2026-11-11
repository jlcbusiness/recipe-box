do $$
declare
  function_source text;
  old_validation constant text :=
    $pattern$if jsonb_object_length(time_entry) <> 3$pattern$;
  new_validation constant text :=
    $pattern$if (case
        when jsonb_typeof(time_entry) is distinct from 'object' then false
        else time_entry - array['time_type', 'minutes', 'position'] <> '{}'::jsonb
      end)$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_public_recipe_copy(uuid,uuid,text,jsonb,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_validation) = 0 then
    raise exception 'Expected public-copy time-entry JSON validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_validation, new_validation);
end;
$$;
