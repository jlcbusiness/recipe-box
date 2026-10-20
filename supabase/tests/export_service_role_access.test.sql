begin;

set local search_path = extensions, public;

select plan(2);

select ok(
  exists (
    select 1
    from pg_attribute as column_metadata
    cross join lateral aclexplode(column_metadata.attacl) as privilege
    where column_metadata.attrelid = 'public.accounts'::regclass
      and column_metadata.attname = 'last_database_export_at'
      and privilege.grantee = 'service_role'::regrole
      and privilege.privilege_type = 'UPDATE'
  ),
  'service_role has an explicit grant to update the export timestamp'
);

select ok(
  not exists (
    select 1
    from pg_attribute as column_metadata
    cross join lateral aclexplode(column_metadata.attacl) as privilege
    where column_metadata.attrelid = 'public.accounts'::regclass
      and column_metadata.attname = 'id'
      and privilege.grantee = 'service_role'::regrole
      and privilege.privilege_type = 'UPDATE'
  ),
  'service_role receives no explicit update grant on account identity'
);

select * from finish();
rollback;