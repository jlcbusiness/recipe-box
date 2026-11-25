begin;

set local role postgres;
set local search_path = extensions, public;

select plan(3);

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

insert into public.recipe_ingredient_sets (
  id, account_id, recipe_id, label, position
)
values (
  '51000000-0000-4000-8000-000000000004',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  'Main',
  0
);

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

select * from finish();

rollback;
