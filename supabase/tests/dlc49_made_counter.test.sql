begin;

set local role postgres;
set local search_path = extensions, public;

select plan(61);

select has_column(
  'public',
  'recipes',
  'made_count',
  'recipes store the Made count'
);

select has_column(
  'public',
  'recipes',
  'last_made_at',
  'recipes store the latest Made timestamp'
);

select ok(
  (
    select column_default is not null and is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'made_count'
  ),
  'Made count is non-null and defaults to zero'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'last_made_at'
  ),
  'Last Made is nullable'
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
  '94900000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'dlc49-made-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000001', true);

insert into public.recipes (id, account_id, name, state, version)
values
  (
    '94900000-0000-4000-8000-000000000002',
    '94900000-0000-4000-8000-000000000001',
    'Daily Made fixture',
    'want_to_try',
    1
  ),
  (
    '94900000-0000-4000-8000-000000000003',
    '94900000-0000-4000-8000-000000000001',
    'Stale Made fixture',
    'want_to_try',
    1
  ),
  (
    '94900000-0000-4000-8000-000000000004',
    '94900000-0000-4000-8000-000000000001',
    'State transition fixture',
    'want_to_try',
    1
  );

insert into public.recipes (
  id,
  account_id,
  name,
  state,
  made_count,
  last_made_at,
  version
)
values (
  '94900000-0000-4000-8000-000000000012',
  '94900000-0000-4000-8000-000000000001',
  'Want to try reset fixture',
  'want_to_try',
  7,
  '2026-03-08 09:00:00+00'::timestamptz,
  1
);

select lives_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000012',
      1,
      'America/Los_Angeles',
      '2026-03-08 09:59:59+00'::timestamptz
    )
  $$,
  'the first Made tap resets preserved Want to try values even on the same local day'
);

select ok(
  (
    select state = 'tried'
      and made_count = 1
      and last_made_at = '2026-03-08 09:59:59+00'::timestamptz
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000012'
  ),
  'the first Made tap commits Want to try as one Made at the new timestamp'
);

insert into public.recipes (
  id,
  account_id,
  name,
  state,
  enthusiasm_id,
  occasion_details,
  version
)
select
  '94900000-0000-4000-8000-000000000008',
  '94900000-0000-4000-8000-000000000001',
  'Made cleanup fixture',
  'want_to_try',
  picklist.id,
  'Thanksgiving dinner',
  1
from public.recipe_picklist_values as picklist
where picklist.account_id = '94900000-0000-4000-8000-000000000001'
  and picklist.category = 'enthusiasm'
  and picklist.value = 'Specific occasion';

select lives_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000008',
      1,
      'America/Los_Angeles',
      '2026-03-08 09:59:59+00'::timestamptz
    )
  $$,
  'marking a Want to try recipe with conditional metadata succeeds'
);

select ok(
  (
    select state = 'tried'
      and made_count = 1
      and enthusiasm_id is null
      and occasion_details is null
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000008'
  ),
  'marking Want to try clears its incompatible Enthusiasm and Occasion'
);

select lives_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000002',
      1,
      'America/Los_Angeles',
      '2026-03-08 09:59:59+00'::timestamptz
    )
  $$,
  'the first Made mark succeeds'
);

select is(
  (select made_count from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  1,
  'the first mark increments Made to one'
);

select is(
  (select state from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  'tried',
  'the first mark changes Want to try to Tried'
);

select is(
  (
    select last_made_at
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000002'
  ),
  '2026-03-08 09:59:59+00'::timestamptz,
  'the first mark stores its timestamp'
);

select lives_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000002',
      1,
      'America/Los_Angeles',
      '2026-03-08 10:00:00+00'::timestamptz
    )
  $$,
  'a stale same-local-day retry succeeds as a no-op across the DST jump'
);

select is(
  (select made_count from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  1,
  'the same-day retry preserves the count'
);

select is(
  (select version from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  2,
  'the same-day retry does not increment the version'
);

select is(
  (
    select last_made_at
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000002'
  ),
  '2026-03-08 09:59:59+00'::timestamptz,
  'the same-day retry preserves the first timestamp'
);

select lives_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000002',
      2,
      'America/Los_Angeles',
      '2026-03-09 07:00:00+00'::timestamptz
    )
  $$,
  'a mark at the next local midnight succeeds'
);

select is(
  (select made_count from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  2,
  'the next local day increments Made once'
);

select is(
  (
    select last_made_at
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000002'
  ),
  '2026-03-09 07:00:00+00'::timestamptz,
  'the next local day stores the new timestamp'
);

set constraints public.recipe_history_after_save immediate;

select is(
  (
    select count(*)::integer
    from public.recipe_history
    where record_id = '94900000-0000-4000-8000-000000000002'
      and event_type = 'recipe.updated'
      and after_data->>'made_count' in ('1', '2')
  ),
  2,
  'successful marks create history events but the same-day no-op does not'
);

select throws_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000002',
      3,
      'Not/A_Timezone',
      '2026-03-10 07:00:00+00'::timestamptz
    )
  $$,
  '22023',
  'The requested time zone is invalid.',
  'invalid time zones are rejected'
);

select throws_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000003',
      2,
      'UTC',
      '2026-03-10 07:00:00+00'::timestamptz
    )
  $$,
  'PT409',
  'This recipe changed in another session.',
  'an unmarked stale recipe version conflicts'
);

update public.recipes
set state = 'will_not_try'
where id = '94900000-0000-4000-8000-000000000002';

update public.recipes
set reason = 'Not for us'
where id = '94900000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    select * from private.mark_recipe_made_at(
      '94900000-0000-4000-8000-000000000002',
      4,
      'America/Los_Angeles',
      '2026-03-10 07:00:00+00'::timestamptz
    )
  $$,
  '22023',
  'Made is unavailable while State is Will not try.',
  'Will not try recipes cannot be marked'
);

select is(
  (select made_count from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  2,
  'Will not try retains the Made count'
);

select is(
  (
    select last_made_at
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000002'
  ),
  '2026-03-09 07:00:00+00'::timestamptz,
  'Will not try retains the Made timestamp'
);

select is(
  (select reason from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  'Not for us',
  'Will not try retains its Reason when Made is unavailable'
);

update public.recipes
set state = 'tried',
    reason = null
where id = '94900000-0000-4000-8000-000000000002';

select is(
  (select made_count from public.recipes where id = '94900000-0000-4000-8000-000000000002'),
  2,
  'returning to Tried reveals the preserved Made values'
);

select is(
  (
    select last_made_at
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000002'
  ),
  '2026-03-09 07:00:00+00'::timestamptz,
  'returning to Tried restores the preserved timestamp'
);

update public.recipes
set state = 'tried'
where id = '94900000-0000-4000-8000-000000000004';

select ok(
  (
    select made_count = 1 and last_made_at is not null
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000004'
  ),
  'changing State to Tried initializes Made and records server time'
);

select throws_ok(
  $$
    insert into public.recipes (id, account_id, name, state, made_count, last_made_at)
    values (
      '94900000-0000-4000-8000-000000000005',
      '94900000-0000-4000-8000-000000000001',
      'Invalid zero Made fixture',
      'want_to_try',
      0,
      now()
    )
  $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_made_data_check"',
  'zero Made requires a null timestamp'
);

select lives_ok(
  $$
    insert into public.recipes (id, account_id, name, state, made_count)
    values (
      '94900000-0000-4000-8000-000000000006',
      '94900000-0000-4000-8000-000000000001',
      'New Tried fixture',
      'tried',
      0
    )
  $$,
  'a newly inserted Tried recipe initializes Made'
);

select ok(
  (
    select made_count = 1 and last_made_at is not null
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000006'
  ),
  'a newly inserted Tried recipe records one Made at server time'
);

select throws_ok(
  $$
    insert into public.recipes (id, account_id, name, state, made_count)
    values (
      '94900000-0000-4000-8000-000000000007',
      '94900000-0000-4000-8000-000000000001',
      'Invalid negative Made fixture',
      'want_to_try',
      -1
    )
  $$,
  '23514',
  'new row for relation "recipes" violates check constraint "recipes_made_data_check"',
  'Made cannot be negative'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.mark_recipe_made_at(uuid,integer,text,timestamp with time zone)',
    'execute'
  ),
  'anonymous users cannot call the private clock helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.mark_recipe_made_at(uuid,integer,text,timestamp with time zone)',
    'execute'
  ),
  'authenticated users cannot call the private clock helper'
);

select is(
  (
    select pronargs::integer
    from pg_proc
    where oid = 'public.mark_recipe_made(uuid,integer,text)'::regprocedure
  ),
  3,
  'the owner-facing RPC accepts no caller-supplied timestamp'
);

select ok(
  (
    select recipe_column_order @> array['made_count', 'last_made_at']::text[]
    from public.accounts
    where id = '94900000-0000-4000-8000-000000000001'
  ),
  'new accounts include Made columns in their recipe-column order'
);

select ok(
  (
    select recipe_hidden_columns @> array['made_count', 'last_made_at']::text[]
    from public.accounts
    where id = '94900000-0000-4000-8000-000000000001'
  ),
  'new Made columns are hidden by default'
);

insert into public.recipes (id, account_id, name, state, made_count, last_made_at)
values
  (
    '94900000-0000-4000-8000-000000000009',
    '94900000-0000-4000-8000-000000000001',
    'Made search fixture A',
    'want_to_try',
    0,
    null
  ),
  (
    '94900000-0000-4000-8000-000000000010',
    '94900000-0000-4000-8000-000000000001',
    'Made search fixture B',
    'tried',
    4,
    '2026-03-09 06:30:00+00'::timestamptz
  ),
  (
    '94900000-0000-4000-8000-000000000011',
    '94900000-0000-4000-8000-000000000001',
    'Made search fixture C',
    'will_not_try',
    7,
    '2026-03-01 12:00:00+00'::timestamptz
  ),
  (
    '94900000-0000-4000-8000-000000000013',
    '94900000-0000-4000-8000-000000000001',
    'Made search fixture D',
    'want_to_try',
    7,
    '2026-03-01 12:00:00+00'::timestamptz
  );

select ok(
  (
    select made_count = 7 and last_made_at = '2026-03-01 12:00:00+00'::timestamptz
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000013'
  ),
  'Want to try preserves stored Made values until the first Made tap'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"made_count","operator":"at_least","value":4}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array['94900000-0000-4000-8000-000000000010'::uuid],
  'Made filters exclude stored values while State is Will not try'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"made_count","operator":"equals","value":0}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array[
    '94900000-0000-4000-8000-000000000009'::uuid,
    '94900000-0000-4000-8000-000000000013'::uuid
  ],
  'Made Search treats Want to try values as zero'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"column_made_count","operator":"between","value":4,"value_to":5}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array['94900000-0000-4000-8000-000000000010'::uuid],
  'Made column filters use numeric comparisons'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"column_made_count","operator":"equals","value":0}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array[
    '94900000-0000-4000-8000-000000000009'::uuid,
    '94900000-0000-4000-8000-000000000013'::uuid
  ],
  'Made column filters treat Want to try values as zero'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"last_made_at","operator":"equals","value":"2026-03-08","time_zone":"America/Los_Angeles"}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array['94900000-0000-4000-8000-000000000010'::uuid],
  'Last Made date filters use the supplied local timezone'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"column_last_made_at","operator":"equals","value":"2026-03-09","time_zone":"Asia/Tokyo"}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array['94900000-0000-4000-8000-000000000010'::uuid],
  'Last Made column filters use the supplied local timezone'
);

select is(
  (
    select array_agg(recipe_id order by recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"last_made_at","operator":"is_empty"}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array[
    '94900000-0000-4000-8000-000000000009'::uuid,
    '94900000-0000-4000-8000-000000000011'::uuid,
    '94900000-0000-4000-8000-000000000013'::uuid
  ],
  'Last Made is empty for unknown dates, Will not try, and Want to try'
);

select is(
  (
    select array_agg(recipe_id order by recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"column_last_made_at","operator":"is_empty"}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array[
    '94900000-0000-4000-8000-000000000009'::uuid,
    '94900000-0000-4000-8000-000000000011'::uuid,
    '94900000-0000-4000-8000-000000000013'::uuid
  ],
  'Last Made column filters treat Want to try as empty'
);

select is(
  (
    select array_agg(recipe_id)
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"name","operator":"starts_with","value":"Made search fixture"},
        {"field":"last_made_at","operator":"is_not_empty"}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
  ),
  array['94900000-0000-4000-8000-000000000010'::uuid],
  'Last Made is not empty only for visible timestamps'
);

select throws_ok(
  $$
    select *
    from public.search_recipes(
      null,
      100,
      0,
      '[{"field":"last_made_at","operator":"equals","value":"2026-03-08","time_zone":"Not/AZone"}]'::jsonb,
      'name',
      'asc',
      null
    )
  $$,
  '22023',
  'Last Made date filters require a valid IANA timezone.',
  'Last Made rejects invalid timezones'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      0,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000009'::uuid,
  'ascending Made sorting starts with the visible zero count'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      1,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000013'::uuid,
  'ascending Made sorting treats Want to try as zero'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      2,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000010'::uuid,
  'ascending Made sorting places Want to try at zero before higher counts'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      3,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000011'::uuid,
  'ascending Made sorting leaves Will not try values last'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      0,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'desc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000010'::uuid,
  'descending Made sorting starts with the highest visible count'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      2,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'desc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000013'::uuid,
  'descending Made sorting places Want to try at zero after higher counts'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      3,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'made_count',
      'desc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000011'::uuid,
  'descending Made sorting leaves Will not try values last'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      0,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'last_made_at',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000010'::uuid,
  'Last Made sorting starts with the visible timestamp'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      2,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'last_made_at',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000011'::uuid,
  'Last Made sorting leaves hidden Will not try timestamps last'
);

select is(
  (
    select recipe_id
    from public.search_recipes(
      null,
      1,
      3,
      '[{"field":"name","operator":"starts_with","value":"Made search fixture"}]'::jsonb,
      'last_made_at',
      'asc',
      null
    )
  ),
  '94900000-0000-4000-8000-000000000013'::uuid,
  'Last Made sorting treats Want to try timestamps as empty'
);

select ok(
  exists (
    select 1
    from public.search_recipes(
      null,
      100,
      0,
      '[
        {"field":"advanced_rules","operator":"matches","value":"{\"version\":1,\"text\":\"1\",\"rules\":[{\"id\":\"94900000-0000-4000-8000-000000000012\",\"field\":\"last_made_at\",\"operator\":\"equals\",\"value\":\"2026-03-08\",\"time_zone\":\"America/Los_Angeles\"}]}"}
      ]'::jsonb,
      'name',
      'asc',
      null
    )
    where recipe_id = '94900000-0000-4000-8000-000000000010'
  ),
  'Advanced Rules support timezone-aware Last Made filters'
);

update public.recipes
set state = 'tried'
where id = '94900000-0000-4000-8000-000000000013';

select ok(
  (
    select state = 'tried'
      and made_count = 7
      and last_made_at = '2026-03-01 12:00:00+00'::timestamptz
    from public.recipes
    where id = '94900000-0000-4000-8000-000000000013'
  ),
  'returning to Tried before the first Made tap restores stored values'
);

select * from finish();
rollback;
