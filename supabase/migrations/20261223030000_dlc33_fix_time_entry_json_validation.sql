do $$
declare
  function_source text;
  old_validation constant text :=
    $pattern$or jsonb_object_length(entry) <> 3$pattern$;
  new_validation constant text :=
    $pattern$or (case
        when jsonb_typeof(entry) is distinct from 'object' then false
        else entry - array['time_type_id', 'minutes', 'position'] <> '{}'::jsonb
      end)$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_recipe_with_time_entries(uuid,integer,text,uuid,text,uuid,uuid,text,text,integer,text,uuid[],uuid[],uuid[],jsonb,jsonb,uuid,text,text,jsonb,uuid[],jsonb,smallint,integer,text,jsonb,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_validation) = 0 then
    raise exception 'Expected recipe time-entry JSON validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_validation, new_validation);
end;
$$;
