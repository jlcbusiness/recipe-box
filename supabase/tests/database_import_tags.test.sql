begin;

set local role postgres;
set local search_path = extensions, public;

select plan(2);

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
  'database-import-tags@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"51000000-0000-4000-8000-000000000001"}',
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select public.commit_database_import_with_media_sources(
      '51000000-0000-4000-8000-000000000001',
      '{}'::jsonb,
      '{
        "recipes": [],
        "publications": [],
        "recipe_picklist_values": [],
        "recipe_picklist_assignments": [],
        "ingredients": [],
        "recipe_ingredients": [],
        "recipe_ingredient_sets": [],
        "recipe_ingredient_measurements": [],
        "recipe_steps": [],
        "recipe_step_mentions": [],
        "recipe_site_listings": [],
        "recipe_pairings": [],
        "recipe_references": [],
        "ingredient_densities": [],
        "ingredient_nutrition_profiles": [],
        "ingredient_measure_equivalents": [],
        "tags": [
          {
            "id": "51000000-0000-4000-8000-000000000002",
            "name": "Imported Tag",
            "sort_order": 17,
            "color_key": "grey"
          }
        ],
        "recipe_tags": [],
        "publication_tags": [],
        "explorer_state": [],
        "media_assets": [],
        "recipe_time_entries": []
      }'::jsonb,
      '[]'::jsonb,
      array[]::uuid[],
      array[]::uuid[],
      '[]'::jsonb
    )
  $$,
  'database import accepts tags with sort_order'
);

select is(
  (
    select tag.sort_order
    from public.tags as tag
    where tag.account_id = '51000000-0000-4000-8000-000000000001'
      and tag.id = '51000000-0000-4000-8000-000000000002'
  ),
  17,
  'database import persists tag sort_order'
);

select * from finish();
rollback;
