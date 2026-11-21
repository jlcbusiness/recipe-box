begin;

set local role postgres;
set local search_path = extensions, public;

select plan(10);

select has_column(
  'public',
  'recipes',
  'prep_ahead_markdown',
  'recipes have a dedicated Prep ahead field'
);

select ok(
  (
    select is_nullable = 'NO' and column_default is not null
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'prep_ahead_markdown'
  ),
  'Prep ahead is non-null and defaults to empty text'
);

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
  '94800000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'dlc48-prep-ahead-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select set_config('request.jwt.claim.sub', '94800000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select * from public.save_recipe_with_time_entries(
      null,
      null,
      'DLC 48 legacy fixture',
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
      '[]'::jsonb,
      '[]'::jsonb,
      null::uuid,
      null::text,
      null::text,
      '{"site_listing":null,"pairings":[],"references":[]}'::jsonb,
      array[]::uuid[],
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
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
  'the existing save RPC remains compatible'
);

select is(
  (
    select prep_ahead_markdown
    from public.recipes
    where account_id = '94800000-0000-4000-8000-000000000001'
      and name = 'DLC 48 legacy fixture'
  ),
  '',
  'legacy recipe saves receive the empty default'
);

create function pg_temp.save_prep_ahead_fixture(
  target_recipe_id uuid,
  expected_version integer,
  recipe_name text,
  prep_ahead_markdown text
)
returns table (id uuid, version integer)
language sql
as $$
  select *
  from public.save_recipe_with_time_entries(
    target_recipe_id,
    expected_version,
    recipe_name,
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
    '[]'::jsonb,
    '[]'::jsonb,
    null::uuid,
    null::text,
    null::text,
    '{"site_listing":null,"pairings":[],"references":[]}'::jsonb,
    array[]::uuid[],
    jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'label', 'Main',
      'position', 0
    )),
    null::smallint,
    null::integer,
    null::text,
    '{}'::jsonb,
    '[]'::jsonb,
    prep_ahead_markdown
  );
$$;

select lives_ok(
  $$
    select * from pg_temp.save_prep_ahead_fixture(
      null,
      null,
      'DLC 48 prep fixture',
      'Thaw overnight.'
    )
  $$,
  'the extended save RPC stores Prep ahead'
);

set constraints public.recipe_history_after_save immediate;

select ok(
  (
    select recipe.prep_ahead_markdown = 'Thaw overnight.'
      and history.after_data->>'prep_ahead_markdown' = 'Thaw overnight.'
    from public.recipes as recipe
    join public.recipe_history as history
      on history.record_id = recipe.id
      and history.event_type = 'recipe.created'
    where recipe.account_id = '94800000-0000-4000-8000-000000000001'
      and recipe.name = 'DLC 48 prep fixture'
  ),
  'recipe history captures the initial Prep ahead value'
);

select lives_ok(
  $$
    select * from pg_temp.save_prep_ahead_fixture(
      (
        select id
        from public.recipes
        where account_id = '94800000-0000-4000-8000-000000000001'
          and name = 'DLC 48 prep fixture'
      ),
      1,
      'DLC 48 prep fixture',
      'Marinate for eight hours.'
    )
  $$,
  'the extended save RPC updates Prep ahead'
);

set constraints public.recipe_history_after_save immediate;

select ok(
  exists (
    select 1
    from public.recipe_history
    where record_id = (
      select id
      from public.recipes
      where account_id = '94800000-0000-4000-8000-000000000001'
        and name = 'DLC 48 prep fixture'
    )
      and event_type = 'recipe.updated'
      and before_data->>'prep_ahead_markdown' = 'Thaw overnight.'
      and after_data->>'prep_ahead_markdown' = 'Marinate for eight hours.'
  ),
  'recipe history captures both Prep ahead values on update'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
    ),
    'prep_ahead_markdown'
  ) > 0,
  'database imports pass Prep ahead to the recipe save path'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.save_public_recipe_copy(uuid,uuid,text,jsonb,jsonb)'::regprocedure
    ),
    'p_prep_ahead_markdown'
  ) > 0,
  'public recipe copies pass the allow-listed Prep ahead value'
);

select * from finish();
rollback;
