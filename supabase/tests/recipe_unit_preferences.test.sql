begin;

set local role postgres;
set local search_path = extensions, public;

select plan(15);

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
    '29000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'recipe-unit-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '29000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'recipe-unit-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

select is(
  (select volume_system from public.accounts where id = '29000000-0000-4000-8000-000000000001'),
  'us_customary',
  'new accounts retain the existing volume default'
);

select is(
  (select weight_system from public.accounts where id = '29000000-0000-4000-8000-000000000001'),
  'us_customary',
  'new accounts retain the existing weight default'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_account_unit_preferences(text, text, text, text, text, text, text, boolean, text, boolean, boolean, boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_account_unit_preferences(text, text, text, text, text, text, text, boolean, text, boolean, boolean, boolean)',
    'EXECUTE'
  ),
  'the owner-derived preference RPC remains authenticated-only'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"29000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.update_account_unit_preferences(p_volume_system => 'recipe')$$,
  'an owner can select Recipe for Volume'
);

select is(
  (select volume_system from public.accounts where id = '29000000-0000-4000-8000-000000000001'),
  'recipe',
  'the Recipe volume preference is stored'
);

select is(
  (select weight_system from public.accounts where id = '29000000-0000-4000-8000-000000000001'),
  'us_customary',
  'saving Volume leaves Weight unchanged'
);

select lives_ok(
  $$select public.update_account_unit_preferences(p_weight_system => 'recipe')$$,
  'an owner can select Recipe for Weight'
);

select is(
  (select weight_system from public.accounts where id = '29000000-0000-4000-8000-000000000001'),
  'recipe',
  'the Recipe weight preference is stored'
);

select is(
  (select volume_system from public.accounts where id = '29000000-0000-4000-8000-000000000001'),
  'recipe',
  'saving Weight leaves Volume unchanged'
);

select throws_ok(
  $$select public.update_account_unit_preferences(p_volume_system => 'imperial', p_weight_system => 'metric')$$,
  'P0001',
  'Unsupported volume measurement system',
  'unsupported volume preferences are rejected'
);

select is(
  (
    select volume_system || '/' || weight_system
    from public.accounts
    where id = '29000000-0000-4000-8000-000000000001'
  ),
  'recipe/recipe',
  'invalid Volume does not partially update either preference'
);

select throws_ok(
  $$select public.update_account_unit_preferences(p_volume_system => 'metric', p_weight_system => 'imperial')$$,
  'P0001',
  'Unsupported weight measurement system',
  'unsupported weight preferences are rejected'
);

select is(
  (
    select volume_system || '/' || weight_system
    from public.accounts
    where id = '29000000-0000-4000-8000-000000000001'
  ),
  'recipe/recipe',
  'invalid Weight does not partially update either preference'
);

set local role postgres;

select is(
  (
    select volume_system
    from public.accounts
    where id = '29000000-0000-4000-8000-000000000002'
  ),
  'us_customary',
  'one account cannot change another account Volume preference'
);

select is(
  (
    select weight_system
    from public.accounts
    where id = '29000000-0000-4000-8000-000000000002'
  ),
  'us_customary',
  'one account cannot change another account Weight preference'
);

select * from finish();
rollback;
