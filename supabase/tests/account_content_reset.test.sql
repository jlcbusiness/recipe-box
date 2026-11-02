begin;

set local role postgres;
set local search_path = extensions, public;

select plan(29);

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
    '24000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'content-reset-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '24000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'content-reset-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

select set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000001', true);

update public.accounts
set is_admin = true,
    is_owner = true,
    volume_system = 'metric',
    hand_preference = 'left',
    last_database_export_at = now()
where id = '24000000-0000-4000-8000-000000000001';

update public.accounts
set is_admin = true
where id = '24000000-0000-4000-8000-000000000002';

insert into public.publications (id, account_id, publication_type, name)
values (
  '24000000-0000-4000-8000-000000000010',
  '24000000-0000-4000-8000-000000000001',
  'book',
  'Reset fixture publication'
);

insert into public.recipes (id, account_id, publication_id, name, state, is_private)
select
  '24000000-0000-4000-8000-000000000011',
  '24000000-0000-4000-8000-000000000001',
  publication.id,
  'Reset fixture recipe',
  'want_to_try',
  false
from public.publications as publication
where publication.account_id = '24000000-0000-4000-8000-000000000001'
  and publication.publication_type = 'collection';

insert into public.recipes (id, account_id, publication_id, name, state)
select
  '24000000-0000-4000-8000-000000000012',
  '24000000-0000-4000-8000-000000000002',
  publication.id,
  'Other account recipe',
  'want_to_try'
from public.publications as publication
where publication.account_id = '24000000-0000-4000-8000-000000000002'
  and publication.publication_type = 'collection';

insert into public.media_assets (
  id,
  account_id,
  recipe_id,
  asset_type,
  staging_path
)
values (
  '24000000-0000-4000-8000-000000000013',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000011',
  'recipe_photo',
  '24000000-0000-4000-8000-000000000001/staging/reset-fixture.webp'
);

insert into public.recipe_picklist_values (account_id, category, value, sort_order)
values ('24000000-0000-4000-8000-000000000001', 'cuisine', 'Reset-only cuisine', 99);

insert into public.ingredients (account_id, name)
values ('24000000-0000-4000-8000-000000000001', 'Reset-only ingredient');

insert into public.recipe_ingredient_sets (account_id, recipe_id, label, position)
values (
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000011',
  'Reset fixture set',
  1
);

insert into public.recipe_ingredients (
  account_id,
  recipe_id,
  ingredient_id,
  ingredient_set_id,
  position
)
select
  recipe.account_id,
  recipe.id,
  ingredient.id,
  ingredient_set.id,
  0
from public.recipes as recipe
join public.ingredients as ingredient
  on ingredient.account_id = recipe.account_id
  and ingredient.name = 'Reset-only ingredient'
join public.recipe_ingredient_sets as ingredient_set
  on ingredient_set.account_id = recipe.account_id
  and ingredient_set.recipe_id = recipe.id
  and ingredient_set.label = 'Reset fixture set'
where recipe.id = '24000000-0000-4000-8000-000000000011';

insert into public.recipe_steps (
  id,
  account_id,
  recipe_id,
  position,
  content_markdown,
  plain_text
)
values (
  '24000000-0000-4000-8000-000000000014',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000011',
  0,
  'Reset fixture instructions',
  'Reset fixture instructions'
);

insert into public.ingredient_nutrition_profiles (
  account_id,
  ingredient_id,
  serving_size_amount,
  serving_size_dimension,
  serving_size_unit_code,
  nutrients
)
select
  ingredient.account_id,
  ingredient.id,
  1,
  'volume',
  'tsp',
  '{}'
from public.ingredients as ingredient
where ingredient.account_id = '24000000-0000-4000-8000-000000000001'
  and ingredient.name = 'Reset-only ingredient';

insert into public.ingredient_densities (
  account_id,
  ingredient_id,
  volume_amount,
  volume_unit_code,
  weight_amount,
  weight_unit_code
)
select
  ingredient.account_id,
  ingredient.id,
  1,
  'cup',
  8,
  'oz'
from public.ingredients as ingredient
where ingredient.account_id = '24000000-0000-4000-8000-000000000001'
  and ingredient.name = 'Reset-only ingredient';

insert into public.tags (account_id, name)
values ('24000000-0000-4000-8000-000000000001', 'Reset-only tag');

insert into public.recipe_tags (account_id, recipe_id, tag_id)
select recipe.account_id, recipe.id, tag.id
from public.recipes as recipe
join public.tags as tag
  on tag.account_id = recipe.account_id
  and tag.name = 'Reset-only tag'
where recipe.id = '24000000-0000-4000-8000-000000000011';

insert into public.publication_tags (account_id, publication_id, tag_id)
select publication.account_id, publication.id, tag.id
from public.publications as publication
join public.tags as tag
  on tag.account_id = publication.account_id
  and tag.name = 'Reset-only tag'
where publication.id = '24000000-0000-4000-8000-000000000010';

insert into public.explorer_state (account_id, context_key, state)
values (
  '24000000-0000-4000-8000-000000000001',
  'recipes-find',
  '{"schema_version":1,"filters":[],"sort":"name","direction":"asc","view":"list"}'
);

insert into public.recipe_history (account_id, record_id, event_type, after_data)
values (
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000011',
  'recipe.created',
  '{"name":"Reset fixture recipe"}'
);

insert into public.publication_history (account_id, record_id, event_type, after_data)
values (
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000010',
  'publication.created',
  '{"name":"Reset fixture publication"}'
);

insert into public.recipe_picklist_history (
  account_id,
  category,
  event_type,
  before_data,
  after_data
)
values (
  '24000000-0000-4000-8000-000000000001',
  'cuisine',
  'picklist.added',
  '[]',
  '[{"value":"Reset-only cuisine"}]'
);

insert into public.ingredient_catalog_history (account_id, event_type, before_data, after_data)
values (
  '24000000-0000-4000-8000-000000000001',
  'ingredient.added',
  '{}',
  '{"name":"Reset-only ingredient"}'
);

insert into public.tag_catalog_history (account_id, event_type, before_data, after_data)
values (
  '24000000-0000-4000-8000-000000000001',
  'tag.added',
  '{}',
  '{"name":"Reset-only tag"}'
);

create temporary table account_content_reset_fixture as
select
  recipe.public_id,
  tin.id as tin_id,
  account.content_generation,
  picklist_revision.revision as picklist_revision,
  ingredient_revision.revision as ingredient_revision,
  tag_revision.revision as tag_revision
from public.recipes as recipe
join public.accounts as account on account.id = recipe.account_id
join public.publications as tin
  on tin.account_id = recipe.account_id
  and tin.publication_type = 'collection'
join public.recipe_picklist_revisions as picklist_revision
  on picklist_revision.account_id = account.id
  and picklist_revision.category = 'food_type'
join public.ingredient_catalog_revisions as ingredient_revision
  on ingredient_revision.account_id = account.id
join public.tag_catalog_revisions as tag_revision
  on tag_revision.account_id = account.id
where recipe.id = '24000000-0000-4000-8000-000000000011';

grant select on account_content_reset_fixture to service_role;

set local role service_role;

select is(
  (public.read_export_snapshot('24000000-0000-4000-8000-000000000001')->>'content_generation')::uuid,
  (select content_generation from account_content_reset_fixture),
  'an export snapshot includes the content generation it captured'
);

select is(
  public.register_export_archive(
    '24000000-0000-4000-8000-000000000001',
    (select content_generation from account_content_reset_fixture),
    '24000000-0000-4000-8000-000000000001/exports/before-reset.zip',
    now() + interval '25 hours'
  ),
  true,
  'an archive from the current content generation is registered normally'
);

set local role postgres;

insert into public.account_content_reset_challenges (
  id,
  account_id,
  provider,
  expires_at,
  verified_at
)
values (
  '24000000-0000-4000-8000-000000000020',
  '24000000-0000-4000-8000-000000000001',
  'email_password',
  now() + interval '10 minutes',
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$
    select public.reset_account_content(
      '24000000-0000-4000-8000-000000000020',
      'RESET ALL CONTENT'
    )
  $$,
  '42501',
  'Recent provider authentication is required.',
  'an administrator cannot reset another account using its challenge'
);

reset role;

select is(
  (select count(*)::integer from public.recipes where id = '24000000-0000-4000-8000-000000000011'),
  1,
  'cross-account reset leaves the owner recipe unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select public.reset_account_content(
      '24000000-0000-4000-8000-000000000020',
      'reset all content'
    )
  $$,
  '42501',
  'Recent provider authentication and the exact confirmation phrase are required.',
  'the confirmation phrase must match exactly'
);

select is(
  (select count(*)::integer from public.recipes where id = '24000000-0000-4000-8000-000000000011'),
  1,
  'an invalid phrase leaves content unchanged'
);

select lives_ok(
  $$
    select public.reset_account_content(
      '24000000-0000-4000-8000-000000000020',
      'RESET ALL CONTENT'
    )
  $$,
  'a verified owner can reset their own account content'
);

reset role;

select ok(
  exists (select 1 from auth.users where id = '24000000-0000-4000-8000-000000000001'),
  'the Auth identity survives the reset'
);

select ok(
  exists (
    select 1
    from public.accounts
    where id = '24000000-0000-4000-8000-000000000001'
      and is_admin
      and is_owner
      and sign_in_method = 'email_password'
  ),
  'account identity and protected role fields survive'
);

select ok(
  exists (
    select 1
    from public.accounts
    where id = '24000000-0000-4000-8000-000000000001'
      and volume_system = 'us_customary'
      and hand_preference = 'right'
      and last_database_export_at is null
  ),
  'preferences return to their database defaults'
);

select ok(
  (select content_generation from public.accounts
   where id = '24000000-0000-4000-8000-000000000001')
    is distinct from
  (select content_generation from account_content_reset_fixture),
  'the account content generation advances'
);

select is(
  (select count(*)::integer
   from public.publications
   where account_id = '24000000-0000-4000-8000-000000000001'
     and publication_type = 'collection'
     and id = (select tin_id from account_content_reset_fixture)),
  1,
  'the same permanent Recipe Tin remains'
);

select is(
  (select count(*)::integer
   from public.recipes
   where account_id = '24000000-0000-4000-8000-000000000001'),
  0,
  'all active and trashed recipes are removed'
);

select is(
  (select count(*)::integer
   from public.publications
   where account_id = '24000000-0000-4000-8000-000000000001'
     and publication_type <> 'collection'),
  0,
  'user-created publications are removed'
);

select is(
  (select count(*)::integer
   from public.recipes
   where id = '24000000-0000-4000-8000-000000000012'),
  1,
  'another account remains unchanged'
);

select ok(
  exists (
    select 1
    from public.recipe_picklist_values
    where account_id = '24000000-0000-4000-8000-000000000001'
      and category = 'food_type'
      and value = 'Casserole'
  )
  and not exists (
    select 1
    from public.recipe_picklist_values
    where account_id = '24000000-0000-4000-8000-000000000001'
      and value = 'Reset-only cuisine'
  ),
  'shipped picklists are restored and custom values are removed'
);

select is(
  (select count(*)::integer from public.tags where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.ingredients where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.media_assets where account_id = '24000000-0000-4000-8000-000000000001'),
  0,
  'tags, ingredients, and media metadata are removed'
);

select is(
  (select count(*)::integer from public.recipe_ingredient_sets where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.recipe_ingredients where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.recipe_steps where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.ingredient_nutrition_profiles where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.ingredient_densities where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.recipe_tags where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.publication_tags where account_id = '24000000-0000-4000-8000-000000000001'),
  0,
  'recipe components, nutrition, density, and tag assignments are removed'
);

select is(
  (select count(*)::integer
   from public.recipe_history
   where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer
     from public.publication_history
     where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer
     from public.recipe_picklist_history
     where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer
     from public.ingredient_catalog_history
     where account_id = '24000000-0000-4000-8000-000000000001')
  + (select count(*)::integer
     from public.tag_catalog_history
     where account_id = '24000000-0000-4000-8000-000000000001'),
  0,
  'all private content and catalog history is removed'
);

select is(
  (select count(*)::integer
   from public.explorer_state
   where account_id = '24000000-0000-4000-8000-000000000001'),
  0,
  'explorer state is removed'
);

select ok(
  exists (
    select 1
    from public.purged_recipe_public_ids
    where public_id = (select public_id from account_content_reset_fixture)
  ),
  'the old public recipe ID remains tombstoned'
);

select ok(
  exists (
    select 1
    from public.media_deletion_queue
    where account_id = '24000000-0000-4000-8000-000000000001'
      and object_path = '24000000-0000-4000-8000-000000000001/staging/reset-fixture.webp'
  ),
  'media object deletion is durably queued'
);

select ok(
  exists (
    select 1
    from public.export_deletion_queue
    where account_id = '24000000-0000-4000-8000-000000000001'
      and object_path = '24000000-0000-4000-8000-000000000001/exports/before-reset.zip'
      and delete_immediately
  ),
  'existing export archives are immediately eligible for revocation'
);

select ok(
  (select revision
   from public.recipe_picklist_revisions
   where account_id = '24000000-0000-4000-8000-000000000001'
     and category = 'food_type')
    > (select picklist_revision from account_content_reset_fixture)
  and (select revision
       from public.ingredient_catalog_revisions
       where account_id = '24000000-0000-4000-8000-000000000001')
    > (select ingredient_revision from account_content_reset_fixture)
  and (select revision
       from public.tag_catalog_revisions
       where account_id = '24000000-0000-4000-8000-000000000001')
    > (select tag_revision from account_content_reset_fixture),
  'catalog revisions advance to reject stale edits'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000001', true);

select ok(
  (public.reset_account_content(
    '24000000-0000-4000-8000-000000000020',
    'RESET ALL CONTENT'
  )->>'already_completed')::boolean,
  'replaying the consumed challenge returns an idempotent result'
);

reset role;

select is(
  (select count(*)::integer
   from public.export_deletion_queue
   where account_id = '24000000-0000-4000-8000-000000000001'),
  1,
  'replay does not enqueue duplicate export cleanup'
);

insert into public.account_content_reset_challenges (
  id,
  account_id,
  provider,
  expires_at,
  verified_at
)
values (
  '24000000-0000-4000-8000-000000000021',
  '24000000-0000-4000-8000-000000000001',
  'email_password',
  now() - interval '1 minute',
  now() - interval '2 minutes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$
    select public.reset_account_content(
      '24000000-0000-4000-8000-000000000021',
      'RESET ALL CONTENT'
    )
  $$,
  '42501',
  'Recent provider authentication has expired.',
  'expired re-authentication cannot authorize a reset'
);

set local role service_role;

select is(
  public.register_export_archive(
    '24000000-0000-4000-8000-000000000001',
    (select content_generation from account_content_reset_fixture),
    '24000000-0000-4000-8000-000000000001/exports/late-export.zip',
    now() + interval '25 hours'
  ),
  false,
  'an export finishing after reset is rejected'
);

reset role;

select ok(
  exists (
    select 1
    from public.export_deletion_queue
    where account_id = '24000000-0000-4000-8000-000000000001'
      and object_path = '24000000-0000-4000-8000-000000000001/exports/late-export.zip'
      and delete_immediately
  ),
  'a late export archive remains queued for immediate deletion'
);

select * from finish();
rollback;
