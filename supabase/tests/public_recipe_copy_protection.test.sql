begin;

set local role postgres;
set local search_path = extensions, public;

select plan(12);

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
    'Duplicate recipe',
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

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select set_config(
  'app.public_recipe_saved_from_public_id',
  '40000000-0000-4000-8000-000000000005',
  true
);
select set_config('app.public_recipe_copy_context', 'on', true);

select lives_ok(
  $$
    update public.recipes
    set saved_from_public_id = null
    where id = '40000000-0000-4000-8000-000000000002'
  $$,
  'a trusted direct save can set its saved-from marker'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"postgres"}', true);

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
      'source-user''s Duplicate recipe',
      'https://recipe-box.example/r/40000000-0000-4000-8000-000000000005',
      0,
      true,
      '40000000-0000-4000-8000-000000000005'
    )
  $$,
  'protected source attribution can be shared by distinct recipes'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    update public.recipes
    set saved_from_public_id = null
    where id = '40000000-0000-4000-8000-000000000003'
  $$,
  '23505',
  'An active direct save of this public recipe already exists.',
  'a second active direct-save marker is rejected'
);

set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000001"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select * from public.trash_recipe(
      '40000000-0000-4000-8000-000000000002',
      (select version from public.recipes where id = '40000000-0000-4000-8000-000000000002')
    )
  $$,
  'the direct saved recipe can be moved to Trash'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $$
    insert into public.recipes (
      id,
      account_id,
      name,
      state
    )
    values (
      '40000000-0000-4000-8000-000000000007',
      '40000000-0000-4000-8000-000000000001',
      'Replacement saved recipe',
      'want_to_try'
    )
  $$,
  'a new direct save is allowed while the previous marked recipe is trashed'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"postgres"}', true);

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
      '40000000-0000-4000-8000-000000000008',
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000007',
      'external_url',
      'source-user''s Replacement saved recipe',
      'https://recipe-box.example/r/40000000-0000-4000-8000-000000000005',
      0,
      true,
      '40000000-0000-4000-8000-000000000005'
    )
  $$,
  'the replacement direct save keeps the same protected attribution'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000001"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select * from public.restore_recipe(
      '40000000-0000-4000-8000-000000000002',
      (select version from public.recipes where id = '40000000-0000-4000-8000-000000000002')
    )
  $$,
  '23505',
  'An active direct save of this public recipe already exists.',
  'restoring an older direct save is blocked while a replacement is active'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"postgres"}', true);

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

select is(
  (
    select saved_from_public_id::text
    from public.recipes
    where id = '40000000-0000-4000-8000-000000000007'
  ),
  '40000000-0000-4000-8000-000000000005',
  'the replacement recipe retains its direct-save marker'
);

select * from finish();
rollback;
