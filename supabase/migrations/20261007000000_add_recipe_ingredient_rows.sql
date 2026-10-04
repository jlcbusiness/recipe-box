create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (account_id, id)
);

create unique index ingredients_account_normalized_name_key
  on public.ingredients (account_id, (lower(trim(name))));

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  position integer not null check (position >= 0),
  is_main boolean not null default false,
  detail text not null default '',
  preparation text not null default '',
  unique (recipe_id, position),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, ingredient_id)
    references public.ingredients (account_id, id) on delete restrict
);

create index recipe_ingredients_account_recipe_order_idx
  on public.recipe_ingredients (account_id, recipe_id, position);

alter table public.ingredients enable row level security;
alter table public.recipe_ingredients enable row level security;

grant select, insert on public.ingredients to authenticated;
grant select, insert, delete on public.recipe_ingredients to authenticated;

create policy "Account owners can read ingredients"
  on public.ingredients
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can create ingredients during recipe save"
  on public.ingredients
  for insert
  to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

create policy "Account owners can read recipe ingredients"
  on public.recipe_ingredients
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can add recipe ingredients during recipe save"
  on public.recipe_ingredients
  for insert
  to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

create policy "Account owners can remove recipe ingredients during recipe save"
  on public.recipe_ingredients
  for delete
  to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

drop function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[]
);

create or replace function public.recipe_history_after_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_ingredients jsonb := coalesce(
    nullif(current_setting('app.recipe_ingredients_before', true), '')::jsonb,
    '[]'::jsonb
  );
  after_ingredients jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', recipe_ingredient.ingredient_id,
        'name', ingredient.name,
        'position', recipe_ingredient.position,
        'is_main', recipe_ingredient.is_main,
        'detail', recipe_ingredient.detail,
        'preparation', recipe_ingredient.preparation
      ) order by recipe_ingredient.position
    ),
    '[]'::jsonb
  )
  into after_ingredients
  from public.recipe_ingredients as recipe_ingredient
  join public.ingredients as ingredient
    on ingredient.account_id = recipe_ingredient.account_id
    and ingredient.id = recipe_ingredient.ingredient_id
  where recipe_ingredient.account_id = new.account_id
    and recipe_ingredient.recipe_id = new.id;

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
    case
      when tg_op = 'INSERT' then null
      else to_jsonb(old) || jsonb_build_object('ingredients', before_ingredients)
    end,
    to_jsonb(new) || jsonb_build_object('ingredients', after_ingredients)
  );

  return new;
end;
$$;

drop trigger recipe_history_after_save on public.recipes;
create constraint trigger recipe_history_after_save
  after insert or update on public.recipes
  deferrable initially deferred
  for each row execute function public.recipe_history_after_save();

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
  p_serves integer,
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
  p_ingredient_rows jsonb,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[]
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  saved_version integer;
  before_ingredients jsonb := '[]'::jsonb;
  row_data jsonb;
  row_ingredient_id uuid;
  row_ingredient_name text;
  resolved_ingredient_id uuid;
  row_position integer := 0;
  row_is_main boolean;
  row_detail text;
  row_preparation text;
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
        select 1 from public.recipe_picklist_values as picklist
        where picklist.account_id = owner_id
          and picklist.category = 'enthusiasm'
          and picklist.id = p_enthusiasm_id
          and picklist.value = 'Specific occasion'
      )
    )
    or (
      p_state = 'tried'
      and exists (
        select 1 from public.recipe_picklist_values as picklist
        where picklist.account_id = owner_id
          and picklist.category = 'verdict'
          and picklist.id = p_verdict_id
          and picklist.value = 'Specific occasion'
      )
    )
  ) then
    raise exception 'Occasion Details require Specific occasion.' using errcode = '23514';
  end if;

  if p_serves is not null and p_serves <= 0 then
    raise exception 'Serves must be greater than zero.' using errcode = '23514';
  end if;

  if p_ingredient_rows is null or jsonb_typeof(p_ingredient_rows) <> 'array' then
    raise exception 'Ingredient rows must be an array.' using errcode = '23514';
  end if;

  perform private.set_recipe_save_context();

  if p_recipe_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ingredient_id', recipe_ingredient.ingredient_id,
          'name', ingredient.name,
          'position', recipe_ingredient.position,
          'is_main', recipe_ingredient.is_main,
          'detail', recipe_ingredient.detail,
          'preparation', recipe_ingredient.preparation
        ) order by recipe_ingredient.position
      ),
      '[]'::jsonb
    )
    into before_ingredients
    from public.recipe_ingredients as recipe_ingredient
    join public.ingredients as ingredient
      on ingredient.account_id = recipe_ingredient.account_id
      and ingredient.id = recipe_ingredient.ingredient_id
    where recipe_ingredient.account_id = owner_id
      and recipe_ingredient.recipe_id = p_recipe_id;
  end if;

  perform pg_catalog.set_config('app.recipe_ingredients_before', before_ingredients::text, true);

  if p_recipe_id is null then
    insert into public.recipes (
      account_id, name, food_type_id, state, verdict_id, enthusiasm_id,
      occasion_details, reason, serves, prep_time_minutes,
      mixing_time_minutes, marinate_time_minutes, chill_time_minutes,
      freeze_time_minutes, cook_time_minutes, bake_time_minutes,
      cooling_time_minutes, rest_time_minutes, total_time_minutes, notes_markdown
    )
    values (
      owner_id, trim(p_name), p_food_type_id, p_state, p_verdict_id,
      p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
      p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
      p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
      p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
      p_total_time_minutes, coalesce(p_notes_markdown, '')
    )
    returning recipes.id, recipes.version into saved_id, saved_version;
  else
    update public.recipes as recipe
    set
      name = trim(p_name),
      food_type_id = p_food_type_id,
      state = p_state,
      verdict_id = p_verdict_id,
      enthusiasm_id = p_enthusiasm_id,
      occasion_details = p_occasion_details,
      reason = p_reason,
      serves = p_serves,
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
      version = recipe.version + 1
    where recipe.id = p_recipe_id
      and recipe.account_id = owner_id
      and recipe.version = p_expected_version
    returning recipe.id, recipe.version into saved_id, saved_version;

    if saved_id is null then
      if exists (
        select 1 from public.recipes as recipe
        where recipe.id = p_recipe_id and recipe.account_id = owner_id
      ) then
        raise exception 'Recipe version conflict.' using errcode = '40001';
      end if;
      raise exception 'Recipe not found.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.recipe_picklist_assignments as assignment
  where assignment.account_id = owner_id and assignment.recipe_id = saved_id;

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'meal_type', values.value_id
  from unnest(coalesce(p_meal_type_ids, array[]::uuid[])) as values(value_id);

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'cuisine', values.value_id
  from unnest(coalesce(p_cuisine_ids, array[]::uuid[])) as values(value_id);

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'equipment', values.value_id
  from unnest(coalesce(p_equipment_ids, array[]::uuid[])) as values(value_id);

  delete from public.recipe_ingredients as recipe_ingredient
  where recipe_ingredient.account_id = owner_id
    and recipe_ingredient.recipe_id = saved_id;

  for row_data in
    select ingredient_row.value
    from jsonb_array_elements(p_ingredient_rows) with ordinality as ingredient_row(value, ordinal)
    order by ingredient_row.ordinal
  loop
    if jsonb_typeof(row_data) <> 'object' then
      raise exception 'Each ingredient row must be an object.' using errcode = '23514';
    end if;

    row_ingredient_id := nullif(row_data->>'ingredient_id', '')::uuid;
    row_ingredient_name := nullif(trim(row_data->>'ingredient_name'), '');
    if (row_ingredient_id is null) = (row_ingredient_name is null) then
      raise exception 'Choose exactly one ingredient for each row.' using errcode = '23514';
    end if;

    row_is_main := coalesce((row_data->>'is_main')::boolean, false);
    row_detail := trim(coalesce(row_data->>'detail', ''));
    row_preparation := trim(coalesce(row_data->>'preparation', ''));

    if row_ingredient_id is not null then
      select ingredient.id
      into resolved_ingredient_id
      from public.ingredients as ingredient
      where ingredient.id = row_ingredient_id
        and ingredient.account_id = owner_id;

      if resolved_ingredient_id is null then
        raise exception 'Ingredient not found.' using errcode = 'P0002';
      end if;
    else
      insert into public.ingredients (account_id, name)
      values (owner_id, row_ingredient_name)
      on conflict (account_id, (lower(trim(name)))) do nothing
      returning ingredients.id into resolved_ingredient_id;

      if resolved_ingredient_id is null then
        select ingredient.id
        into resolved_ingredient_id
        from public.ingredients as ingredient
        where ingredient.account_id = owner_id
          and lower(trim(ingredient.name)) = lower(row_ingredient_name);
      end if;
    end if;

    insert into public.recipe_ingredients (
      account_id, recipe_id, ingredient_id, position, is_main, detail, preparation
    )
    values (
      owner_id, saved_id, resolved_ingredient_id, row_position,
      row_is_main, row_detail, row_preparation
    );
    row_position := row_position + 1;
  end loop;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, jsonb, uuid[], uuid[], uuid[]
) from public, anon;
grant execute on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, jsonb, uuid[], uuid[], uuid[]
) to authenticated;