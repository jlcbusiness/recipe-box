begin;

set local role postgres;
set local search_path = extensions, public;

select plan(4);

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
  '51000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'ingredient-variants@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.recipes (id, account_id, name, state)
values (
  '51000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000001',
  'Mustard chicken',
  'want_to_try'
);

insert into public.ingredients (id, account_id, name)
values (
  '51000000-0000-4000-8000-000000000003',
  '51000000-0000-4000-8000-000000000001',
  'Mustard'
);

update public.recipe_ingredient_sets
set id = '51000000-0000-4000-8000-000000000004'
where account_id = '51000000-0000-4000-8000-000000000001'
  and recipe_id = '51000000-0000-4000-8000-000000000002'
  and label = 'Main';

select lives_ok(
  $$
    insert into public.recipe_ingredients (
      account_id, recipe_id, ingredient_id, ingredient_set_id, position, detail
    )
    values
      (
        '51000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000002',
        '51000000-0000-4000-8000-000000000003',
        '51000000-0000-4000-8000-000000000004',
        0,
        'Dijon'
      ),
      (
        '51000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000002',
        '51000000-0000-4000-8000-000000000003',
        '51000000-0000-4000-8000-000000000004',
        1,
        'whole-grain'
      )
  $$,
  'same ingredient can appear with distinct details in one section'
);

set constraints recipe_ingredients_account_set_ingredient_detail_key immediate;

select throws_ok(
  $$
    insert into public.recipe_ingredients (
      account_id, recipe_id, ingredient_id, ingredient_set_id, position, detail
    )
    values (
      '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000003',
      '51000000-0000-4000-8000-000000000004',
      2,
      'Dijon'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "recipe_ingredients_account_set_ingredient_detail_key"',
  'same ingredient with the same detail cannot be repeated in one section'
);

select is(
  (
    select count(*)::integer
    from public.recipe_ingredients
    where recipe_id = '51000000-0000-4000-8000-000000000002'
  ),
  2,
  'both distinct mustard variants remain saved'
);

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select * from public.save_recipe_with_time_entries(
      null,
      null,
      'Mustard variants',
      null::uuid,
      'want_to_try',
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::integer,
      '',
      array[]::uuid[],
      array[]::uuid[],
      array[]::uuid[],
      jsonb_build_array(
        jsonb_build_object(
          'recipe_ingredient_id', '51000000-0000-4000-8000-000000000006',
          'ingredient_id', '51000000-0000-4000-8000-000000000003',
          'ingredient_set_id', '51000000-0000-4000-8000-000000000005',
          'detail', 'Dijon',
          'nutrition_serving_size_override', null,
          'nutrition_overrides', '{}'::jsonb,
          'measurements', '[]'::jsonb
        ),
        jsonb_build_object(
          'recipe_ingredient_id', '51000000-0000-4000-8000-000000000007',
          'ingredient_id', '51000000-0000-4000-8000-000000000003',
          'ingredient_set_id', '51000000-0000-4000-8000-000000000005',
          'detail', 'whole-grain',
          'nutrition_serving_size_override', null,
          'nutrition_overrides', '{}'::jsonb,
          'measurements', '[]'::jsonb
        )
      ),
      '[]'::jsonb,
      null::uuid,
      null::text,
      null::text,
      '{"site_listing":null,"pairings":[],"references":[]}'::jsonb,
      array[]::uuid[],
      jsonb_build_array(jsonb_build_object(
        'id', '51000000-0000-4000-8000-000000000005',
        'label', 'Main',
        'position', 0
      )),
      null::smallint,
      null::integer,
      null::text,
      '{}'::jsonb,
      '[]'::jsonb
    )
  $$,
  'the save RPC permits same-name ingredients with different details'
);

select * from finish();

rollback;
