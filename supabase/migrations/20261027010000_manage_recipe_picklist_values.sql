alter table public.recipe_picklist_values
  add column display_value text;

update public.recipe_picklist_values
set display_value = value;

alter table public.recipe_picklist_values
  alter column display_value set not null;

create function public.recipe_picklist_default_display_value()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display_value is null or btrim(new.display_value) = '' then
    new.display_value := new.value;
  end if;
  return new;
end;
$$;

create trigger recipe_picklist_default_display_value_before_insert
  before insert on public.recipe_picklist_values
  for each row execute procedure public.recipe_picklist_default_display_value();

create unique index recipe_picklist_values_normalized_label_key
  on public.recipe_picklist_values (
    account_id,
    category,
    lower(regexp_replace(btrim(display_value), '[[:space:]]+', ' ', 'g'))
  );

create table public.recipe_picklist_revisions (
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
  revision integer not null default 1 check (revision > 0),
  primary key (account_id, category)
);

insert into public.recipe_picklist_revisions (account_id, category)
select account.id, categories.category
from public.accounts as account
cross join (
  values
    ('food_type'),
    ('meal_type'),
    ('cuisine'),
    ('equipment'),
    ('verdict'),
    ('enthusiasm'),
    ('informal_unit'),
    ('unmeasured_phrase')
) as categories(category)
on conflict (account_id, category) do nothing;

alter table public.recipe_picklist_revisions enable row level security;

grant select on public.recipe_picklist_revisions to authenticated;

create policy "Account owners can read recipe picklist revisions"
  on public.recipe_picklist_revisions
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function public.seed_recipe_picklist_revisions_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.recipe_picklist_revisions (account_id, category)
  select new.id, categories.category
  from (
    values
      ('food_type'),
      ('meal_type'),
      ('cuisine'),
      ('equipment'),
      ('verdict'),
      ('enthusiasm'),
      ('informal_unit'),
      ('unmeasured_phrase')
  ) as categories(category);
  return new;
end;
$$;

revoke all on function public.seed_recipe_picklist_revisions_after_account_insert()
  from public, anon, authenticated;

create trigger seed_recipe_picklist_revisions_after_account_insert
  after insert on public.accounts
  for each row execute procedure public.seed_recipe_picklist_revisions_after_account_insert();

create table public.recipe_picklist_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
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
  event_type text not null check (
    event_type in (
      'picklist.added',
      'picklist.renamed',
      'picklist.reordered',
      'picklist.deleted',
      'picklist.merged'
    )
  ),
  subject_value_id uuid,
  source_value_ids uuid[] not null default array[]::uuid[],
  target_value_id uuid,
  cleared_references boolean not null default false,
  affected_recipe_ids uuid[] not null default array[]::uuid[],
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_picklist_history enable row level security;

grant select on public.recipe_picklist_history to authenticated;

create index recipe_picklist_history_owner_category_created_idx
  on public.recipe_picklist_history (account_id, category, created_at desc);

create policy "Account owners can read recipe picklist history"
  on public.recipe_picklist_history
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function private.recipe_ingredient_history_snapshot(
  p_account_id uuid,
  p_recipe_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', recipe_ingredient.ingredient_id,
        'name', ingredient.name,
        'position', recipe_ingredient.position,
        'is_main', recipe_ingredient.is_main,
        'detail', recipe_ingredient.detail,
        'preparation', recipe_ingredient.preparation,
        'measurements', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'measurement_type', measurement.measurement_type,
              'amount_min', measurement.amount_min,
              'amount_max', measurement.amount_max,
              'unit_code', measurement.unit_code,
              'picklist_value_id', measurement.picklist_value_id,
              'picklist_value', picklist.value
            ) order by measurement.position
          )
          from public.recipe_ingredient_measurements as measurement
          left join public.recipe_picklist_values as picklist
            on picklist.account_id = measurement.account_id
            and picklist.id = measurement.picklist_value_id
          where measurement.account_id = recipe_ingredient.account_id
            and measurement.recipe_ingredient_id = recipe_ingredient.id
        ), '[]'::jsonb)
      ) order by recipe_ingredient.position
    ),
    '[]'::jsonb
  )
  from public.recipe_ingredients as recipe_ingredient
  join public.ingredients as ingredient
    on ingredient.account_id = recipe_ingredient.account_id
    and ingredient.id = recipe_ingredient.ingredient_id
  where recipe_ingredient.account_id = p_account_id
    and recipe_ingredient.recipe_id = p_recipe_id;
$$;

revoke all on function private.recipe_ingredient_history_snapshot(uuid, uuid)
  from public, anon, authenticated;

create function private.rewrite_recipe_picklist_references(
  p_account_id uuid,
  p_category text,
  p_source_ids uuid[],
  p_target_id uuid,
  p_clear boolean
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_recipe_ids uuid[];
  recipe_id uuid;
  before_ingredients jsonb;
begin
  select coalesce(
    array_agg(distinct reference_rows.recipe_id order by reference_rows.recipe_id),
    array[]::uuid[]
  )
  into affected_recipe_ids
  from (
    select recipe.id as recipe_id
    from public.recipes as recipe
    where recipe.account_id = p_account_id
      and p_category = 'food_type'
      and recipe.food_type_id = any(p_source_ids)
    union all
    select recipe.id
    from public.recipes as recipe
    where recipe.account_id = p_account_id
      and p_category = 'verdict'
      and recipe.verdict_id = any(p_source_ids)
    union all
    select recipe.id
    from public.recipes as recipe
    where recipe.account_id = p_account_id
      and p_category = 'enthusiasm'
      and recipe.enthusiasm_id = any(p_source_ids)
    union all
    select assignment.recipe_id
    from public.recipe_picklist_assignments as assignment
    where assignment.account_id = p_account_id
      and assignment.category = p_category
      and p_category in ('meal_type', 'cuisine', 'equipment')
      and assignment.picklist_value_id = any(p_source_ids)
    union all
    select recipe_ingredient.recipe_id
    from public.recipe_ingredient_measurements as measurement
    join public.recipe_ingredients as recipe_ingredient
      on recipe_ingredient.account_id = measurement.account_id
      and recipe_ingredient.id = measurement.recipe_ingredient_id
    where measurement.account_id = p_account_id
      and measurement.picklist_value_id = any(p_source_ids)
      and p_category in ('informal_unit', 'unmeasured_phrase')
  ) as reference_rows;

  perform recipe.id
  from public.recipes as recipe
  where recipe.account_id = p_account_id
    and recipe.id = any(affected_recipe_ids)
  order by recipe.id
  for update;

  if p_target_id is null and not p_clear then
    return affected_recipe_ids;
  end if;

  foreach recipe_id in array affected_recipe_ids loop
    select private.recipe_ingredient_history_snapshot(p_account_id, recipe_id)
    into before_ingredients;
    perform pg_catalog.set_config(
      'app.recipe_ingredients_before',
      before_ingredients::text,
      true
    );

    if p_category = 'food_type' then
      update public.recipes
      set food_type_id = case when p_clear then null else p_target_id end,
          version = version + 1
      where account_id = p_account_id and id = recipe_id;
    elsif p_category = 'verdict' then
      update public.recipes
      set verdict_id = case when p_clear then null else p_target_id end,
          occasion_details = case when p_clear then null else occasion_details end,
          version = version + 1
      where account_id = p_account_id and id = recipe_id;
    elsif p_category = 'enthusiasm' then
      update public.recipes
      set enthusiasm_id = case when p_clear then null else p_target_id end,
          occasion_details = case when p_clear then null else occasion_details end,
          version = version + 1
      where account_id = p_account_id and id = recipe_id;
    elsif p_category in ('meal_type', 'cuisine', 'equipment') then
      if p_clear then
        delete from public.recipe_picklist_assignments
        where account_id = p_account_id
          and recipe_id = recipe_id
          and category = p_category
          and picklist_value_id = any(p_source_ids);
      else
        delete from public.recipe_picklist_assignments as source
        where source.account_id = p_account_id
          and source.recipe_id = recipe_id
          and source.category = p_category
          and source.picklist_value_id = any(p_source_ids)
          and exists (
            select 1
            from public.recipe_picklist_assignments as target
            where target.account_id = p_account_id
              and target.recipe_id = recipe_id
              and target.category = p_category
              and target.picklist_value_id = p_target_id
          );
        update public.recipe_picklist_assignments
        set picklist_value_id = p_target_id
        where account_id = p_account_id
          and recipe_id = recipe_id
          and category = p_category
          and picklist_value_id = any(p_source_ids);
      end if;
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = recipe_id;
    elsif p_category in ('informal_unit', 'unmeasured_phrase') then
      update public.recipe_ingredient_measurements
      set picklist_value_id = p_target_id
      where account_id = p_account_id
        and picklist_value_id = any(p_source_ids);
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = recipe_id;
    end if;
  end loop;

  return affected_recipe_ids;
end;
$$;

revoke all on function private.rewrite_recipe_picklist_references(
  uuid, text, uuid[], uuid, boolean
) from public, anon, authenticated;

create function public.manage_recipe_picklist(
  p_action text,
  p_category text,
  p_expected_revision integer,
  p_value_id uuid default null,
  p_value text default null,
  p_ordered_ids uuid[] default null,
  p_source_ids uuid[] default null,
  p_target_id uuid default null,
  p_replacement_id uuid default null,
  p_clear_optional boolean default false
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
  current_count integer;
  normalized_value text;
  stored_value text;
  new_value_id uuid;
  source_ids uuid[];
  target_id uuid;
  protected_value boolean;
  reference_ids uuid[] := array[]::uuid[];
  before_values jsonb;
  after_values jsonb;
  operation_type text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_category not in (
    'food_type', 'meal_type', 'cuisine', 'equipment', 'verdict', 'enthusiasm',
    'informal_unit', 'unmeasured_phrase'
  ) then
    raise exception 'Picklist category is invalid.' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Picklist revision is invalid.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || ':' || p_category, 0)
  );

  select revision
  into current_revision
  from public.recipe_picklist_revisions
  where account_id = owner_id and category = p_category
  for update;

  if current_revision is null then
    raise exception 'Picklist category was not found.' using errcode = 'P0002';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'Picklist changed in another session.' using errcode = '40001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'display_value', display_value,
        'sort_order', sort_order,
        'is_protected', is_protected
      ) order by sort_order, id
    ),
    '[]'::jsonb
  )
  into before_values
  from public.recipe_picklist_values
  where account_id = owner_id and category = p_category;

  if p_action = 'add' then
    normalized_value := pg_catalog.btrim(
      pg_catalog.regexp_replace(p_value, '[[:space:]]+', ' ', 'g')
    );
    if normalized_value is null or normalized_value = '' then
      raise exception 'A picklist value is required.' using errcode = '23514';
    end if;
    new_value_id := gen_random_uuid();
    stored_value := normalized_value;
    if p_category in ('verdict', 'enthusiasm')
      and pg_catalog.lower(normalized_value) = 'specific occasion' then
      stored_value := 'recipe-picklist:' || new_value_id::text;
    end if;
    select coalesce(max(sort_order) + 1, 0)
    into current_count
    from public.recipe_picklist_values
    where account_id = owner_id and category = p_category;
    insert into public.recipe_picklist_values (
      id, account_id, category, value, display_value, sort_order, is_protected
    ) values (
      new_value_id, owner_id, p_category, stored_value, normalized_value, current_count, false
    );
    operation_type := 'picklist.added';
  elsif p_action = 'rename' then
    if p_value_id is null then
      raise exception 'A picklist value is required.' using errcode = '23514';
    end if;
    normalized_value := pg_catalog.btrim(
      pg_catalog.regexp_replace(p_value, '[[:space:]]+', ' ', 'g')
    );
    if normalized_value is null or normalized_value = '' then
      raise exception 'A picklist value is required.' using errcode = '23514';
    end if;
    select is_protected
    into protected_value
    from public.recipe_picklist_values
    where account_id = owner_id and category = p_category and id = p_value_id
    for update;
    if not found then
      raise exception 'Picklist value was not found.' using errcode = 'P0002';
    end if;
    stored_value := normalized_value;
    if protected_value then
      select value into stored_value
      from public.recipe_picklist_values
      where account_id = owner_id and category = p_category and id = p_value_id;
    elsif p_category in ('verdict', 'enthusiasm')
      and pg_catalog.lower(normalized_value) = 'specific occasion' then
      stored_value := 'recipe-picklist:' || p_value_id::text;
    end if;
    update public.recipe_picklist_values
    set value = stored_value, display_value = normalized_value
    where account_id = owner_id and category = p_category and id = p_value_id;
    new_value_id := p_value_id;
    operation_type := 'picklist.renamed';
  elsif p_action = 'reorder' then
    select count(*) into current_count
    from public.recipe_picklist_values
    where account_id = owner_id and category = p_category;
    if coalesce(pg_catalog.cardinality(p_ordered_ids), 0) <> current_count
      or (
        select count(distinct ordered.id)
        from pg_catalog.unnest(coalesce(p_ordered_ids, array[]::uuid[])) as ordered(id)
      ) <> current_count
      or exists (
        select 1
        from pg_catalog.unnest(coalesce(p_ordered_ids, array[]::uuid[])) as ordered(id)
        left join public.recipe_picklist_values as value
          on value.account_id = owner_id
          and value.category = p_category
          and value.id = ordered.id
        where value.id is null
      ) then
      raise exception 'The submitted picklist order is incomplete or invalid.'
        using errcode = '23514';
    end if;
    update public.recipe_picklist_values as value
    set sort_order = ordered.position - 1
    from pg_catalog.unnest(p_ordered_ids) with ordinality as ordered(id, position)
    where value.account_id = owner_id
      and value.category = p_category
      and value.id = ordered.id;
    operation_type := 'picklist.reordered';
  elsif p_action = 'delete' then
    if p_value_id is null or (p_replacement_id is not null and p_clear_optional) then
      raise exception 'Choose one valid delete option.' using errcode = '23514';
    end if;
    select is_protected into protected_value
    from public.recipe_picklist_values
    where account_id = owner_id and category = p_category and id = p_value_id
    for update;
    if not found then
      raise exception 'Picklist value was not found.' using errcode = 'P0002';
    end if;
    if protected_value then
      raise exception 'This picklist value cannot be deleted or merged.' using errcode = '23514';
    end if;
    source_ids := array[p_value_id];
    target_id := p_replacement_id;
    if target_id is not null then
      select is_protected into protected_value
      from public.recipe_picklist_values
      where account_id = owner_id and category = p_category and id = target_id
      for update;
      if not found or target_id = p_value_id or protected_value then
        raise exception 'Choose a different, unprotected replacement in this category.'
          using errcode = '23514';
      end if;
    elsif p_clear_optional and p_category not in (
      'food_type', 'meal_type', 'cuisine', 'equipment', 'verdict', 'enthusiasm'
    ) then
      raise exception 'This picklist value requires a replacement.' using errcode = '23514';
    end if;
    reference_ids := private.rewrite_recipe_picklist_references(
      owner_id, p_category, source_ids, target_id, p_clear_optional
    );
    if target_id is null and not p_clear_optional and cardinality(reference_ids) > 0 then
      raise exception 'Choose a replacement or explicitly clear this optional value.'
        using errcode = '23514';
    end if;
    delete from public.recipe_picklist_values
    where account_id = owner_id and category = p_category and id = p_value_id;
    with ordered as (
      select id, row_number() over (order by sort_order, id) - 1 as position
      from public.recipe_picklist_values
      where account_id = owner_id and category = p_category
    )
    update public.recipe_picklist_values as value
    set sort_order = ordered.position
    from ordered
    where value.id = ordered.id;
    operation_type := 'picklist.deleted';
  elsif p_action = 'merge' then
    if p_source_ids is null or cardinality(p_source_ids) = 0 or p_target_id is null
      or p_clear_optional
      or p_target_id = any(p_source_ids)
      or cardinality(p_source_ids) <> (
        select count(distinct source.id)
        from pg_catalog.unnest(p_source_ids) as source(id)
      ) then
      raise exception 'Choose one or more source values and a different target.'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from pg_catalog.unnest(p_source_ids) as source(id)
      left join public.recipe_picklist_values as value
        on value.account_id = owner_id
        and value.category = p_category
        and value.id = source.id
      where value.id is null or value.is_protected
    ) then
      raise exception 'Merge sources must be unprotected values in this category.'
        using errcode = '23514';
    end if;
    select is_protected into protected_value
    from public.recipe_picklist_values
    where account_id = owner_id and category = p_category and id = p_target_id
    for update;
    if not found or protected_value then
      raise exception 'Merge target must be an unprotected value in this category.'
        using errcode = '23514';
    end if;
    source_ids := p_source_ids;
    target_id := p_target_id;
    reference_ids := private.rewrite_recipe_picklist_references(
      owner_id, p_category, source_ids, target_id, false
    );
    delete from public.recipe_picklist_values
    where account_id = owner_id and category = p_category and id = any(source_ids);
    with ordered as (
      select id, row_number() over (order by sort_order, id) - 1 as position
      from public.recipe_picklist_values
      where account_id = owner_id and category = p_category
    )
    update public.recipe_picklist_values as value
    set sort_order = ordered.position
    from ordered
    where value.id = ordered.id;
    operation_type := 'picklist.merged';
  else
    raise exception 'Picklist action is invalid.' using errcode = '22023';
  end if;

  update public.recipe_picklist_revisions
  set revision = revision + 1
  where account_id = owner_id and category = p_category
  returning revision into next_revision;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'display_value', display_value,
        'sort_order', sort_order,
        'is_protected', is_protected
      ) order by sort_order, id
    ),
    '[]'::jsonb
  )
  into after_values
  from public.recipe_picklist_values
  where account_id = owner_id and category = p_category;

  insert into public.recipe_picklist_history (
    account_id,
    actor_user_id,
    category,
    event_type,
    subject_value_id,
    source_value_ids,
    target_value_id,
    cleared_references,
    affected_recipe_ids,
    before_data,
    after_data
  ) values (
    owner_id,
    owner_id,
    p_category,
    operation_type,
    coalesce(new_value_id, p_value_id),
    coalesce(source_ids, array[]::uuid[]),
    target_id,
    p_clear_optional,
    reference_ids,
    before_values,
    after_values
  );

  return next_revision;
end;
$$;

revoke all on function public.manage_recipe_picklist(
  text, text, integer, uuid, text, uuid[], uuid[], uuid, uuid, boolean
) from public, anon;

grant execute on function public.manage_recipe_picklist(
  text, text, integer, uuid, text, uuid[], uuid[], uuid, uuid, boolean
) to authenticated;
