alter table public.recipes
  add column nutrition_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrition_overrides) = 'object');

alter table public.recipe_ingredients
  add column nutrition_serving_size_override jsonb
    check (
      nutrition_serving_size_override is null
      or jsonb_typeof(nutrition_serving_size_override) = 'object'
    ),
  add column nutrition_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrition_overrides) = 'object');

create table public.ingredient_nutrition_profiles (
  account_id uuid not null references public.accounts (id) on delete cascade,
  ingredient_id uuid not null,
  serving_size_amount numeric not null,
  serving_size_dimension text not null check (serving_size_dimension in ('volume', 'weight')),
  serving_size_unit_code text not null,
  nutrients jsonb not null check (jsonb_typeof(nutrients) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, ingredient_id),
  foreign key (account_id, ingredient_id)
    references public.ingredients (account_id, id) on delete cascade,
  check (
    serving_size_amount > 0
    and serving_size_amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    and (
      (serving_size_dimension = 'volume'
        and serving_size_unit_code in ('tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l'))
      or (serving_size_dimension = 'weight'
        and serving_size_unit_code in ('oz', 'lb', 'g', 'kg'))
    )
  )
);

create table public.ingredient_measure_equivalents (
  account_id uuid not null references public.accounts (id) on delete cascade,
  ingredient_id uuid not null,
  measurement_type text not null check (measurement_type in ('count', 'informal')),
  picklist_value_id uuid,
  picklist_value text,
  volume_amount numeric,
  volume_unit_code text,
  weight_amount numeric,
  weight_unit_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, ingredient_id),
  foreign key (account_id, ingredient_id)
    references public.ingredients (account_id, id) on delete cascade,
  check (
    (measurement_type = 'count' and picklist_value_id is null and picklist_value is null)
    or (
      measurement_type = 'informal'
      and picklist_value_id is not null
      and picklist_value is not null
      and pg_catalog.btrim(picklist_value) <> ''
    )
  ),
  check (
    (volume_amount is null and volume_unit_code is null)
    or (
      volume_amount > 0
      and volume_amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      and volume_unit_code in ('tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l')
    )
  ),
  check (
    (weight_amount is null and weight_unit_code is null)
    or (
      weight_amount > 0
      and weight_amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      and weight_unit_code in ('oz', 'lb', 'g', 'kg')
    )
  ),
  check (volume_amount is not null or weight_amount is not null)
);

alter table public.ingredient_nutrition_profiles enable row level security;
alter table public.ingredient_measure_equivalents enable row level security;
revoke all on public.ingredient_nutrition_profiles from public, anon, authenticated;
revoke all on public.ingredient_measure_equivalents from public, anon, authenticated;
grant select on public.ingredient_nutrition_profiles to authenticated;
grant select on public.ingredient_measure_equivalents to authenticated;

create policy "Account owners can read ingredient nutrition profiles"
  on public.ingredient_nutrition_profiles
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can read ingredient measure equivalents"
  on public.ingredient_measure_equivalents
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

alter table public.ingredient_catalog_history
  drop constraint ingredient_catalog_history_event_type_check;

alter table public.ingredient_catalog_history
  add constraint ingredient_catalog_history_event_type_check
  check (
    event_type in (
      'ingredient.added',
      'ingredient.renamed',
      'ingredient.reordered',
      'ingredient.deleted',
      'ingredient.merged',
      'ingredient.density_set',
      'ingredient.density_removed',
      'ingredient.density_reassigned',
      'ingredient.nutrition_profile_set',
      'ingredient.nutrition_profile_removed',
      'ingredient.measure_equivalent_set',
      'ingredient.measure_equivalent_removed',
      'ingredient.nutrition_reassigned',
      'ingredient.measure_equivalent_reassigned'
    )
  );

create function private.is_valid_nutrition_basis(p_basis jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  amount numeric;
  dimension text;
  unit_code text;
begin
  if jsonb_typeof(p_basis) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(p_basis)) <> 3
    or not (p_basis ?& array['amount', 'dimension', 'unitCode'])
    or jsonb_typeof(p_basis->'amount') is distinct from 'number'
    or jsonb_typeof(p_basis->'dimension') is distinct from 'string'
    or jsonb_typeof(p_basis->'unitCode') is distinct from 'string' then
    return false;
  end if;

  amount := (p_basis->>'amount')::numeric;
  dimension := p_basis->>'dimension';
  unit_code := p_basis->>'unitCode';
  return amount > 0
    and amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    and (
      (dimension = 'volume'
        and unit_code in ('tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l'))
      or (dimension = 'weight' and unit_code in ('oz', 'lb', 'g', 'kg'))
    );
exception when others then
  return false;
end;
$$;

create function private.is_valid_nutrition_values(
  p_values jsonb,
  p_field_overrides boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry record;
  value_amount numeric;
begin
  if jsonb_typeof(p_values) is distinct from 'object' then
    return false;
  end if;
  for entry in select key, value from jsonb_each(p_values)
  loop
    if entry.key not in (
      'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
      'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
      'vitamin_d', 'calcium', 'iron', 'potassium', 'vitamin_a', 'vitamin_c', 'vitamin_e',
      'vitamin_k', 'thiamin', 'riboflavin', 'niacin', 'vitamin_b6', 'folate',
      'vitamin_b12', 'biotin', 'pantothenic_acid', 'choline', 'phosphorus', 'iodine',
      'magnesium', 'zinc', 'selenium', 'copper', 'manganese', 'chromium', 'molybdenum',
      'chloride'
    ) then
      return false;
    end if;

    if p_field_overrides then
      if jsonb_typeof(entry.value) is distinct from 'object'
        or (select count(*) from pg_catalog.jsonb_object_keys(entry.value)) <> 3
        or not (entry.value ?& array['value', 'basisSignature', 'acknowledgedBasisSignature'])
        or jsonb_typeof(entry.value->'value') is distinct from 'number'
        or jsonb_typeof(entry.value->'basisSignature') is distinct from 'string'
        or pg_catalog.btrim(entry.value->>'basisSignature') = ''
        or not (
          jsonb_typeof(entry.value->'acknowledgedBasisSignature') = 'null'
          or (
            jsonb_typeof(entry.value->'acknowledgedBasisSignature') = 'string'
            and pg_catalog.btrim(entry.value->>'acknowledgedBasisSignature') <> ''
          )
        ) then
        return false;
      end if;
      value_amount := (entry.value->>'value')::numeric;
    else
      if jsonb_typeof(entry.value) is distinct from 'number' then
        return false;
      end if;
      value_amount := (entry.value #>> '{}')::numeric;
    end if;

    if value_amount < 0
      or value_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create function private.is_valid_nutrition_equivalent_measure(
  p_measure jsonb,
  p_dimension text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  amount numeric;
  unit_code text;
begin
  if jsonb_typeof(p_measure) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(p_measure)) <> 2
    or not (p_measure ?& array['amount', 'unitCode'])
    or jsonb_typeof(p_measure->'amount') is distinct from 'number'
    or jsonb_typeof(p_measure->'unitCode') is distinct from 'string' then
    return false;
  end if;
  amount := (p_measure->>'amount')::numeric;
  unit_code := p_measure->>'unitCode';
  return amount > 0
    and amount not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    and (
      (p_dimension = 'volume'
        and unit_code in ('tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l'))
      or (p_dimension = 'weight' and unit_code in ('oz', 'lb', 'g', 'kg'))
    );
exception when others then
  return false;
end;
$$;

revoke all on function private.is_valid_nutrition_basis(jsonb)
  from public, anon, authenticated;
revoke all on function private.is_valid_nutrition_values(jsonb, boolean)
  from public, anon, authenticated;
revoke all on function private.is_valid_nutrition_equivalent_measure(jsonb, text)
  from public, anon, authenticated;
grant execute on function private.is_valid_nutrition_basis(jsonb),
  private.is_valid_nutrition_values(jsonb, boolean) to authenticated;

create function public.manage_ingredient_nutrition(
  p_action text,
  p_expected_revision integer,
  p_ingredient_id uuid,
  p_profile jsonb default null,
  p_equivalent jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_revision integer;
  next_revision integer;
  ingredient_name text;
  before_data jsonb;
  after_data jsonb;
  event_name text;
  basis jsonb;
  nutrients jsonb;
  equivalent_type text;
  equivalent_picklist_id uuid;
  equivalent_picklist_value text;
  volume jsonb;
  weight jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_action not in (
    'profile_set', 'profile_remove', 'equivalent_set', 'equivalent_remove'
  ) then
    raise exception 'Ingredient nutrition action is invalid.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 or p_ingredient_id is null then
    raise exception 'Choose a valid ingredient nutrition change.' using errcode = '22023';
  end if;

  select revision into current_revision
  from public.ingredient_catalog_revisions
  where account_id = owner_id
  for update;
  if current_revision is null then
    raise exception 'Ingredient catalog was not found.' using errcode = 'P0002';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'The ingredient catalog changed in another session.' using errcode = 'PT409';
  end if;

  select name into ingredient_name
  from public.ingredients
  where account_id = owner_id and id = p_ingredient_id
  for update;
  if not found then
    raise exception 'Ingredient was not found.' using errcode = 'P0002';
  end if;

  if p_action like 'profile_%' then
    select to_jsonb(profile) - 'account_id'
    into before_data
    from public.ingredient_nutrition_profiles as profile
    where profile.account_id = owner_id and profile.ingredient_id = p_ingredient_id
    for update;

    if p_action = 'profile_set' then
      if jsonb_typeof(p_profile) is distinct from 'object'
        or (select count(*) from pg_catalog.jsonb_object_keys(p_profile)) <> 2
        or not (p_profile ?& array['servingSize', 'nutrients'])
        or not private.is_valid_nutrition_basis(p_profile->'servingSize')
        or not private.is_valid_nutrition_values(p_profile->'nutrients')
        or not ((p_profile->'nutrients') ? 'calories') then
        raise exception 'Enter a valid serving size and nonnegative nutrition values including Calories.'
          using errcode = '23514';
      end if;
      basis := p_profile->'servingSize';
      nutrients := p_profile->'nutrients';
      insert into public.ingredient_nutrition_profiles (
        account_id, ingredient_id, serving_size_amount, serving_size_dimension,
        serving_size_unit_code, nutrients
      ) values (
        owner_id, p_ingredient_id, (basis->>'amount')::numeric, basis->>'dimension',
        basis->>'unitCode', nutrients
      )
      on conflict (account_id, ingredient_id) do update
      set serving_size_amount = excluded.serving_size_amount,
          serving_size_dimension = excluded.serving_size_dimension,
          serving_size_unit_code = excluded.serving_size_unit_code,
          nutrients = excluded.nutrients,
          updated_at = now();
      event_name := 'ingredient.nutrition_profile_set';
    else
      if before_data is null then
        raise exception 'Ingredient nutrition profile was not found.' using errcode = 'P0002';
      end if;
      delete from public.ingredient_nutrition_profiles
      where account_id = owner_id and ingredient_id = p_ingredient_id;
      event_name := 'ingredient.nutrition_profile_removed';
    end if;

    select to_jsonb(profile) - 'account_id'
    into after_data
    from public.ingredient_nutrition_profiles as profile
    where profile.account_id = owner_id and profile.ingredient_id = p_ingredient_id;
  else
    select to_jsonb(equivalent) - 'account_id'
    into before_data
    from public.ingredient_measure_equivalents as equivalent
    where equivalent.account_id = owner_id and equivalent.ingredient_id = p_ingredient_id
    for update;

    if p_action = 'equivalent_set' then
      if jsonb_typeof(p_equivalent) is distinct from 'object'
        or (select count(*) from pg_catalog.jsonb_object_keys(p_equivalent)) <> 5
        or not (p_equivalent ?& array[
          'measurementType', 'picklistValueId', 'picklistValue', 'volume', 'weight'
        ]) then
        raise exception 'Enter a valid Count or Things equivalent.' using errcode = '23514';
      end if;
      equivalent_type := p_equivalent->>'measurementType';
      equivalent_picklist_id := nullif(p_equivalent->>'picklistValueId', '')::uuid;
      equivalent_picklist_value := nullif(pg_catalog.btrim(p_equivalent->>'picklistValue'), '');
      volume := p_equivalent->'volume';
      weight := p_equivalent->'weight';
      if equivalent_type not in ('count', 'informal')
        or (
          (jsonb_typeof(volume) = 'null'
            or private.is_valid_nutrition_equivalent_measure(volume, 'volume')) is not true
        )
        or (
          (jsonb_typeof(weight) = 'null'
            or private.is_valid_nutrition_equivalent_measure(weight, 'weight')) is not true
        )
        or (jsonb_typeof(volume) = 'null' and jsonb_typeof(weight) = 'null')
        or (
          equivalent_type = 'count'
          and (equivalent_picklist_id is not null or equivalent_picklist_value is not null)
        )
        or (
          equivalent_type = 'informal'
          and (
            equivalent_picklist_id is null
            or equivalent_picklist_value is null
            or not exists (
              select 1
              from public.recipe_picklist_values as value
              where value.account_id = owner_id
                and value.id = equivalent_picklist_id
                and value.category = 'informal_unit'
                and value.display_value = equivalent_picklist_value
            )
          )
        ) then
        raise exception 'Enter a valid Count or Things equivalent.' using errcode = '23514';
      end if;

      insert into public.ingredient_measure_equivalents (
        account_id, ingredient_id, measurement_type, picklist_value_id, picklist_value,
        volume_amount, volume_unit_code, weight_amount, weight_unit_code
      ) values (
        owner_id, p_ingredient_id, equivalent_type, equivalent_picklist_id,
        equivalent_picklist_value,
        case when jsonb_typeof(volume) = 'object' then (volume->>'amount')::numeric end,
        case when jsonb_typeof(volume) = 'object' then volume->>'unitCode' end,
        case when jsonb_typeof(weight) = 'object' then (weight->>'amount')::numeric end,
        case when jsonb_typeof(weight) = 'object' then weight->>'unitCode' end
      )
      on conflict (account_id, ingredient_id) do update
      set measurement_type = excluded.measurement_type,
          picklist_value_id = excluded.picklist_value_id,
          picklist_value = excluded.picklist_value,
          volume_amount = excluded.volume_amount,
          volume_unit_code = excluded.volume_unit_code,
          weight_amount = excluded.weight_amount,
          weight_unit_code = excluded.weight_unit_code,
          updated_at = now();
      event_name := 'ingredient.measure_equivalent_set';
    else
      if before_data is null then
        raise exception 'Ingredient measure equivalent was not found.' using errcode = 'P0002';
      end if;
      delete from public.ingredient_measure_equivalents
      where account_id = owner_id and ingredient_id = p_ingredient_id;
      event_name := 'ingredient.measure_equivalent_removed';
    end if;

    select to_jsonb(equivalent) - 'account_id'
    into after_data
    from public.ingredient_measure_equivalents as equivalent
    where equivalent.account_id = owner_id and equivalent.ingredient_id = p_ingredient_id;
  end if;

  update public.ingredient_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id
  returning revision into next_revision;

  insert into public.ingredient_catalog_history (
    account_id, actor_user_id, event_type, ingredient_id, before_data, after_data
  ) values (
    owner_id, owner_id, event_name, p_ingredient_id,
    jsonb_build_object(
      'ingredient_id', p_ingredient_id,
      'ingredient_name', ingredient_name,
      case when p_action like 'profile_%' then 'nutrition_profile' else 'measure_equivalent' end,
      before_data
    ),
    jsonb_build_object(
      'ingredient_id', p_ingredient_id,
      'ingredient_name', ingredient_name,
      case when p_action like 'profile_%' then 'nutrition_profile' else 'measure_equivalent' end,
      after_data
    )
  );

  return next_revision;
end;
$$;

revoke all on function public.manage_ingredient_nutrition(text, integer, uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.manage_ingredient_nutrition(text, integer, uuid, jsonb, jsonb)
  to authenticated;

create function private.transfer_ingredient_nutrition_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := nullif(
    current_setting('app.ingredient_merge_target_id', true), ''
  )::uuid;
  source_profile jsonb;
  target_profile jsonb;
  source_equivalent jsonb;
  target_equivalent jsonb;
begin
  if target_id is null or target_id = old.id then
    return old;
  end if;

  select to_jsonb(profile) - 'account_id'
  into source_profile
  from public.ingredient_nutrition_profiles as profile
  where profile.account_id = old.account_id and profile.ingredient_id = old.id;
  select to_jsonb(profile) - 'account_id'
  into target_profile
  from public.ingredient_nutrition_profiles as profile
  where profile.account_id = old.account_id and profile.ingredient_id = target_id;
  if source_profile is not null and target_profile is null then
    update public.ingredient_nutrition_profiles
    set ingredient_id = target_id
    where account_id = old.account_id and ingredient_id = old.id;
    insert into public.ingredient_catalog_history (
      account_id, actor_user_id, event_type, ingredient_id, before_data, after_data
    ) values (
      old.account_id, auth.uid(), 'ingredient.nutrition_reassigned', target_id,
      jsonb_build_object('ingredient_id', old.id, 'nutrition_profile', source_profile),
      jsonb_build_object('ingredient_id', target_id, 'nutrition_profile', source_profile)
    );
  end if;

  select to_jsonb(equivalent) - 'account_id'
  into source_equivalent
  from public.ingredient_measure_equivalents as equivalent
  where equivalent.account_id = old.account_id and equivalent.ingredient_id = old.id;
  select to_jsonb(equivalent) - 'account_id'
  into target_equivalent
  from public.ingredient_measure_equivalents as equivalent
  where equivalent.account_id = old.account_id and equivalent.ingredient_id = target_id;
  if source_equivalent is not null and target_equivalent is null then
    update public.ingredient_measure_equivalents
    set ingredient_id = target_id
    where account_id = old.account_id and ingredient_id = old.id;
    insert into public.ingredient_catalog_history (
      account_id, actor_user_id, event_type, ingredient_id, before_data, after_data
    ) values (
      old.account_id, auth.uid(), 'ingredient.measure_equivalent_reassigned', target_id,
      jsonb_build_object('ingredient_id', old.id, 'measure_equivalent', source_equivalent),
      jsonb_build_object('ingredient_id', target_id, 'measure_equivalent', source_equivalent)
    );
  end if;
  return old;
end;
$$;

revoke all on function private.transfer_ingredient_nutrition_before_delete()
  from public, anon, authenticated;
create trigger ingredients_transfer_nutrition_before_merge
  before delete on public.ingredients
  for each row execute function private.transfer_ingredient_nutrition_before_delete();

alter function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  rename to manage_ingredient_catalog_without_nutrition;
revoke all on function public.manage_ingredient_catalog_without_nutrition(
  text, integer, uuid, text, uuid[], uuid
) from public, anon, authenticated;

create function public.manage_ingredient_catalog(
  p_action text,
  p_expected_revision integer,
  p_ingredient_id uuid default null,
  p_name text default null,
  p_ordered_ids uuid[] default null,
  p_replacement_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision integer;
begin
  if p_action = 'merge' then
    perform pg_catalog.set_config(
      'app.ingredient_merge_target_id',
      coalesce(p_replacement_id::text, ''),
      true
    );
  end if;
  select public.manage_ingredient_catalog_without_nutrition(
    p_action, p_expected_revision, p_ingredient_id, p_name, p_ordered_ids, p_replacement_id
  ) into next_revision;
  return next_revision;
end;
$$;

revoke all on function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  from public, anon;
grant execute on function public.manage_ingredient_catalog(text, integer, uuid, text, uuid[], uuid)
  to authenticated;

create function private.apply_recipe_nutrition_before_save()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rows_payload jsonb;
  row_payload jsonb;
  basis jsonb;
  overrides jsonb;
begin
  if current_setting('app.recipe_nutrition_save', true) = 'on' then
    overrides := nullif(current_setting('app.recipe_nutrition_overrides', true), '')::jsonb;
    if not private.is_valid_nutrition_values(overrides) then
      raise exception 'Recipe nutrition contains invalid values.' using errcode = '23514';
    end if;
    new.nutrition_overrides := overrides;
  elsif current_setting('app.database_import_context', true) = 'on' then
    rows_payload := nullif(
      current_setting('app.database_import_recipes', true), ''
    )::jsonb;
    select item.value into row_payload
    from jsonb_array_elements(rows_payload) as item(value)
    where item.value->>'id' = new.id::text;
    if row_payload is not null then
      overrides := coalesce(row_payload->'nutrition_overrides', '{}'::jsonb);
      if not private.is_valid_nutrition_values(overrides) then
        raise exception 'Imported recipe nutrition contains invalid values.'
          using errcode = '23514';
      end if;
      new.nutrition_overrides := overrides;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_recipe_nutrition_before_save()
  from public, anon, authenticated;
create trigger recipes_apply_nutrition_before_save
  before insert or update on public.recipes
  for each row execute function private.apply_recipe_nutrition_before_save();

create function private.apply_recipe_ingredient_nutrition_before_save()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rows_payload jsonb;
  row_payload jsonb;
  basis jsonb;
  overrides jsonb;
begin
  if current_setting('app.recipe_save_context', true) = 'on'
    and current_setting('app.recipe_nutrition_save', true) = 'on' then
    rows_payload := nullif(
      current_setting('app.recipe_ingredient_nutrition_rows', true), ''
    )::jsonb;
    select item.value into row_payload
    from jsonb_array_elements(rows_payload) with ordinality as item(value, ordinal)
    where item.ordinal - 1 = new.position;
    if row_payload is null then
      raise exception 'Recipe nutrition data is missing an ingredient row.'
        using errcode = '23514';
    end if;
    basis := row_payload->'nutrition_serving_size_override';
    if basis is null or jsonb_typeof(basis) = 'null' then
      basis := null;
    elsif not private.is_valid_nutrition_basis(basis) then
      raise exception 'Recipe ingredient serving size is invalid.' using errcode = '23514';
    end if;
    overrides := coalesce(row_payload->'nutrition_overrides', '{}'::jsonb);
    if not private.is_valid_nutrition_values(overrides, true) then
      raise exception 'Recipe ingredient nutrition contains invalid values.'
        using errcode = '23514';
    end if;
    new.nutrition_serving_size_override := basis;
    new.nutrition_overrides := overrides;
  elsif current_setting('app.database_import_context', true) = 'on' then
    rows_payload := nullif(
      current_setting('app.database_import_recipe_ingredients', true), ''
    )::jsonb;
    select item.value into row_payload
    from jsonb_array_elements(rows_payload) as item(value)
    where item.value->>'id' = new.id::text;
    if row_payload is not null then
      basis := row_payload->'nutrition_serving_size_override';
      if basis is null or jsonb_typeof(basis) = 'null' then
        basis := null;
      elsif not private.is_valid_nutrition_basis(basis) then
        raise exception 'Imported ingredient serving size is invalid.' using errcode = '23514';
      end if;
      overrides := coalesce(row_payload->'nutrition_overrides', '{}'::jsonb);
      if not private.is_valid_nutrition_values(overrides, true) then
        raise exception 'Imported ingredient nutrition contains invalid values.'
          using errcode = '23514';
      end if;
      new.nutrition_serving_size_override := basis;
      new.nutrition_overrides := overrides;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_recipe_ingredient_nutrition_before_save()
  from public, anon, authenticated;
create trigger recipe_ingredients_apply_nutrition_before_save
  before insert or update on public.recipe_ingredients
  for each row execute function private.apply_recipe_ingredient_nutrition_before_save();

create function public.save_recipe_with_nutrition(
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
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[],
  p_ingredient_rows jsonb,
  p_instruction_steps jsonb,
  p_publication_id uuid,
  p_publication_page text,
  p_recipe_url text,
  p_recipe_relationships jsonb,
  p_tag_ids uuid[],
  p_ingredient_sets jsonb,
  p_score smallint,
  p_makes_quantity integer,
  p_makes_thing text,
  p_nutrition_overrides jsonb
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_ingredient_rows is null or jsonb_typeof(p_ingredient_rows) is distinct from 'array'
    or not private.is_valid_nutrition_values(p_nutrition_overrides) then
    raise exception 'Recipe nutrition data is invalid.' using errcode = '23514';
  end if;

  for row_payload in select item.value from jsonb_array_elements(p_ingredient_rows) as item(value)
  loop
    if jsonb_typeof(row_payload) is distinct from 'object'
      or not (row_payload ? 'recipe_ingredient_id')
      or (row_payload ? 'nutrition_serving_size_override'
        and jsonb_typeof(row_payload->'nutrition_serving_size_override') <> 'null'
        and not private.is_valid_nutrition_basis(row_payload->'nutrition_serving_size_override'))
      or not private.is_valid_nutrition_values(
        coalesce(row_payload->'nutrition_overrides', '{}'::jsonb), true
      ) then
      raise exception 'Recipe ingredient nutrition data is invalid.' using errcode = '23514';
    end if;
  end loop;

  perform pg_catalog.set_config('app.recipe_nutrition_save', 'on', true);
  perform pg_catalog.set_config('app.recipe_nutrition_overrides', p_nutrition_overrides::text, true);
  perform pg_catalog.set_config(
    'app.recipe_ingredient_nutrition_rows', p_ingredient_rows::text, true
  );

  return query
  select saved.id, saved.version
  from public.save_recipe_with_makes(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, p_ingredient_rows, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url, p_recipe_relationships, p_tag_ids,
    p_ingredient_sets, p_score, p_makes_quantity, p_makes_thing
  ) as saved;
end;
$$;

revoke all on function public.save_recipe_with_nutrition(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb, smallint, integer, text, jsonb
) from public, anon;
grant execute on function public.save_recipe_with_nutrition(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb, smallint, integer, text, jsonb
) to authenticated;

create or replace function private.capture_recipe_ingredient_amounts_before()
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
  enriched_ingredients jsonb;
begin
  select coalesce(
    jsonb_agg(
      item.value || jsonb_build_object(
        'ingredient_set_id', ingredient.ingredient_set_id,
        'portion_one_ratio', ingredient.portion_one_ratio,
        'size_value', ingredient.size_value,
        'size_unit', ingredient.size_unit,
        'nutrition_serving_size_override', ingredient.nutrition_serving_size_override,
        'nutrition_overrides', ingredient.nutrition_overrides
      ) order by item.ordinality
    ),
    '[]'::jsonb
  )
  into enriched_ingredients
  from jsonb_array_elements(before_ingredients) with ordinality as item(value, ordinality)
  left join public.recipe_ingredients as ingredient
    on ingredient.account_id = old.account_id
    and ingredient.recipe_id = old.id
    and ingredient.position = (item.value->>'position')::integer;

  perform pg_catalog.set_config(
    'app.recipe_ingredients_before', enriched_ingredients::text, true
  );
  return new;
end;
$$;

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
  before_ingredient_sets jsonb := coalesce(
    nullif(current_setting('app.recipe_ingredient_sets_before', true), '')::jsonb,
    '[]'::jsonb
  );
  after_ingredients jsonb;
  after_ingredient_sets jsonb;
begin
  if session_user = 'supabase_auth_admin'
    and old.trashed_at is not null
    and old.trashed_at is not distinct from new.trashed_at
    and old.trashed_by_user_id is not null
    and new.trashed_by_user_id is null
  then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ingredient_set.id,
    'label', ingredient_set.label,
    'position', ingredient_set.position
  ) order by ingredient_set.position), '[]'::jsonb)
  into after_ingredient_sets
  from public.recipe_ingredient_sets as ingredient_set
  where ingredient_set.account_id = new.account_id
    and ingredient_set.recipe_id = new.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', recipe_ingredient.ingredient_id,
    'name', ingredient.name,
    'ingredient_set_id', recipe_ingredient.ingredient_set_id,
    'position', recipe_ingredient.position,
    'is_main', recipe_ingredient.is_main,
    'detail', recipe_ingredient.detail,
    'preparation', recipe_ingredient.preparation,
    'portion_one_ratio', recipe_ingredient.portion_one_ratio,
    'size_value', recipe_ingredient.size_value,
    'size_unit', recipe_ingredient.size_unit,
    'nutrition_serving_size_override', recipe_ingredient.nutrition_serving_size_override,
    'nutrition_overrides', recipe_ingredient.nutrition_overrides,
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'measurement_type', measurement.measurement_type,
        'amount_min', measurement.amount_min,
        'amount_max', measurement.amount_max,
        'unit_code', measurement.unit_code,
        'picklist_value_id', measurement.picklist_value_id,
        'picklist_value', picklist.value
      ) order by measurement.position)
      from public.recipe_ingredient_measurements as measurement
      left join public.recipe_picklist_values as picklist
        on picklist.account_id = measurement.account_id
        and picklist.id = measurement.picklist_value_id
      where measurement.account_id = recipe_ingredient.account_id
        and measurement.recipe_ingredient_id = recipe_ingredient.id
    ), '[]'::jsonb)
  ) order by recipe_ingredient.position), '[]'::jsonb)
  into after_ingredients
  from public.recipe_ingredients as recipe_ingredient
  join public.ingredients as ingredient
    on ingredient.account_id = recipe_ingredient.account_id
    and ingredient.id = recipe_ingredient.ingredient_id
  where recipe_ingredient.account_id = new.account_id
    and recipe_ingredient.recipe_id = new.id;

  insert into public.recipe_history (
    account_id, actor_user_id, record_id, event_type, before_data, after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    case
      when tg_op = 'INSERT' then 'recipe.created'
      when old.trashed_at is null and new.trashed_at is not null then 'recipe.trashed'
      when old.trashed_at is not null and new.trashed_at is null then 'recipe.restored'
      else 'recipe.updated'
    end,
    case
      when tg_op = 'INSERT' then null
      else to_jsonb(old) || jsonb_build_object(
        'ingredients', before_ingredients,
        'ingredient_sets', before_ingredient_sets
      )
    end,
    to_jsonb(new) || jsonb_build_object(
      'ingredients', after_ingredients,
      'ingredient_sets', after_ingredient_sets
    )
  );

  return new;
end;
$$;

update public.recipe_ingredient_measurements as measurement
set measurement_type = 'volume',
    amount_min = measurement.amount_min * (1.0 / 16.0),
    amount_max = case
      when measurement.amount_max is null then null
      else measurement.amount_max * (1.0 / 16.0)
    end,
    unit_code = 'tsp',
    picklist_value_id = null
from public.recipe_picklist_values as value
where measurement.account_id = value.account_id
  and measurement.picklist_value_id = value.id
  and measurement.measurement_type = 'informal'
  and value.category = 'informal_unit'
  and lower(btrim(value.value)) = 'pinch';

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.seed_recipe_picklists_for_account(uuid)'::regprocedure
  );
  pinch_default constant text := $default$      ('informal_unit', 'Pinch', 8, false),
$default$;
begin
  if pg_catalog.strpos(function_definition, pinch_default) = 0 then
    raise exception 'Could not find Pinch in the default informal-unit picklist.';
  end if;
  function_definition := pg_catalog.replace(function_definition, pinch_default, '');
  execute function_definition;
end
$$;

delete from public.recipe_picklist_values
where category = 'informal_unit'
  and lower(btrim(value)) = 'pinch';

alter function public.read_export_snapshot(uuid)
  rename to read_export_snapshot_without_nutrition;

create function public.read_export_snapshot(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  snapshot := public.read_export_snapshot_without_nutrition(p_account_id);
  if snapshot is null then
    return null;
  end if;

  snapshot := jsonb_set(
    snapshot,
    '{records,ingredient_nutrition_profiles}',
    coalesce((
      select jsonb_agg(to_jsonb(profile))
      from public.ingredient_nutrition_profiles as profile
      where profile.account_id = p_account_id
    ), '[]'::jsonb),
    true
  );
  return jsonb_set(
    snapshot,
    '{records,ingredient_measure_equivalents}',
    coalesce((
      select jsonb_agg(to_jsonb(equivalent))
      from public.ingredient_measure_equivalents as equivalent
      where equivalent.account_id = p_account_id
    ), '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function public.read_export_snapshot_without_nutrition(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_export_snapshot_without_nutrition(uuid) to service_role;
revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;

alter function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
)
rename to commit_database_import_with_media_sources_without_nutrition;

create function public.commit_database_import_with_media_sources(
  p_account_id uuid,
  p_account_preferences jsonb,
  p_records jsonb,
  p_expected_versions jsonb,
  p_replace_recipe_ids uuid[],
  p_replace_publication_ids uuid[],
  p_media_sources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := p_account_id;
  result jsonb;
  record_data jsonb;
  imported_ingredient_id uuid;
  serving_basis jsonb;
  volume jsonb;
  weight jsonb;
  picklist_id uuid;
  catalog_changed boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_records) is distinct from 'object'
    or jsonb_typeof(p_records->'recipes') is distinct from 'array'
    or jsonb_typeof(p_records->'ingredient_nutrition_profiles') is distinct from 'array'
    or jsonb_typeof(p_records->'ingredient_measure_equivalents') is distinct from 'array' then
    raise exception 'Nutrition import records are invalid.' using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.database_import_recipes', (p_records->'recipes')::text, true
  );
  result := public.commit_database_import_with_media_sources_without_nutrition(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids,
    p_media_sources
  );

  for record_data in
    select item.value
    from jsonb_array_elements(p_records->'ingredient_nutrition_profiles') as item(value)
  loop
    imported_ingredient_id := nullif(record_data->>'ingredient_id', '')::uuid;
    serving_basis := jsonb_build_object(
      'amount', record_data->'serving_size_amount',
      'dimension', record_data->'serving_size_dimension',
      'unitCode', record_data->'serving_size_unit_code'
    );
    if imported_ingredient_id is null
      or not private.is_valid_nutrition_basis(serving_basis)
      or not private.is_valid_nutrition_values(record_data->'nutrients')
      or not (record_data->'nutrients' ? 'calories') then
      raise exception 'An imported nutrition profile is invalid.' using errcode = '23514';
    end if;

    insert into public.ingredient_nutrition_profiles (
      account_id, ingredient_id, serving_size_amount, serving_size_dimension,
      serving_size_unit_code, nutrients, created_at, updated_at
    ) values (
      owner_id, imported_ingredient_id, (serving_basis->>'amount')::numeric,
      serving_basis->>'dimension', serving_basis->>'unitCode', record_data->'nutrients',
      coalesce(nullif(record_data->>'created_at', '')::timestamptz, now()),
      coalesce(nullif(record_data->>'updated_at', '')::timestamptz, now())
    ) on conflict (account_id, ingredient_id) do nothing;
    if found then
      catalog_changed := true;
      insert into public.ingredient_catalog_history (
        account_id, actor_user_id, event_type, ingredient_id, before_data, after_data
      )
      select
        owner_id, owner_id, 'ingredient.nutrition_profile_set', profile.ingredient_id,
        jsonb_build_object(
          'ingredient_id', profile.ingredient_id,
          'ingredient_name', ingredient.name,
          'nutrition_profile', null
        ),
        jsonb_build_object(
          'ingredient_id', profile.ingredient_id,
          'ingredient_name', ingredient.name,
          'nutrition_profile', to_jsonb(profile) - 'account_id'
        )
      from public.ingredient_nutrition_profiles as profile
      join public.ingredients as ingredient
        on ingredient.account_id = profile.account_id
        and ingredient.id = profile.ingredient_id
      where profile.account_id = owner_id
        and profile.ingredient_id = imported_ingredient_id;
    end if;
  end loop;

  for record_data in
    select item.value
    from jsonb_array_elements(p_records->'ingredient_measure_equivalents') as item(value)
  loop
    imported_ingredient_id := nullif(record_data->>'ingredient_id', '')::uuid;
    picklist_id := nullif(record_data->>'picklist_value_id', '')::uuid;
    volume := case
      when jsonb_typeof(record_data->'volume_amount') = 'null'
        then 'null'::jsonb
      else jsonb_build_object(
        'amount', record_data->'volume_amount',
        'unitCode', record_data->'volume_unit_code'
      )
    end;
    weight := case
      when jsonb_typeof(record_data->'weight_amount') = 'null'
        then 'null'::jsonb
      else jsonb_build_object(
        'amount', record_data->'weight_amount',
        'unitCode', record_data->'weight_unit_code'
      )
    end;
    if imported_ingredient_id is null
      or record_data->>'measurement_type' not in ('count', 'informal')
      or (jsonb_typeof(volume) = 'null' and jsonb_typeof(weight) = 'null')
      or (
        jsonb_typeof(volume) <> 'null'
        and not private.is_valid_nutrition_equivalent_measure(volume, 'volume')
      )
      or (
        jsonb_typeof(weight) <> 'null'
        and not private.is_valid_nutrition_equivalent_measure(weight, 'weight')
      )
      or (
        record_data->>'measurement_type' = 'count'
        and (picklist_id is not null or record_data->>'picklist_value' is not null)
      )
      or (
        record_data->>'measurement_type' = 'informal'
        and (
          picklist_id is null
          or nullif(pg_catalog.btrim(record_data->>'picklist_value'), '') is null
          or not exists (
            select 1
            from public.recipe_picklist_values as value
            where value.account_id = owner_id
              and value.id = picklist_id
              and value.category = 'informal_unit'
              and value.display_value = record_data->>'picklist_value'
          )
        )
      ) then
      raise exception 'An imported ingredient measure equivalent is invalid.'
        using errcode = '23514';
    end if;

    insert into public.ingredient_measure_equivalents (
      account_id, ingredient_id, measurement_type, picklist_value_id, picklist_value,
      volume_amount, volume_unit_code, weight_amount, weight_unit_code, created_at, updated_at
    ) values (
      owner_id, imported_ingredient_id, record_data->>'measurement_type', picklist_id,
      nullif(pg_catalog.btrim(record_data->>'picklist_value'), ''),
      (record_data->>'volume_amount')::numeric, record_data->>'volume_unit_code',
      (record_data->>'weight_amount')::numeric, record_data->>'weight_unit_code',
      coalesce(nullif(record_data->>'created_at', '')::timestamptz, now()),
      coalesce(nullif(record_data->>'updated_at', '')::timestamptz, now())
    ) on conflict (account_id, ingredient_id) do nothing;
    if found then
      catalog_changed := true;
      insert into public.ingredient_catalog_history (
        account_id, actor_user_id, event_type, ingredient_id, before_data, after_data
      )
      select
        owner_id, owner_id, 'ingredient.measure_equivalent_set', equivalent.ingredient_id,
        jsonb_build_object(
          'ingredient_id', equivalent.ingredient_id,
          'ingredient_name', ingredient.name,
          'measure_equivalent', null
        ),
        jsonb_build_object(
          'ingredient_id', equivalent.ingredient_id,
          'ingredient_name', ingredient.name,
          'measure_equivalent', to_jsonb(equivalent) - 'account_id'
        )
      from public.ingredient_measure_equivalents as equivalent
      join public.ingredients as ingredient
        on ingredient.account_id = equivalent.account_id
        and ingredient.id = equivalent.ingredient_id
      where equivalent.account_id = owner_id
        and equivalent.ingredient_id = imported_ingredient_id;
    end if;
  end loop;

  if catalog_changed then
    update public.ingredient_catalog_revisions
    set revision = revision + 1
    where account_id = owner_id;
    if not found then
      raise exception 'Ingredient catalog revision is unavailable.' using errcode = '23514';
    end if;
  end if;
  return result;
end;
$$;

revoke all on function public.commit_database_import_with_media_sources_without_nutrition(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) to service_role;

notify pgrst, 'reload schema';
