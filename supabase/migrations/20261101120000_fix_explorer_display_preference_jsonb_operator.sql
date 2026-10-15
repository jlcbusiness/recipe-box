do $$
declare
  function_source text;
  old_expression constant text :=
    'v_legacy_widths := v_preferences->''column_widths'' - ''citation'';';
  new_expression constant text :=
    'v_legacy_widths := (v_preferences->''column_widths'') - ''citation''::text;';
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_expression) = 0 then
    raise exception 'Expected explorer preference compatibility expression was not found';
  end if;

  execute pg_catalog.replace(function_source, old_expression, new_expression);
end;
$$;