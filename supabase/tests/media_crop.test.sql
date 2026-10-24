begin;

set local role postgres;
set local search_path = extensions, public;

select plan(6);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'media_assets'
      and column_name = 'crop'
      and is_nullable = 'YES'
  ),
  'media framing is nullable so existing assets default to Fit'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as proc_schema on proc_schema.oid = routine.pronamespace
    where proc_schema.nspname = 'public'
      and routine.proname = 'update_media_crop'
      and pg_catalog.pg_get_function_identity_arguments(routine.oid) =
        'p_asset_id uuid, p_expected_version integer, p_crop jsonb'
  ),
  'framing changes use the version-checked media RPC'
);

select ok(
  position(
    'rotation' in (
      select pg_catalog.pg_get_constraintdef(constraint_row.oid)
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid = 'public.media_assets'::regclass
        and constraint_row.conname = 'media_assets_crop_valid'
    )
  ) > 0,
  'stored framing validates its quarter-turn rotation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_media_crop(uuid, integer, jsonb)',
    'EXECUTE'
  ),
  'authenticated owners can request framing changes'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_media_crop(uuid, integer, jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'public',
    'public.update_media_crop(uuid, integer, jsonb)',
    'EXECUTE'
  ),
  'anonymous and public roles cannot request framing changes'
);

select ok(
  (select relrowsecurity
   from pg_catalog.pg_class
   where oid = 'public.media_assets'::regclass)
  and not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'media_assets'
      and cmd in ('UPDATE', 'ALL')
      and roles @> array['authenticated']::name[]
  ),
  'RLS keeps authenticated users from directly changing media metadata'
);

select * from finish();
rollback;