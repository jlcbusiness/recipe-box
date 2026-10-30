do $$
declare
  function_source text;
  old_width_check constant text :=
    $pattern$(v_column.key <> 'name' and (v_width < 96 or v_width > 600))$pattern$;
  new_width_check constant text :=
    $pattern$(v_column.key = 'score' and (v_width < 64 or v_width > 120))
      or (v_column.key in ('starred', 'hearted') and (v_width < 56 or v_width > 96))
      or (v_column.key not in ('name', 'score', 'starred', 'hearted')
        and (v_width < 96 or v_width > 600))$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_with_legacy_validation(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_width_check) = 0 then
    raise exception 'Expected explorer column-width validation was not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_width_check, new_width_check);
  execute function_source;
end;
$$;
