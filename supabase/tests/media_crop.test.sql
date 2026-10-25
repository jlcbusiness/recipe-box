begin;

set local role postgres;
set local search_path = extensions, public;

select plan(10);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'media-crop-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'media-crop-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into public.recipes (id, account_id, name, state)
values (
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  'Media crop authorization fixture',
  'want_to_try'
);

select set_config('app.recipe_lifecycle_context', 'on', true);

insert into public.media_assets (
  id,
  account_id,
  recipe_id,
  asset_type,
  status,
  full_path,
  thumbnail_path,
  content_type,
  byte_size,
  width,
  height,
  created_by_user_id
)
values (
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003',
  'recipe_photo',
  'ready',
  '20000000-0000-4000-8000-000000000001/recipes/20000000-0000-4000-8000-000000000003/full.webp',
  '20000000-0000-4000-8000-000000000001/recipes/20000000-0000-4000-8000-000000000003/thumb.webp',
  'image/webp',
  100,
  32,
  24,
  '20000000-0000-4000-8000-000000000001'
);

select set_config('app.recipe_lifecycle_context', 'off', true);

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

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.update_media_crop(
      '20000000-0000-4000-8000-000000000004',
      0,
      '{"left":0.1,"top":0.1,"width":0.5,"height":0.5,"rotation":0}'::jsonb
    )
  $$,
  'PT409',
  'The parent record changed in another session. Reload before saving framing.',
  'a stale parent version is rejected'
);

select is(
  (select version from public.update_media_crop(
    '20000000-0000-4000-8000-000000000004',
    1,
    '{"left":0.1,"top":0.1,"width":0.5,"height":0.5,"rotation":0}'::jsonb
  )),
  2,
  'an owner can save framing and the parent version increments'
);

select is(
  (select crop from public.media_assets
   where id = '20000000-0000-4000-8000-000000000004'),
  '{"left":0.1,"top":0.1,"width":0.5,"height":0.5,"rotation":0}'::jsonb,
  'the owner crop is persisted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select * from public.update_media_crop(
      '20000000-0000-4000-8000-000000000004',
      2,
      '{"left":0.2,"top":0.2,"width":0.4,"height":0.4,"rotation":0}'::jsonb
    )
  $$,
  'P0002',
  'The image is unavailable.',
  'another account cannot update the asset crop'
);

select * from finish();
rollback;