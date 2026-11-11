begin;

set local role postgres;
set local search_path = extensions, public;

select plan(22);

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
    '93000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'dlc33-times-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'dlc33-times-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

create function pg_temp.save_time_fixture(
  target_recipe_id uuid,
  expected_version integer,
  recipe_name text,
  time_entries jsonb
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
      'id', '93000000-0000-4000-8000-000000000099',
      'label', 'Main',
      'position', 0
    )),
    null::smallint,
    null::integer,
    null::text,
    '{}'::jsonb,
    time_entries
  );
$$;

select is(
  (select count(*)::integer
   from public.recipe_picklist_values
   where account_id = '93000000-0000-4000-8000-000000000001'
     and category = 'time_type'),
  9,
  'an account receives the nine default Time Types'
);

select is(
  (select array_agg(value order by sort_order)
   from public.recipe_picklist_values
   where account_id = '93000000-0000-4000-8000-000000000001'
     and category = 'time_type'),
  array['Prep', 'Mixing', 'Marinate', 'Chill', 'Freeze', 'Cook', 'Bake', 'Cooling', 'Rest']::text[],
  'default Time Types retain their defined order'
);

select is(
  (select count(*)::integer
   from public.recipe_picklist_values
   where account_id = '93000000-0000-4000-8000-000000000002'
     and category = 'time_type'),
  9,
  'Time Types are seeded independently for each account'
);

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select * from pg_temp.save_time_fixture(
      null,
      null,
      'DLC 33 time fixture',
      jsonb_build_array(
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Prep'
          ),
          'minutes', 12,
          'position', 0
        ),
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Cook'
          ),
          'minutes', 35,
          'position', 1
        ),
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Prep'
          ),
          'minutes', 10,
          'position', 2
        )
      )
    )
  $$,
  'a recipe saves ordered time entries'
);

set constraints recipe_history_after_save immediate;

select is(
  (select total_time_minutes
   from public.recipes
   where account_id = '93000000-0000-4000-8000-000000000001'
     and name = 'DLC 33 time fixture'),
  57,
  'the saved total is derived from all entries'
);

select is(
  (select array_agg(time_type.value order by entry.position)
   from public.recipe_time_entries as entry
   join public.recipe_picklist_values as time_type
     on time_type.account_id = entry.account_id
     and time_type.id = entry.time_type_id
   where entry.account_id = '93000000-0000-4000-8000-000000000001'
     and entry.recipe_id = (
       select id from public.recipes
       where account_id = '93000000-0000-4000-8000-000000000001'
         and name = 'DLC 33 time fixture'
     )),
  array['Prep', 'Cook', 'Prep']::text[],
  'time entries preserve order and allow repeated types'
);

select ok(
  exists (
    select 1
    from public.recipe_history
    where record_id = (
      select id from public.recipes
      where account_id = '93000000-0000-4000-8000-000000000001'
        and name = 'DLC 33 time fixture'
    )
      and event_type = 'recipe.created'
      and jsonb_array_length(after_data->'time_entries') = 3
      and after_data->'time_entries'->0->>'minutes' = '12'
  ),
  'recipe history snapshots include time entries'
);

select lives_ok(
  $$
    select * from pg_temp.save_time_fixture(
      (
        select id from public.recipes
        where account_id = '93000000-0000-4000-8000-000000000001'
          and name = 'DLC 33 time fixture'
      ),
      1,
      'DLC 33 time fixture',
      jsonb_build_array(
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Cook'
          ),
          'minutes', 31,
          'position', 0
        )
      )
    )
  $$,
  'updating time entries succeeds atomically'
);

set constraints recipe_history_after_save immediate;

select is(
  (select total_time_minutes
   from public.recipes
   where account_id = '93000000-0000-4000-8000-000000000001'
     and name = 'DLC 33 time fixture'),
  31,
  'updating entries recomputes the total'
);

select ok(
  exists (
    select 1
    from public.recipe_history
    where record_id = (
      select id from public.recipes
      where account_id = '93000000-0000-4000-8000-000000000001'
        and name = 'DLC 33 time fixture'
    )
      and event_type = 'recipe.updated'
      and jsonb_array_length(before_data->'time_entries') = 3
      and before_data->'time_entries'->0->>'minutes' = '12'
      and jsonb_array_length(after_data->'time_entries') = 1
      and after_data->'time_entries'->0->>'minutes' = '31'
  ),
  'history records before and after time entries on update'
);

select is(
  (select version
   from public.trash_recipe(
     (select id
      from public.recipes
      where account_id = '93000000-0000-4000-8000-000000000001'
        and name = 'DLC 33 time fixture'),
     2
   )),
  3,
  'trashing a recipe preserves its time-entry version'
);

select is(
  (select version
   from public.restore_recipe(
     (select id
      from public.recipes
      where account_id = '93000000-0000-4000-8000-000000000001'
        and name = 'DLC 33 time fixture'),
     3
   )),
  4,
  'restoring a recipe preserves its time-entry version'
);

select ok(
  (select total_time_minutes = 31
   from public.recipes
   where account_id = '93000000-0000-4000-8000-000000000001'
     and name = 'DLC 33 time fixture')
  and exists (
    select 1
    from public.recipe_time_entries as entry
    join public.recipes as recipe
      on recipe.account_id = entry.account_id
      and recipe.id = entry.recipe_id
    where recipe.account_id = '93000000-0000-4000-8000-000000000001'
      and recipe.name = 'DLC 33 time fixture'
      and entry.minutes = 31
  ),
  'trash and restore retain time entries and the derived total'
);

select lives_ok(
  $$
    select * from pg_temp.save_time_fixture(
      (
        select id from public.recipes
        where account_id = '93000000-0000-4000-8000-000000000001'
          and name = 'DLC 33 time fixture'
      ),
      4,
      'DLC 33 time fixture',
      '[]'::jsonb
    )
  $$,
  'a recipe can clear all time entries'
);

select ok(
  (select total_time_minutes = 0
   from public.recipes
   where account_id = '93000000-0000-4000-8000-000000000001'
     and name = 'DLC 33 time fixture')
  and not exists (
    select 1
    from public.recipe_time_entries
    where account_id = '93000000-0000-4000-8000-000000000001'
      and recipe_id = (
        select id from public.recipes
        where account_id = '93000000-0000-4000-8000-000000000001'
          and name = 'DLC 33 time fixture'
      )
  ),
  'clearing entries derives a zero total and removes old rows'
);

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$
    select * from pg_temp.save_time_fixture(
      null,
      null,
      'Cross-account time type',
      jsonb_build_array(
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Prep'
          ),
          'minutes', 1,
          'position', 0
        )
      )
    )
  $$,
  '23514',
  'A recipe time entry uses an unavailable Time Type.',
  'a recipe cannot reference another account''s Time Type'
);

select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select * from pg_temp.save_time_fixture(
      null,
      null,
      'Invalid time payload',
      jsonb_build_array(
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Prep'
          ),
          'minutes', 1,
          'position', 0,
          'unexpected', true
        )
      )
    )
  $$,
  '23514',
  'Recipe time entries are invalid.',
  'the save RPC rejects unrecognized time-entry fields'
);

select ok(
  pg_catalog.strpos(
    lower(pg_catalog.pg_get_functiondef(
      'public.save_public_recipe_copy(uuid,uuid,text,jsonb,jsonb)'::regprocedure
    )),
    'jsonb_object_length(time_entry)'
  ) = 0
  and pg_catalog.strpos(
    lower(pg_catalog.pg_get_functiondef(
      'public.save_public_recipe_copy(uuid,uuid,text,jsonb,jsonb)'::regprocedure
    )),
    'time_entry - array['
  ) > 0,
  'public-copy time validation avoids unsupported JSONB functions'
);

select lives_ok(
  $$
    select * from pg_temp.save_time_fixture(
      (
        select id from public.recipes
        where account_id = '93000000-0000-4000-8000-000000000001'
          and name = 'DLC 33 time fixture'
      ),
      5,
      'DLC 33 time fixture',
      jsonb_build_array(
        jsonb_build_object(
          'time_type_id', (
            select id::text from public.recipe_picklist_values
            where account_id = '93000000-0000-4000-8000-000000000001'
              and category = 'time_type' and value = 'Cook'
          ),
          'minutes', 8,
          'position', 0
        )
      )
    )
  $$,
  'time entries can be restored before purging a recipe'
);

select is(
  (select version
   from public.trash_recipe(
     (select id
      from public.recipes
      where account_id = '93000000-0000-4000-8000-000000000001'
        and name = 'DLC 33 time fixture'),
     6
   )),
  7,
  'a time-bearing recipe can be trashed before purge'
);

select lives_ok(
  $$
    select public.purge_trashed_item(
      'recipe',
      (
        select id
        from public.recipes
        where account_id = '93000000-0000-4000-8000-000000000001'
          and name = 'DLC 33 time fixture'
      ),
      7,
      null
    )
  $$,
  'a time-bearing recipe can be purged'
);

select ok(
  not exists (
    select 1
    from public.recipes
    where account_id = '93000000-0000-4000-8000-000000000001'
      and name = 'DLC 33 time fixture'
  )
  and not exists (
    select 1
    from public.recipe_time_entries
    where account_id = '93000000-0000-4000-8000-000000000001'
  ),
  'purging a recipe cascades to its time entries'
);

select * from finish();
rollback;
