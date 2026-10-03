create table public.recipe_picklist_values (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  category text not null check (
    category in (
      'food_type',
      'meal_type',
      'cuisine',
      'equipment',
      'verdict',
      'enthusiasm',
      'informal_unit',
      'unmeasured_phrase'
    )
  ),
  value text not null,
  sort_order integer not null check (sort_order >= 0),
  is_protected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, category, value),
  unique (account_id, category, id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  food_type_id uuid,
  food_type_category text generated always as ('food_type'::text) stored,
  state text not null check (state in ('want_to_try', 'tried', 'will_not_try')),
  verdict_id uuid,
  verdict_category text generated always as ('verdict'::text) stored,
  enthusiasm_id uuid,
  enthusiasm_category text generated always as ('enthusiasm'::text) stored,
  occasion_details text,
  reason text,
  servings numeric check (servings is null or servings > 0),
  yield_text text,
  prep_time_minutes integer check (prep_time_minutes is null or prep_time_minutes >= 0),
  mixing_time_minutes integer check (mixing_time_minutes is null or mixing_time_minutes >= 0),
  marinate_time_minutes integer check (
    marinate_time_minutes is null or marinate_time_minutes >= 0
  ),
  chill_time_minutes integer check (chill_time_minutes is null or chill_time_minutes >= 0),
  freeze_time_minutes integer check (freeze_time_minutes is null or freeze_time_minutes >= 0),
  cook_time_minutes integer check (cook_time_minutes is null or cook_time_minutes >= 0),
  bake_time_minutes integer check (bake_time_minutes is null or bake_time_minutes >= 0),
  cooling_time_minutes integer check (cooling_time_minutes is null or cooling_time_minutes >= 0),
  rest_time_minutes integer check (rest_time_minutes is null or rest_time_minutes >= 0),
  total_time_minutes integer check (total_time_minutes is null or total_time_minutes >= 0),
  notes_markdown text not null default '',
  is_private boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  foreign key (account_id, food_type_category, food_type_id)
    references public.recipe_picklist_values (account_id, category, id),
  foreign key (account_id, verdict_category, verdict_id)
    references public.recipe_picklist_values (account_id, category, id),
  foreign key (account_id, enthusiasm_category, enthusiasm_id)
    references public.recipe_picklist_values (account_id, category, id),
  check (
    (state = 'want_to_try' and verdict_id is null and reason is null)
    or (state = 'tried' and enthusiasm_id is null and reason is null)
    or (
      state = 'will_not_try'
      and verdict_id is null
      and enthusiasm_id is null
      and occasion_details is null
    )
  )
);

create table public.recipe_picklist_assignments (
  account_id uuid not null,
  recipe_id uuid not null,
  category text not null check (category in ('meal_type', 'cuisine', 'equipment')),
  picklist_value_id uuid not null,
  primary key (recipe_id, category, picklist_value_id),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, category, picklist_value_id)
    references public.recipe_picklist_values (account_id, category, id)
);

create table public.recipe_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  record_id uuid not null,
  event_type text not null check (event_type in ('recipe.created', 'recipe.updated')),
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_picklist_values enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_picklist_assignments enable row level security;
alter table public.recipe_history enable row level security;

grant select on public.recipe_picklist_values to authenticated;
grant select, insert, update on public.recipes to authenticated;
grant select, insert, delete on public.recipe_picklist_assignments to authenticated;
grant select on public.recipe_history to authenticated;

create policy "Account owners can read recipe picklists"
  on public.recipe_picklist_values
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can read recipes"
  on public.recipes
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can create recipes"
  on public.recipes
  for insert
  to authenticated
  with check ((select auth.uid()) = account_id);

create policy "Account owners can update recipes"
  on public.recipes
  for update
  to authenticated
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);

create policy "Account owners can read recipe picklist assignments"
  on public.recipe_picklist_assignments
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can add recipe picklist assignments"
  on public.recipe_picklist_assignments
  for insert
  to authenticated
  with check ((select auth.uid()) = account_id);

create policy "Account owners can remove recipe picklist assignments"
  on public.recipe_picklist_assignments
  for delete
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can read recipe history"
  on public.recipe_history
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function public.seed_recipe_picklists_for_account(target_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.recipe_picklist_values (account_id, category, value, sort_order, is_protected)
  select
    target_account_id,
    defaults.category,
    defaults.value,
    defaults.sort_order,
    defaults.is_protected
  from (
    values
      ('food_type', 'Casserole', 0, false),
      ('food_type', 'Roast', 1, false),
      ('food_type', 'Pie', 2, false),
      ('food_type', 'Galette', 3, false),
      ('food_type', 'Pasta', 4, false),
      ('food_type', 'Soup', 5, false),
      ('food_type', 'Sauce', 6, false),
      ('food_type', 'Cake', 7, false),
      ('food_type', 'Cocktail', 8, false),
      ('food_type', 'Bread', 9, false),
      ('food_type', 'Stew', 10, false),
      ('food_type', 'Salad', 11, false),
      ('meal_type', 'Breakfast', 0, false),
      ('meal_type', 'Lunch', 1, false),
      ('meal_type', 'Dinner', 2, false),
      ('meal_type', 'Appetizer', 3, false),
      ('meal_type', 'Side dish', 4, false),
      ('meal_type', 'Snack', 5, false),
      ('meal_type', 'Dessert', 6, false),
      ('meal_type', 'Drink', 7, false),
      ('meal_type', 'Booze', 8, false),
      ('meal_type', 'Sauce', 9, false),
      ('cuisine', 'American', 0, false),
      ('cuisine', 'Italian', 1, false),
      ('cuisine', 'Chinese', 2, false),
      ('cuisine', 'Mexican', 3, false),
      ('cuisine', 'French', 4, false),
      ('cuisine', 'Thai', 5, false),
      ('cuisine', 'Indian', 6, false),
      ('cuisine', 'Fusion', 7, false),
      ('equipment', 'Small pan', 0, false),
      ('equipment', 'Medium skillet', 1, false),
      ('equipment', '12-inch cast iron', 2, false),
      ('equipment', 'Stand mixer', 3, false),
      ('equipment', 'Baking sheet', 4, false),
      ('equipment', 'Chef knife', 5, false),
      ('equipment', 'Spatula', 6, false),
      ('equipment', 'Whisk', 7, false),
      ('equipment', 'Peeler', 8, false),
      ('equipment', 'Blender', 9, false),
      ('verdict', 'Favorite', 0, false),
      ('verdict', 'Delicious', 1, false),
      ('verdict', 'Staple', 2, false),
      ('verdict', 'Once-a-year-rich', 3, false),
      ('verdict', 'Practice', 4, false),
      ('verdict', 'Try again', 5, false),
      ('verdict', 'Occasionally', 6, false),
      ('verdict', 'So-so', 7, false),
      ('verdict', 'No', 8, false),
      ('verdict', 'Hell no', 9, false),
      ('verdict', 'MISTAKE', 10, false),
      ('verdict', 'Specific occasion', 11, true),
      ('enthusiasm', 'Absolutely', 0, false),
      ('enthusiasm', 'Sounds good!', 1, false),
      ('enthusiasm', 'Try', 2, false),
      ('enthusiasm', 'Specific occasion', 3, true),
      ('enthusiasm', 'Maybe', 4, false),
      ('enthusiasm', 'Eh', 5, false),
      ('informal_unit', 'Bunch', 0, false),
      ('informal_unit', 'Sprig', 1, false),
      ('informal_unit', 'Clove', 2, false),
      ('informal_unit', 'Head', 3, false),
      ('informal_unit', 'Stalk', 4, false),
      ('informal_unit', 'Sheet', 5, false),
      ('informal_unit', 'Stick', 6, false),
      ('informal_unit', 'Slice', 7, false),
      ('informal_unit', 'Pinch', 8, false),
      ('informal_unit', 'Dash', 9, false),
      ('informal_unit', 'Handful', 10, false),
      ('unmeasured_phrase', 'To taste', 0, false),
      ('unmeasured_phrase', 'As needed', 1, false),
      ('unmeasured_phrase', 'For garnish', 2, false),
      ('unmeasured_phrase', 'To serve', 3, false),
      ('unmeasured_phrase', 'Divided', 4, false)
  ) as defaults(category, value, sort_order, is_protected)
  on conflict (account_id, category, value) do nothing;
$$;

revoke all on function public.seed_recipe_picklists_for_account(uuid) from public, anon, authenticated;

create function public.seed_recipe_picklists_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_recipe_picklists_for_account(new.id);
  return new;
end;
$$;

create trigger seed_recipe_picklists_after_account_insert
  after insert on public.accounts
  for each row execute procedure public.seed_recipe_picklists_after_account_insert();

insert into public.recipe_picklist_values (account_id, category, value, sort_order, is_protected)
select
  account.id,
  defaults.category,
  defaults.value,
  defaults.sort_order,
  defaults.is_protected
from public.accounts as account
cross join (
  values
    ('food_type', 'Casserole', 0, false),
    ('food_type', 'Roast', 1, false),
    ('food_type', 'Pie', 2, false),
    ('food_type', 'Galette', 3, false),
    ('food_type', 'Pasta', 4, false),
    ('food_type', 'Soup', 5, false),
    ('food_type', 'Sauce', 6, false),
    ('food_type', 'Cake', 7, false),
    ('food_type', 'Cocktail', 8, false),
    ('food_type', 'Bread', 9, false),
    ('food_type', 'Stew', 10, false),
    ('food_type', 'Salad', 11, false),
    ('meal_type', 'Breakfast', 0, false),
    ('meal_type', 'Lunch', 1, false),
    ('meal_type', 'Dinner', 2, false),
    ('meal_type', 'Appetizer', 3, false),
    ('meal_type', 'Side dish', 4, false),
    ('meal_type', 'Snack', 5, false),
    ('meal_type', 'Dessert', 6, false),
    ('meal_type', 'Drink', 7, false),
    ('meal_type', 'Booze', 8, false),
    ('meal_type', 'Sauce', 9, false),
    ('cuisine', 'American', 0, false),
    ('cuisine', 'Italian', 1, false),
    ('cuisine', 'Chinese', 2, false),
    ('cuisine', 'Mexican', 3, false),
    ('cuisine', 'French', 4, false),
    ('cuisine', 'Thai', 5, false),
    ('cuisine', 'Indian', 6, false),
    ('cuisine', 'Fusion', 7, false),
    ('equipment', 'Small pan', 0, false),
    ('equipment', 'Medium skillet', 1, false),
    ('equipment', '12-inch cast iron', 2, false),
    ('equipment', 'Stand mixer', 3, false),
    ('equipment', 'Baking sheet', 4, false),
    ('equipment', 'Chef knife', 5, false),
    ('equipment', 'Spatula', 6, false),
    ('equipment', 'Whisk', 7, false),
    ('equipment', 'Peeler', 8, false),
    ('equipment', 'Blender', 9, false),
    ('verdict', 'Favorite', 0, false),
    ('verdict', 'Delicious', 1, false),
    ('verdict', 'Staple', 2, false),
    ('verdict', 'Once-a-year-rich', 3, false),
    ('verdict', 'Practice', 4, false),
    ('verdict', 'Try again', 5, false),
    ('verdict', 'Occasionally', 6, false),
    ('verdict', 'So-so', 7, false),
    ('verdict', 'No', 8, false),
    ('verdict', 'Hell no', 9, false),
    ('verdict', 'MISTAKE', 10, false),
    ('verdict', 'Specific occasion', 11, true),
    ('enthusiasm', 'Absolutely', 0, false),
    ('enthusiasm', 'Sounds good!', 1, false),
    ('enthusiasm', 'Try', 2, false),
    ('enthusiasm', 'Specific occasion', 3, true),
    ('enthusiasm', 'Maybe', 4, false),
    ('enthusiasm', 'Eh', 5, false),
    ('informal_unit', 'Bunch', 0, false),
    ('informal_unit', 'Sprig', 1, false),
    ('informal_unit', 'Clove', 2, false),
    ('informal_unit', 'Head', 3, false),
    ('informal_unit', 'Stalk', 4, false),
    ('informal_unit', 'Sheet', 5, false),
    ('informal_unit', 'Stick', 6, false),
    ('informal_unit', 'Slice', 7, false),
    ('informal_unit', 'Pinch', 8, false),
    ('informal_unit', 'Dash', 9, false),
    ('informal_unit', 'Handful', 10, false),
    ('unmeasured_phrase', 'To taste', 0, false),
    ('unmeasured_phrase', 'As needed', 1, false),
    ('unmeasured_phrase', 'For garnish', 2, false),
    ('unmeasured_phrase', 'To serve', 3, false),
    ('unmeasured_phrase', 'Divided', 4, false)
) as defaults(category, value, sort_order, is_protected)
on conflict (account_id, category, value) do nothing;

alter table public.recipe_picklist_values enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_picklist_assignments enable row level security;
alter table public.recipe_history enable row level security;

grant select on public.recipe_picklist_values to authenticated;
grant select, insert, update on public.recipes to authenticated;
grant select, insert, delete on public.recipe_picklist_assignments to authenticated;
grant select on public.recipe_history to authenticated;

drop policy if exists "Account owners can read recipe picklists" on public.recipe_picklist_values;
drop policy if exists "Account owners can read recipes" on public.recipes;
drop policy if exists "Account owners can create recipes" on public.recipes;
drop policy if exists "Account owners can update recipes" on public.recipes;
drop policy if exists "Account owners can read recipe picklist assignments" on public.recipe_picklist_assignments;
drop policy if exists "Account owners can add recipe picklist assignments" on public.recipe_picklist_assignments;
drop policy if exists "Account owners can remove recipe picklist assignments" on public.recipe_picklist_assignments;
drop policy if exists "Account owners can read recipe history" on public.recipe_history;

create policy "Account owners can read recipe picklists"
  on public.recipe_picklist_values
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can read recipes"
  on public.recipes
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can create recipes"
  on public.recipes
  for insert
  to authenticated
  with check ((select auth.uid()) = account_id);

create policy "Account owners can update recipes"
  on public.recipes
  for update
  to authenticated
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);

create policy "Account owners can read recipe picklist assignments"
  on public.recipe_picklist_assignments
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can add recipe picklist assignments"
  on public.recipe_picklist_assignments
  for insert
  to authenticated
  with check ((select auth.uid()) = account_id);

create policy "Account owners can remove recipe picklist assignments"
  on public.recipe_picklist_assignments
  for delete
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can read recipe history"
  on public.recipe_history
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create or replace function public.seed_recipe_picklists_for_account(target_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.recipe_picklist_values (account_id, category, value, sort_order, is_protected)
  select
    target_account_id,
    defaults.category,
    defaults.value,
    defaults.sort_order,
    defaults.is_protected
  from (
    values
      ('food_type', 'Casserole', 0, false),
      ('food_type', 'Roast', 1, false),
      ('food_type', 'Pie', 2, false),
      ('food_type', 'Galette', 3, false),
      ('food_type', 'Pasta', 4, false),
      ('food_type', 'Soup', 5, false),
      ('food_type', 'Sauce', 6, false),
      ('food_type', 'Cake', 7, false),
      ('food_type', 'Cocktail', 8, false),
      ('food_type', 'Bread', 9, false),
      ('food_type', 'Stew', 10, false),
      ('food_type', 'Salad', 11, false),
      ('meal_type', 'Breakfast', 0, false),
      ('meal_type', 'Lunch', 1, false),
      ('meal_type', 'Dinner', 2, false),
      ('meal_type', 'Appetizer', 3, false),
      ('meal_type', 'Side dish', 4, false),
      ('meal_type', 'Snack', 5, false),
      ('meal_type', 'Dessert', 6, false),
      ('meal_type', 'Drink', 7, false),
      ('meal_type', 'Booze', 8, false),
      ('meal_type', 'Sauce', 9, false),
      ('cuisine', 'American', 0, false),
      ('cuisine', 'Italian', 1, false),
      ('cuisine', 'Chinese', 2, false),
      ('cuisine', 'Mexican', 3, false),
      ('cuisine', 'French', 4, false),
      ('cuisine', 'Thai', 5, false),
      ('cuisine', 'Indian', 6, false),
      ('cuisine', 'Fusion', 7, false),
      ('equipment', 'Small pan', 0, false),
      ('equipment', 'Medium skillet', 1, false),
      ('equipment', '12-inch cast iron', 2, false),
      ('equipment', 'Stand mixer', 3, false),
      ('equipment', 'Baking sheet', 4, false),
      ('equipment', 'Chef knife', 5, false),
      ('equipment', 'Spatula', 6, false),
      ('equipment', 'Whisk', 7, false),
      ('equipment', 'Peeler', 8, false),
      ('equipment', 'Blender', 9, false),
      ('verdict', 'Favorite', 0, false),
      ('verdict', 'Delicious', 1, false),
      ('verdict', 'Staple', 2, false),
      ('verdict', 'Once-a-year-rich', 3, false),
      ('verdict', 'Practice', 4, false),
      ('verdict', 'Try again', 5, false),
      ('verdict', 'Occasionally', 6, false),
      ('verdict', 'So-so', 7, false),
      ('verdict', 'No', 8, false),
      ('verdict', 'Hell no', 9, false),
      ('verdict', 'MISTAKE', 10, false),
      ('verdict', 'Specific occasion', 11, true),
      ('enthusiasm', 'Absolutely', 0, false),
      ('enthusiasm', 'Sounds good!', 1, false),
      ('enthusiasm', 'Try', 2, false),
      ('enthusiasm', 'Specific occasion', 3, true),
      ('enthusiasm', 'Maybe', 4, false),
      ('enthusiasm', 'Eh', 5, false),
      ('informal_unit', 'Bunch', 0, false),
      ('informal_unit', 'Sprig', 1, false),
      ('informal_unit', 'Clove', 2, false),
      ('informal_unit', 'Head', 3, false),
      ('informal_unit', 'Stalk', 4, false),
      ('informal_unit', 'Sheet', 5, false),
      ('informal_unit', 'Stick', 6, false),
      ('informal_unit', 'Slice', 7, false),
      ('informal_unit', 'Pinch', 8, false),
      ('informal_unit', 'Dash', 9, false),
      ('informal_unit', 'Handful', 10, false),
      ('unmeasured_phrase', 'To taste', 0, false),
      ('unmeasured_phrase', 'As needed', 1, false),
      ('unmeasured_phrase', 'For garnish', 2, false),
      ('unmeasured_phrase', 'To serve', 3, false),
      ('unmeasured_phrase', 'Divided', 4, false)
  ) as defaults(category, value, sort_order, is_protected)
  on conflict (account_id, category, value) do nothing;
$$;

revoke all on function public.seed_recipe_picklists_for_account(uuid) from public, anon, authenticated;

create or replace function public.seed_recipe_picklists_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_recipe_picklists_for_account(new.id);
  return new;
end;
$$;

drop trigger if exists seed_recipe_picklists_after_account_insert on public.accounts;

create trigger seed_recipe_picklists_after_account_insert
  after insert on public.accounts
  for each row execute procedure public.seed_recipe_picklists_after_account_insert();

insert into public.recipe_picklist_values (account_id, category, value, sort_order, is_protected)
select
  account.id,
  defaults.category,
  defaults.value,
  defaults.sort_order,
  defaults.is_protected
from public.accounts as account
cross join (
  values
    ('food_type', 'Casserole', 0, false),
    ('food_type', 'Roast', 1, false),
    ('food_type', 'Pie', 2, false),
    ('food_type', 'Galette', 3, false),
    ('food_type', 'Pasta', 4, false),
    ('food_type', 'Soup', 5, false),
    ('food_type', 'Sauce', 6, false),
    ('food_type', 'Cake', 7, false),
    ('food_type', 'Cocktail', 8, false),
    ('food_type', 'Bread', 9, false),
    ('food_type', 'Stew', 10, false),
    ('food_type', 'Salad', 11, false),
    ('meal_type', 'Breakfast', 0, false),
    ('meal_type', 'Lunch', 1, false),
    ('meal_type', 'Dinner', 2, false),
    ('meal_type', 'Appetizer', 3, false),
    ('meal_type', 'Side dish', 4, false),
    ('meal_type', 'Snack', 5, false),
    ('meal_type', 'Dessert', 6, false),
    ('meal_type', 'Drink', 7, false),
    ('meal_type', 'Booze', 8, false),
    ('meal_type', 'Sauce', 9, false),
    ('cuisine', 'American', 0, false),
    ('cuisine', 'Italian', 1, false),
    ('cuisine', 'Chinese', 2, false),
    ('cuisine', 'Mexican', 3, false),
    ('cuisine', 'French', 4, false),
    ('cuisine', 'Thai', 5, false),
    ('cuisine', 'Indian', 6, false),
    ('cuisine', 'Fusion', 7, false),
    ('equipment', 'Small pan', 0, false),
    ('equipment', 'Medium skillet', 1, false),
    ('equipment', '12-inch cast iron', 2, false),
    ('equipment', 'Stand mixer', 3, false),
    ('equipment', 'Baking sheet', 4, false),
    ('equipment', 'Chef knife', 5, false),
    ('equipment', 'Spatula', 6, false),
    ('equipment', 'Whisk', 7, false),
    ('equipment', 'Peeler', 8, false),
    ('equipment', 'Blender', 9, false),
    ('verdict', 'Favorite', 0, false),
    ('verdict', 'Delicious', 1, false),
    ('verdict', 'Staple', 2, false),
    ('verdict', 'Once-a-year-rich', 3, false),
    ('verdict', 'Practice', 4, false),
    ('verdict', 'Try again', 5, false),
    ('verdict', 'Occasionally', 6, false),
    ('verdict', 'So-so', 7, false),
    ('verdict', 'No', 8, false),
    ('verdict', 'Hell no', 9, false),
    ('verdict', 'MISTAKE', 10, false),
    ('verdict', 'Specific occasion', 11, true),
    ('enthusiasm', 'Absolutely', 0, false),
    ('enthusiasm', 'Sounds good!', 1, false),
    ('enthusiasm', 'Try', 2, false),
    ('enthusiasm', 'Specific occasion', 3, true),
    ('enthusiasm', 'Maybe', 4, false),
    ('enthusiasm', 'Eh', 5, false),
    ('informal_unit', 'Bunch', 0, false),
    ('informal_unit', 'Sprig', 1, false),
    ('informal_unit', 'Clove', 2, false),
    ('informal_unit', 'Head', 3, false),
    ('informal_unit', 'Stalk', 4, false),
    ('informal_unit', 'Sheet', 5, false),
    ('informal_unit', 'Stick', 6, false),
    ('informal_unit', 'Slice', 7, false),
    ('informal_unit', 'Pinch', 8, false),
    ('informal_unit', 'Dash', 9, false),
    ('informal_unit', 'Handful', 10, false),
    ('unmeasured_phrase', 'To taste', 0, false),
    ('unmeasured_phrase', 'As needed', 1, false),
    ('unmeasured_phrase', 'For garnish', 2, false),
    ('unmeasured_phrase', 'To serve', 3, false),
    ('unmeasured_phrase', 'Divided', 4, false)
) as defaults(category, value, sort_order, is_protected)
on conflict (account_id, category, value) do nothing;

create function public.recipe_history_after_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.recipe_history (
    account_id,
    actor_user_id,
    record_id,
    event_type,
    before_data,
    after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    case when tg_op = 'INSERT' then 'recipe.created' else 'recipe.updated' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );

  return new;
end;
$$;

create trigger recipe_history_after_save
  after insert or update on public.recipes
  for each row execute procedure public.recipe_history_after_save();

create function public.recipe_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute procedure public.recipe_updated_at();

create function public.recipe_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state is distinct from old.state then
    new.verdict_id = null;
    new.enthusiasm_id = null;
    new.occasion_details = null;
    new.reason = null;
  end if;

  if new.state = 'want_to_try' and new.verdict_id is not null then
    raise exception 'A Want to try recipe cannot have a Verdict.' using errcode = '23514';
  elsif new.state = 'tried' and new.enthusiasm_id is not null then
    raise exception 'A Tried recipe cannot have an Enthusiasm.' using errcode = '23514';
  elsif new.state = 'will_not_try'
    and (new.verdict_id is not null or new.enthusiasm_id is not null or new.occasion_details is not null) then
    raise exception 'A Will not try recipe cannot have a Verdict, Enthusiasm, or Occasion Details.'
      using errcode = '23514';
  end if;

  if new.occasion_details is not null and not (
    (
      new.state = 'want_to_try'
      and exists (
        select 1 from public.recipe_picklist_values
        where account_id = new.account_id
          and category = 'enthusiasm'
          and id = new.enthusiasm_id
          and value = 'Specific occasion'
      )
    )
    or (
      new.state = 'tried'
      and exists (
        select 1 from public.recipe_picklist_values
        where account_id = new.account_id
          and category = 'verdict'
          and id = new.verdict_id
          and value = 'Specific occasion'
      )
    )
  ) then
    raise exception 'Occasion Details require Specific occasion.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger recipes_state_transition
  before insert or update of state, verdict_id, enthusiasm_id, occasion_details, reason
  on public.recipes
  for each row execute procedure public.recipe_state_transition();

create function public.save_recipe(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_servings numeric,
  p_yield_text text,
  p_prep_time_minutes integer,
  p_mixing_time_minutes integer,
  p_marinate_time_minutes integer,
  p_chill_time_minutes integer,
  p_freeze_time_minutes integer,
  p_cook_time_minutes integer,
  p_bake_time_minutes integer,
  p_cooling_time_minutes integer,
  p_rest_time_minutes integer,
  p_total_time_minutes integer,
  p_notes_markdown text,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[]
)
returns table (id uuid, version integer)
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  saved_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Recipe name is required.' using errcode = '23514';
  end if;

  if p_state not in ('want_to_try', 'tried', 'will_not_try') then
    raise exception 'Recipe State is invalid.' using errcode = '23514';
  end if;

  if (p_state = 'want_to_try' and (p_verdict_id is not null or p_reason is not null))
    or (p_state = 'tried' and (p_enthusiasm_id is not null or p_reason is not null))
    or (p_state = 'will_not_try' and (p_verdict_id is not null or p_enthusiasm_id is not null or p_occasion_details is not null)) then
    raise exception 'Recipe response fields do not match State.' using errcode = '23514';
  end if;

  if p_occasion_details is not null and not (
    (
      p_state = 'want_to_try'
      and exists (
        select 1 from public.recipe_picklist_values
        where account_id = owner_id
          and category = 'enthusiasm'
          and id = p_enthusiasm_id
          and value = 'Specific occasion'
      )
    )
    or (
      p_state = 'tried'
      and exists (
        select 1 from public.recipe_picklist_values
        where account_id = owner_id
          and category = 'verdict'
          and id = p_verdict_id
          and value = 'Specific occasion'
      )
    )
  ) then
    raise exception 'Occasion Details require Specific occasion.' using errcode = '23514';
  end if;

  if p_servings is not null and p_servings <= 0 then
    raise exception 'Servings must be greater than zero.' using errcode = '23514';
  end if;

  if p_recipe_id is null then
    insert into public.recipes (
      account_id,
      name,
      food_type_id,
      state,
      verdict_id,
      enthusiasm_id,
      occasion_details,
      reason,
      servings,
      yield_text,
      prep_time_minutes,
      mixing_time_minutes,
      marinate_time_minutes,
      chill_time_minutes,
      freeze_time_minutes,
      cook_time_minutes,
      bake_time_minutes,
      cooling_time_minutes,
      rest_time_minutes,
      total_time_minutes,
      notes_markdown
    )
    values (
      owner_id,
      trim(p_name),
      p_food_type_id,
      p_state,
      p_verdict_id,
      p_enthusiasm_id,
      p_occasion_details,
      p_reason,
      p_servings,
      nullif(trim(p_yield_text), ''),
      p_prep_time_minutes,
      p_mixing_time_minutes,
      p_marinate_time_minutes,
      p_chill_time_minutes,
      p_freeze_time_minutes,
      p_cook_time_minutes,
      p_bake_time_minutes,
      p_cooling_time_minutes,
      p_rest_time_minutes,
      p_total_time_minutes,
      coalesce(p_notes_markdown, '')
    )
    returning recipes.id, recipes.version into saved_id, saved_version;
  else
    update public.recipes
    set
      name = trim(p_name),
      food_type_id = p_food_type_id,
      state = p_state,
      verdict_id = p_verdict_id,
      enthusiasm_id = p_enthusiasm_id,
      occasion_details = p_occasion_details,
      reason = p_reason,
      servings = p_servings,
      yield_text = nullif(trim(p_yield_text), ''),
      prep_time_minutes = p_prep_time_minutes,
      mixing_time_minutes = p_mixing_time_minutes,
      marinate_time_minutes = p_marinate_time_minutes,
      chill_time_minutes = p_chill_time_minutes,
      freeze_time_minutes = p_freeze_time_minutes,
      cook_time_minutes = p_cook_time_minutes,
      bake_time_minutes = p_bake_time_minutes,
      cooling_time_minutes = p_cooling_time_minutes,
      rest_time_minutes = p_rest_time_minutes,
      total_time_minutes = p_total_time_minutes,
      notes_markdown = coalesce(p_notes_markdown, ''),
      version = version + 1
    where recipes.id = p_recipe_id
      and recipes.account_id = owner_id
      and recipes.version = p_expected_version
    returning recipes.id, recipes.version into saved_id, saved_version;

    if saved_id is null then
      if exists (
        select 1 from public.recipes
        where recipes.id = p_recipe_id and recipes.account_id = owner_id
      ) then
        raise exception 'Recipe version conflict.' using errcode = '40001';
      end if;
      raise exception 'Recipe not found.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.recipe_picklist_assignments
  where account_id = owner_id and recipe_id = saved_id;

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'meal_type', value_id
  from unnest(coalesce(p_meal_type_ids, array[]::uuid[])) as value_id;

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'cuisine', value_id
  from unnest(coalesce(p_cuisine_ids, array[]::uuid[])) as value_id;

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'equipment', value_id
  from unnest(coalesce(p_equipment_ids, array[]::uuid[])) as value_id;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, numeric, text,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[]
) from public, anon;
grant execute on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, numeric, text,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[]
) to authenticated;