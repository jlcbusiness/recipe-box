do $$
declare
  function_source text;
  function_record record;
  old_exception constant text := 'using errcode = ''40001'';';
  new_exception constant text := 'using errcode = ''PT409'';';
  updated_count integer := 0;
begin
  for function_record in
    select pg_catalog.pg_get_functiondef(routine.oid) as definition
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as proc_schema on proc_schema.oid = routine.pronamespace
    where proc_schema.nspname = 'public'
      and routine.prokind = 'f'
      and pg_catalog.strpos(pg_catalog.pg_get_functiondef(routine.oid), old_exception) > 0
    order by routine.oid
  loop
    function_source := pg_catalog.replace(
      function_record.definition,
      old_exception,
      new_exception
    );
    execute function_source;
    updated_count := updated_count + 1;
  end loop;

  if updated_count = 0 then
    raise exception 'No public functions using retryable custom SQLSTATE 40001 were found.';
  end if;
end;
$$;