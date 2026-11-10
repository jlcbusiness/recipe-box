begin;

set local role postgres;
set local search_path = extensions, public;

select plan(8);

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
  '40000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'public-recipe-copy-protection@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.recipes (id, account_id, name, state)
values
  (
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    'Saved public recipe',
    'want_to_try'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000001',
    'Other recipe',
    'want_to_try'
  );

insert into public.recipe_references (
  id,
  account_id,
  recipe_id,
  reference_type,
  display_text,
  url,
  position,
  is_protected_source,
  source_public_id
)
values (
  '40000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  'external_url',
  'source-user''s Saved public recipe',
  'https://recipe-box.example/r/40000000-0000-4000-8000-000000000005',
  0,
  true,
  '40000000-0000-4000-8000-000000000005'
);

select throws_ok(
  $$
    update public.recipe_references
    set display_text = 'Changed attribution'
    where id = '40000000-0000-4000-8000-000000000004'
  $$,
  '23514',
  'Protected source attribution cannot be changed while its recipe exists.',
  'protected source attribution cannot be edited'
);

select throws_ok(
  $$
    delete from public.recipe_references
    where id = '40000000-0000-4000-8000-000000000004'
  $$,
  '23514',
  'Protected source attribution cannot be changed while its recipe exists.',
  'protected source attribution cannot be deleted'
);

select throws_ok(
  $$
    insert into public.recipe_references (
      account_id,
      recipe_id,
      reference_type,
      display_text,
      url,
      position,
      is_protected_source,
      source_public_id
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'external_url',
      'Duplicate source',
      'https://recipe-box.example/r/40000000-0000-4000-8000-000000000005',
      0,
      true,
      '40000000-0000-4000-8000-000000000005'
    )
  $$,
  '23505',
  'An active copy of this public recipe already exists.',
  'an account cannot create a second active copy of a public source'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select * from public.trash_recipe(
      '40000000-0000-4000-8000-000000000002',
      1
    )
  $$,
  'an active copy can be moved to Trash'
);

select lives_ok(
  $$
    insert into public.recipe_references (
      id,
      account_id,
      recipe_id,
      reference_type,
      display_text,
      url,
      position,
      is_protected_source,
      source_public_id
    )
    values (
      '40000000-0000-4000-8000-000000000006',
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'external_url',
      'source-user''s Replacement recipe',
      'https://recipe-box.example/r/40000000-0000-4000-8000-000000000005',
      0,
      true,
      '40000000-0000-4000-8000-000000000005'
    )
  $$,
  'a fresh active copy can coexist with its trashed predecessor'
);

select throws_ok(
  $$
    select * from public.restore_recipe(
      '40000000-0000-4000-8000-000000000002',
      2
    )
  $$,
  '23505',
  'An active copy of this public recipe already exists.',
  'restoring an old copy is blocked while a replacement is active'
);

select lives_ok(
  $$
    delete from public.recipes
    where id = '40000000-0000-4000-8000-000000000002'
  $$,
  'deleting the copied recipe is allowed'
);

select ok(
  not exists (
    select 1
    from public.recipe_references
    where id = '40000000-0000-4000-8000-000000000004'
  ),
  'deleting the copied recipe cascades to its protected source attribution'
);

select * from finish();
rollback;
