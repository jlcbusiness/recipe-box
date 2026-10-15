do $$
declare
  function_source text;
  old_expression constant text := 'p_state->''column_filters'' - v_source_fields';
  new_expression constant text := '(p_state->''column_filters'') - v_source_fields';
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_expression) = 0 then
    raise exception 'Expected explorer column filter expression was not found';
  end if;

  execute pg_catalog.replace(function_source, old_expression, new_expression);
end;
$$;