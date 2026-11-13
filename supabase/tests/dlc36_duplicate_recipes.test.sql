begin;

set local role postgres;
set local search_path = extensions, public;

select plan(9);

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
  '50000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'dlc36-duplicate-recipes@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);

insert into public.publications (id, account_id, publication_type, name)
values (
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  'book',
  'DLC 36 Destination'
);

insert into public.recipes (id, account_id, name, state)
values (
  '50000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000001',
  'DLC 36 Source',
  'want_to_try'
);

insert into public.recipes (id, account_id, name, state)
values
  (
    '50000000-0000-4000-8000-000000000005',
    '50000000-0000-4000-8000-000000000001',
    'Unambiguous legacy copy',
    'want_to_try'
  ),
  (
    '50000000-0000-4000-8000-000000000006',
    '50000000-0000-4000-8000-000000000001',
    'Ambiguous legacy copy',
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
values
  (
    '50000000-0000-4000-8000-000000000013',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000005',
    'external_url',
    'Unambiguous source',
    'https://recipe-box.example/r/50000000-0000-4000-8000-000000000010',
    0,
    true,
    '50000000-0000-4000-8000-000000000010'
  ),
  (
    '50000000-0000-4000-8000-000000000014',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000006',
    'external_url',
    'Ambiguous source one',
    'https://recipe-box.example/r/50000000-0000-4000-8000-000000000011',
    0,
    true,
    '50000000-0000-4000-8000-000000000011'
  ),
  (
    '50000000-0000-4000-8000-000000000015',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000006',
    'external_url',
    'Ambiguous source two',
    'https://recipe-box.example/r/50000000-0000-4000-8000-000000000012',
    1,
    true,
    '50000000-0000-4000-8000-000000000012'
  );

set constraints all immediate;

alter table public.recipes disable trigger recipe_history_after_save;
alter table public.recipes disable trigger recipes_apply_saved_from_public_id_before_save;

with single_source as (
  select
    reference.account_id,
    reference.recipe_id,
    min(reference.source_public_id::text)::uuid as source_public_id
  from public.recipe_references as reference
  where reference.is_protected_source
  group by reference.account_id, reference.recipe_id
  having count(distinct reference.source_public_id) = 1
)
update public.recipes as recipe
set saved_from_public_id = single_source.source_public_id
from single_source
where recipe.account_id = single_source.account_id
  and recipe.id = single_source.recipe_id;

alter table public.recipes enable trigger recipe_history_after_save;
alter table public.recipes enable trigger recipes_apply_saved_from_public_id_before_save;

select is(
  (
    select saved_from_public_id::text
    from public.recipes
    where id = '50000000-0000-4000-8000-000000000005'
  ),
  '50000000-0000-4000-8000-000000000010',
  'backfill identifies one distinct protected source'
);

select ok(
  (
    select saved_from_public_id is null
    from public.recipes
    where id = '50000000-0000-4000-8000-000000000006'
  ),
  'backfill leaves ambiguous protected sources unmarked'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.commit_recipe_duplicate_with_media_sources(uuid, uuid, integer, uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb)'::regprocedure,
    'execute'
  ),
  'the duplicate commit is executable by service_role'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.commit_recipe_duplicate_with_media_sources(uuid, uuid, integer, uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb)'::regprocedure,
    'execute'
  ),
  'authenticated users cannot call the duplicate commit directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.commit_recipe_duplicate_with_media_sources(uuid, uuid, integer, uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb)'::regprocedure,
    'execute'
  ),
  'anonymous users cannot call the duplicate commit'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    select public.commit_recipe_duplicate_with_media_sources(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      99,
      '50000000-0000-4000-8000-000000000002',
      '{}'::jsonb,
      jsonb_build_object(
        'recipes',
        jsonb_build_array(
          jsonb_build_object(
            'id', '50000000-0000-4000-8000-000000000004',
            'name', 'DLC 36 Copy',
            'publication_id', '50000000-0000-4000-8000-000000000002',
            'is_private', true,
            'saved_from_public_id', null
          )
        )
      ),
      '[]'::jsonb,
      '{}'::uuid[],
      '{}'::uuid[],
      '[]'::jsonb
    )
  $$,
  'PT409',
  'The source recipe changed before it could be copied.',
  'the commit rejects a stale source version before writing'
);

select throws_ok(
  $$
    select public.commit_recipe_duplicate_with_media_sources(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      1,
      '50000000-0000-4000-8000-000000000099',
      '{}'::jsonb,
      jsonb_build_object(
        'recipes',
        jsonb_build_array(
          jsonb_build_object(
            'id', '50000000-0000-4000-8000-000000000004',
            'name', 'DLC 36 Copy',
            'publication_id', '50000000-0000-4000-8000-000000000099',
            'is_private', true,
            'saved_from_public_id', null
          )
        )
      ),
      '[]'::jsonb,
      '{}'::uuid[],
      '{}'::uuid[],
      '[]'::jsonb
    )
  $$,
  'P0002',
  'The destination publication is unavailable.',
  'the commit rejects a destination outside the account'
);

set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select * from public.trash_recipe(
      '50000000-0000-4000-8000-000000000003',
      1
    )
  $$,
  'the source recipe is trashed for the inactive-source check'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    select public.commit_recipe_duplicate_with_media_sources(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      1,
      '50000000-0000-4000-8000-000000000002',
      '{}'::jsonb,
      jsonb_build_object(
        'recipes',
        jsonb_build_array(
          jsonb_build_object(
            'id', '50000000-0000-4000-8000-000000000004',
            'name', 'DLC 36 Copy',
            'publication_id', '50000000-0000-4000-8000-000000000002',
            'is_private', true,
            'saved_from_public_id', null
          )
        )
      ),
      '[]'::jsonb,
      '{}'::uuid[],
      '{}'::uuid[],
      '[]'::jsonb
    )
  $$,
  'P0002',
  'The source recipe is unavailable.',
  'the commit rejects an inactive source recipe'
);

select * from finish();
rollback;
