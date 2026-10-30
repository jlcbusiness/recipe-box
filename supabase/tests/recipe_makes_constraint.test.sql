begin;

set local role postgres;
set local search_path = extensions, public;

select plan(6);

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
values (
  '30000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'recipe-makes-constraint@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select lives_ok(
  $$
    insert into public.recipes (
      id, account_id, name, state, makes_quantity, makes_thing
    )
    values (
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      'Recipe without Makes',
      'want_to_try',
      null,
      null
    )
  $$,
  'a recipe can omit both Makes values'
);

select lives_ok(
  $$
    insert into public.recipes (
      id, account_id, name, state, makes_quantity, makes_thing
    )
    values (
      '30000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      'Recipe with Makes',
      'want_to_try',
      3,
      'baby cakes'
    )
  $$,
  'a recipe can save a complete Makes pair'
);

select throws_ok(
  $$
    insert into public.recipes (
      id, account_id, name, state, makes_quantity, makes_thing
    )
    values (
      '30000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      'Recipe with thing only',
      'want_to_try',
      null,
      'baby cakes'
    )
  $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_makes_pair_check"',
  'a thing without a quantity is rejected'
);

select throws_ok(
  $$
    insert into public.recipes (
      id, account_id, name, state, makes_quantity, makes_thing
    )
    values (
      '30000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000001',
      'Recipe with quantity only',
      'want_to_try',
      3,
      null
    )
  $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_makes_pair_check"',
  'a quantity without a thing is rejected'
);

select throws_ok(
  $$
    insert into public.recipes (
      id, account_id, name, state, makes_quantity, makes_thing
    )
    values (
      '30000000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000001',
      'Recipe with blank thing',
      'want_to_try',
      3,
      '   '
    )
  $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_makes_pair_check"',
  'a blank Makes thing is rejected'
);

select throws_ok(
  $$
    insert into public.recipes (
      id, account_id, name, state, makes_quantity, makes_thing
    )
    values (
      '30000000-0000-4000-8000-000000000007',
      '30000000-0000-4000-8000-000000000001',
      'Recipe with zero quantity',
      'want_to_try',
      0,
      'baby cakes'
    )
  $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_makes_pair_check"',
  'a non-positive Makes quantity is rejected'
);

select * from finish();
rollback;
