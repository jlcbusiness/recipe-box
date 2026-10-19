begin;

select plan(1);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as proc_schema on proc_schema.oid = routine.pronamespace
    where proc_schema.nspname = 'public'
      and routine.prokind = 'f'
      and pg_catalog.strpos(routine.prosrc, 'using errcode = ''40001''') > 0
  ),
  'public functions do not raise retryable custom SQLSTATE 40001'
);

select * from finish();

rollback;