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
    '90000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'private-print-photos-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'private-print-photos-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts'
      and column_name = 'include_instruction_photos_in_private_print'
      and is_nullable = 'NO'
      and column_default = 'true'
  ),
  'existing and new accounts default to printing instruction photos'
);

select is(
  (
    select count(*)::integer
    from public.accounts
    where id in (
      '90000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000002'
    )
      and include_instruction_photos_in_private_print
  ),
  2,
  'new account rows receive the enabled preference'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_account_unit_preferences(text, text, text, text, text, text, text, boolean, text, boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_account_unit_preferences(text, text, text, text, text, text, text, boolean, text, boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'public',
    'public.update_account_unit_preferences(text, text, text, text, text, text, text, boolean, text, boolean)',
    'EXECUTE'
  ),
  'only authenticated users can execute the owner-derived preference RPC'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

set local role authenticated;

select lives_ok(
  $$
    select public.update_account_unit_preferences(
      p_include_instruction_photos_in_private_print => false
    )
  $$,
  'an authenticated owner can turn off private print instruction photos'
);

select is(
  (
    select include_instruction_photos_in_private_print
    from public.accounts
    where id = '90000000-0000-4000-8000-000000000001'
  ),
  false,
  'the selected private print preference is stored'
);

select lives_ok(
  $$
    select public.update_account_unit_preferences(
      p_temperature_system => 'celsius'
    )
  $$,
  'unrelated preference updates remain available'
);

select is(
  (
    select include_instruction_photos_in_private_print
    from public.accounts
    where id = '90000000-0000-4000-8000-000000000001'
  ),
  false,
  'partial preference updates preserve the photo print choice'
);

set local role postgres;

select is(
  (
    select include_instruction_photos_in_private_print
    from public.accounts
    where id = '90000000-0000-4000-8000-000000000002'
  ),
  true,
  'one account cannot change another account preference'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    select public.commit_database_import_with_preferences(
      '90000000-0000-4000-8000-000000000001',
      '{"include_instruction_photos_in_private_print":"false"}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::uuid[],
      '{}'::uuid[]
    )
  $$,
  '23514',
  'Account preferences are invalid.',
  'database imports reject non-boolean photo print preferences'
);

select is(
  public.read_export_snapshot('90000000-0000-4000-8000-000000000001')
    #>> '{accountPreferences,include_instruction_photos_in_private_print}',
  'false',
  'database export snapshots include the saved photo print preference'
);

select * from finish();
rollback;