alter table public.recipe_picklist_values
  drop constraint recipe_picklist_values_category_check,
  add constraint recipe_picklist_values_category_check
    check (category in (
      'food_type', 'meal_type', 'cuisine', 'equipment', 'verdict', 'enthusiasm',
      'informal_unit', 'unmeasured_phrase', 'time_type'
    ));

alter table public.recipe_picklist_revisions
  drop constraint recipe_picklist_revisions_category_check,
  add constraint recipe_picklist_revisions_category_check
    check (category in (
      'food_type', 'meal_type', 'cuisine', 'equipment', 'verdict', 'enthusiasm',
      'informal_unit', 'unmeasured_phrase', 'time_type'
    ));

alter table public.recipe_picklist_history
  drop constraint recipe_picklist_history_category_check,
  add constraint recipe_picklist_history_category_check
    check (category in (
      'food_type', 'meal_type', 'cuisine', 'equipment', 'verdict', 'enthusiasm',
      'informal_unit', 'unmeasured_phrase', 'time_type'
    ));

create function public.seed_recipe_time_types_for_account(target_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.recipe_picklist_values (
    account_id, category, value, display_value, sort_order, is_protected
  )
  select target_account_id, 'time_type', defaults.value, defaults.value, defaults.sort_order, false
  from (values
    ('Prep', 0),
    ('Mixing', 1),
    ('Marinate', 2),
    ('Chill', 3),
    ('Freeze', 4),
    ('Cook', 5),
    ('Bake', 6),
    ('Cooling', 7),
    ('Rest', 8)
  ) as defaults(value, sort_order)
  on conflict (account_id, category, value) do nothing;

  insert into public.recipe_picklist_revisions (account_id, category)
  values (target_account_id, 'time_type')
  on conflict (account_id, category) do nothing;
$$;

revoke all on function public.seed_recipe_time_types_for_account(uuid)
  from public, anon, authenticated;

create function public.seed_recipe_time_types_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_recipe_time_types_for_account(new.id);
  return new;
end;
$$;

revoke all on function public.seed_recipe_time_types_after_account_insert()
  from public, anon, authenticated;

create trigger seed_recipe_time_types_after_account_insert
  after insert on public.accounts
  for each row execute function public.seed_recipe_time_types_after_account_insert();

insert into public.recipe_picklist_values (
  account_id, category, value, display_value, sort_order, is_protected
)
select account.id, 'time_type', defaults.value, defaults.value, defaults.sort_order, false
from public.accounts as account
cross join (values
  ('Prep', 0),
  ('Mixing', 1),
  ('Marinate', 2),
  ('Chill', 3),
  ('Freeze', 4),
  ('Cook', 5),
  ('Bake', 6),
  ('Cooling', 7),
  ('Rest', 8)
) as defaults(value, sort_order)
on conflict (account_id, category, value) do nothing;

insert into public.recipe_picklist_revisions (account_id, category)
select account.id, 'time_type'
from public.accounts as account
on conflict (account_id, category) do nothing;

create table public.recipe_time_entries (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  recipe_id uuid not null,
  time_type_id uuid not null,
  time_type_category text generated always as ('time_type'::text) stored,
  minutes integer not null check (minutes >= 0),
  position integer not null check (position >= 0),
  primary key (account_id, id),
  unique (account_id, recipe_id, position),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, time_type_category, time_type_id)
    references public.recipe_picklist_values (account_id, category, id)
);

create index recipe_time_entries_recipe_order_idx
  on public.recipe_time_entries (account_id, recipe_id, position);

alter table public.recipe_time_entries enable row level security;
grant select on public.recipe_time_entries to authenticated;
grant all on public.recipe_time_entries to service_role;

create policy "Account owners can read recipe time entries"
  on public.recipe_time_entries
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

insert into public.recipe_time_entries (
  account_id, recipe_id, time_type_id, minutes, position
)
select
  source.account_id,
  source.recipe_id,
  time_type.id,
  source.minutes,
  row_number() over (partition by source.account_id, source.recipe_id order by source.sort_order) - 1
from (
  select recipe.account_id, recipe.id as recipe_id, time_values.label,
    time_values.minutes, time_values.sort_order
  from public.recipes as recipe
  cross join lateral (values
    ('Prep', recipe.prep_time_minutes, 0),
    ('Mixing', recipe.mixing_time_minutes, 1),
    ('Marinate', recipe.marinate_time_minutes, 2),
    ('Chill', recipe.chill_time_minutes, 3),
    ('Freeze', recipe.freeze_time_minutes, 4),
    ('Cook', recipe.cook_time_minutes, 5),
    ('Bake', recipe.bake_time_minutes, 6),
    ('Cooling', recipe.cooling_time_minutes, 7),
    ('Rest', recipe.rest_time_minutes, 8)
  ) as time_values(label, minutes, sort_order)
  where time_values.minutes is not null
  union all
  select recipe.account_id, recipe.id, 'Cook', recipe.total_time_minutes, 5
  from public.recipes as recipe
  where recipe.total_time_minutes > 0
    and recipe.prep_time_minutes is null
    and recipe.mixing_time_minutes is null
    and recipe.marinate_time_minutes is null
    and recipe.chill_time_minutes is null
    and recipe.freeze_time_minutes is null
    and recipe.cook_time_minutes is null
    and recipe.bake_time_minutes is null
    and recipe.cooling_time_minutes is null
    and recipe.rest_time_minutes is null
) as source
join public.recipe_picklist_values as time_type
  on time_type.account_id = source.account_id
  and time_type.category = 'time_type'
  and time_type.value = source.label;

do $$
begin
  if exists (
    select 1
    from public.recipes as recipe
    cross join lateral (
      select coalesce(sum(time_values.minutes::bigint), 0) as minutes
      from (values
        (recipe.prep_time_minutes),
        (recipe.mixing_time_minutes),
        (recipe.marinate_time_minutes),
        (recipe.chill_time_minutes),
        (recipe.freeze_time_minutes),
        (recipe.cook_time_minutes),
        (recipe.bake_time_minutes),
        (recipe.cooling_time_minutes),
        (recipe.rest_time_minutes)
      ) as time_values(minutes)
    ) as total
    where total.minutes > 2147483647
  ) then
    raise exception 'Existing recipe time entries exceed the supported total range.';
  end if;
end
$$;

alter table public.recipes disable trigger recipe_history_after_save;
alter table public.recipes disable trigger recipes_updated_at;

select pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);

update public.recipes as recipe
set total_time_minutes = coalesce(
  (select sum(entry.minutes::bigint)::integer
   from public.recipe_time_entries as entry
   where entry.account_id = recipe.account_id and entry.recipe_id = recipe.id),
  0
);

select pg_catalog.set_config('app.recipe_lifecycle_context', '', true);

alter table public.recipes enable trigger recipes_updated_at;
alter table public.recipes enable trigger recipe_history_after_save;

create function private.recipe_time_entries_history_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'time_type_id', entry.time_type_id,
    'time_type', coalesce(time_type.display_value, time_type.value),
    'minutes', entry.minutes,
    'position', entry.position
  ) order by entry.position), '[]'::jsonb)
  from public.recipe_time_entries as entry
  join public.recipe_picklist_values as time_type
    on time_type.account_id = entry.account_id
    and time_type.id = entry.time_type_id
  where entry.account_id = p_account_id
    and entry.recipe_id = p_recipe_id;
$$;

revoke all on function private.recipe_time_entries_history_snapshot(uuid, uuid)
  from public, anon, authenticated;

create function private.derive_recipe_total_time_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_entries jsonb;
  derived_total bigint;
begin
  configured_entries := nullif(
    current_setting('app.recipe_time_entries_after', true),
    ''
  )::jsonb;
  if configured_entries is not null then
    if jsonb_typeof(configured_entries) is distinct from 'array' then
      raise exception 'Recipe time entries are invalid.' using errcode = '23514';
    end if;
    select coalesce(sum((entry->>'minutes')::bigint), 0)
    into derived_total
    from jsonb_array_elements(configured_entries) as item(entry);
  else
    select coalesce(sum(entry.minutes::bigint), 0)
    into derived_total
    from public.recipe_time_entries as entry
    where entry.account_id = new.account_id
      and entry.recipe_id = new.id;
  end if;

  if derived_total > 2147483647 then
    raise exception 'Recipe time total exceeds the supported range.' using errcode = '23514';
  end if;

  new.prep_time_minutes := null;
  new.mixing_time_minutes := null;
  new.marinate_time_minutes := null;
  new.chill_time_minutes := null;
  new.freeze_time_minutes := null;
  new.cook_time_minutes := null;
  new.bake_time_minutes := null;
  new.cooling_time_minutes := null;
  new.rest_time_minutes := null;
  new.total_time_minutes := derived_total::integer;
  return new;
end;
$$;

revoke all on function private.derive_recipe_total_time_before_save()
  from public, anon, authenticated;

create trigger recipes_derive_total_time_before_save
  before insert or update on public.recipes
  for each row execute function private.derive_recipe_total_time_before_save();

create function public.save_recipe_with_time_entries(
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
  p_nutrition_overrides jsonb,
  p_time_entries jsonb
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  entry jsonb;
  entry_ordinal bigint;
  time_type_id uuid;
  minutes_value bigint;
  position_value bigint;
  total_minutes bigint := 0;
  existing_version integer;
  saved_id uuid;
  saved_version integer;
  before_time_entries jsonb;
  after_time_entries jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_time_entries is null or jsonb_typeof(p_time_entries) is distinct from 'array' then
    raise exception 'Recipe time entries are invalid.' using errcode = '23514';
  end if;

  for entry, entry_ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(p_time_entries) with ordinality as item(value, ordinality)
  loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_object_length(entry) <> 3
      or not (entry ?& array['time_type_id', 'minutes', 'position'])
      or jsonb_typeof(entry->'time_type_id') is distinct from 'string'
      or (entry->>'time_type_id') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry->'minutes') is distinct from 'number'
      or (entry->>'minutes') !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(entry->'position') is distinct from 'number'
      or (entry->>'position') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Recipe time entries are invalid.' using errcode = '23514';
    end if;

    time_type_id := (entry->>'time_type_id')::uuid;
    minutes_value := (entry->>'minutes')::bigint;
    position_value := (entry->>'position')::bigint;
    if minutes_value > 2147483647 or position_value <> entry_ordinal - 1 then
      raise exception 'Recipe time entries are invalid.' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.recipe_picklist_values as time_type
      where time_type.account_id = owner_id
        and time_type.category = 'time_type'
        and time_type.id = time_type_id
    ) then
      raise exception 'A recipe time entry uses an unavailable Time Type.'
        using errcode = '23514';
    end if;
    total_minutes := total_minutes + minutes_value;
    if total_minutes > 2147483647 then
      raise exception 'Recipe time total exceeds the supported range.' using errcode = '23514';
    end if;
  end loop;

  if p_recipe_id is null then
    before_time_entries := '[]'::jsonb;
  else
    select recipe.version
    into existing_version
    from public.recipes as recipe
    where recipe.account_id = owner_id
      and recipe.id = p_recipe_id
    for update;
    if not found then
      raise exception 'Recipe was not found.' using errcode = 'P0002';
    end if;
    before_time_entries := private.recipe_time_entries_history_snapshot(owner_id, p_recipe_id);
    delete from public.recipe_time_entries
    where account_id = owner_id and recipe_id = p_recipe_id;
    insert into public.recipe_time_entries (
      account_id, recipe_id, time_type_id, minutes, position
    )
    select
      owner_id,
      p_recipe_id,
      (item.value->>'time_type_id')::uuid,
      (item.value->>'minutes')::integer,
      (item.value->>'position')::integer
    from jsonb_array_elements(p_time_entries) as item(value);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'time_type_id', time_type.id,
    'time_type', coalesce(time_type.display_value, time_type.value),
    'minutes', (item.value->>'minutes')::integer,
    'position', (item.value->>'position')::integer
  ) order by (item.value->>'position')::integer), '[]'::jsonb)
  into after_time_entries
  from jsonb_array_elements(p_time_entries) as item(value)
  join public.recipe_picklist_values as time_type
    on time_type.account_id = owner_id
    and time_type.category = 'time_type'
    and time_type.id = (item.value->>'time_type_id')::uuid;

  perform pg_catalog.set_config(
    'app.recipe_time_entries_before',
    before_time_entries::text,
    true
  );
  perform pg_catalog.set_config('app.recipe_time_entries_after', after_time_entries::text, true);

  select saved.id, saved.version
  into saved_id, saved_version
  from public.save_recipe_with_nutrition(
    p_recipe_id,
    p_expected_version,
    p_name,
    p_food_type_id,
    p_state,
    p_verdict_id,
    p_enthusiasm_id,
    p_occasion_details,
    p_reason,
    p_serves,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    total_minutes::integer,
    p_notes_markdown,
    p_meal_type_ids,
    p_cuisine_ids,
    p_equipment_ids,
    p_ingredient_rows,
    p_instruction_steps,
    p_publication_id,
    p_publication_page,
    p_recipe_url,
    p_recipe_relationships,
    p_tag_ids,
    p_ingredient_sets,
    p_score,
    p_makes_quantity,
    p_makes_thing,
    p_nutrition_overrides
  ) as saved;

  if p_recipe_id is null then
    insert into public.recipe_time_entries (
      account_id, recipe_id, time_type_id, minutes, position
    )
    select
      owner_id,
      saved_id,
      (item.value->>'time_type_id')::uuid,
      (item.value->>'minutes')::integer,
      (item.value->>'position')::integer
    from jsonb_array_elements(p_time_entries) as item(value);
  end if;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe_with_time_entries(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer, text,
  uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text, jsonb, uuid[],
  jsonb, smallint, integer, text, jsonb, jsonb
) from public, anon;
grant execute on function public.save_recipe_with_time_entries(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer, text,
  uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text, jsonb, uuid[],
  jsonb, smallint, integer, text, jsonb, jsonb
) to authenticated;

alter function public.read_export_snapshot(uuid)
  rename to read_export_snapshot_without_time_entries;

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
  snapshot := public.read_export_snapshot_without_time_entries(p_account_id);
  if snapshot is null then
    return null;
  end if;

  return jsonb_set(
    snapshot,
    '{records,recipe_time_entries}',
    coalesce((
      select jsonb_agg(to_jsonb(entry) order by entry.recipe_id, entry.position)
      from public.recipe_time_entries as entry
      where entry.account_id = p_account_id
    ), '[]'::jsonb),
    true
  );
end;
$$;

revoke all on function public.read_export_snapshot_without_time_entries(uuid)
  from public, anon, authenticated;
grant execute on function public.read_export_snapshot_without_time_entries(uuid) to service_role;
revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.recipe_history_after_save()'::regprocedure
  );
  old_declaration constant text := $old$  after_ingredient_sets jsonb;
begin
$old$;
  new_declaration constant text := $new$  after_ingredient_sets jsonb;
  before_time_entries jsonb;
  after_time_entries jsonb;
begin
$new$;
  old_insert constant text := $old$  insert into public.recipe_history (
$old$;
  new_insert constant text := $new$  if tg_op = 'INSERT' then
    before_time_entries := '[]'::jsonb;
  else
    before_time_entries := coalesce(
      nullif(current_setting('app.recipe_time_entries_before', true), '')::jsonb,
      private.recipe_time_entries_history_snapshot(old.account_id, old.id)
    );
  end if;
  after_time_entries := coalesce(
    nullif(current_setting('app.recipe_time_entries_after', true), '')::jsonb,
    private.recipe_time_entries_history_snapshot(new.account_id, new.id)
  );

  insert into public.recipe_history (
$new$;
  old_before constant text := $old$        'ingredient_sets', before_ingredient_sets
$old$;
  new_before constant text := $new$        'ingredient_sets', before_ingredient_sets,
        'time_entries', before_time_entries
$new$;
  old_after constant text := $old$      'ingredient_sets', after_ingredient_sets
$old$;
  new_after constant text := $new$      'ingredient_sets', after_ingredient_sets,
      'time_entries', after_time_entries
$new$;
begin
  if pg_catalog.strpos(function_definition, old_declaration) = 0
    or pg_catalog.strpos(function_definition, old_insert) = 0
    or pg_catalog.strpos(function_definition, old_before) = 0
    or pg_catalog.strpos(function_definition, old_after) = 0 then
    raise exception 'Could not extend recipe history for configurable times.';
  end if;
  function_definition := pg_catalog.replace(function_definition, old_declaration, new_declaration);
  function_definition := pg_catalog.replace(function_definition, old_insert, new_insert);
  function_definition := pg_catalog.replace(function_definition, old_before, new_before);
  function_definition := pg_catalog.replace(function_definition, old_after, new_after);
  execute function_definition;
end
$$;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.manage_recipe_picklist(text, text, integer, uuid, text, uuid[], uuid[], uuid, uuid, boolean)'::regprocedure
  );
  old_category_check constant text := $old$    'informal_unit', 'unmeasured_phrase'
  ) then
$old$;
  new_category_check constant text := $new$    'informal_unit', 'unmeasured_phrase', 'time_type'
  ) then
$new$;
begin
  if pg_catalog.strpos(function_definition, old_category_check) = 0 then
    raise exception 'Could not add Time Type to picklist management.';
  end if;
  execute pg_catalog.replace(function_definition, old_category_check, new_category_check);
end
$$;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'private.rewrite_recipe_picklist_references(uuid, text, uuid[], uuid, boolean)'::regprocedure
  );
  old_reference_union constant text := $old$    where measurement.account_id = p_account_id
      and measurement.picklist_value_id = any(p_source_ids)
      and p_category in ('informal_unit', 'unmeasured_phrase')
  ) as reference_rows;
$old$;
  new_reference_union constant text := $new$    where measurement.account_id = p_account_id
      and measurement.picklist_value_id = any(p_source_ids)
      and p_category in ('informal_unit', 'unmeasured_phrase')
    union all
    select entry.recipe_id
    from public.recipe_time_entries as entry
    where entry.account_id = p_account_id
      and entry.time_type_id = any(p_source_ids)
      and p_category = 'time_type'
  ) as reference_rows;
$new$;
  old_variable constant text := $old$  before_ingredients jsonb;
$old$;
  new_variable constant text := $new$  before_ingredients jsonb;
  before_time_entries jsonb;
$new$;
  old_before_capture constant text := $old$    perform pg_catalog.set_config(
      'app.recipe_ingredients_before',
      before_ingredients::text,
      true
    );
$old$;
  new_before_capture constant text := $new$    perform pg_catalog.set_config(
      'app.recipe_ingredients_before',
      before_ingredients::text,
      true
    );
    select private.recipe_time_entries_history_snapshot(p_account_id, affected_recipe_id)
    into before_time_entries;
    perform pg_catalog.set_config(
      'app.recipe_time_entries_before',
      before_time_entries::text,
      true
    );
$new$;
  old_time_branch constant text := $old$    elsif p_category in ('informal_unit', 'unmeasured_phrase') then
      update public.recipe_ingredient_measurements as measurement
      set picklist_value_id = p_target_id
      from public.recipe_ingredients as recipe_ingredient
      where measurement.account_id = p_account_id
        and recipe_ingredient.account_id = p_account_id
        and recipe_ingredient.id = measurement.recipe_ingredient_id
        and recipe_ingredient.recipe_id = affected_recipe_id
        and measurement.picklist_value_id = any(p_source_ids);
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    end if;
$old$;
  new_time_branch constant text := $new$    elsif p_category in ('informal_unit', 'unmeasured_phrase') then
      update public.recipe_ingredient_measurements as measurement
      set picklist_value_id = p_target_id
      from public.recipe_ingredients as recipe_ingredient
      where measurement.account_id = p_account_id
        and recipe_ingredient.account_id = p_account_id
        and recipe_ingredient.id = measurement.recipe_ingredient_id
        and recipe_ingredient.recipe_id = affected_recipe_id
        and measurement.picklist_value_id = any(p_source_ids);
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    elsif p_category = 'time_type' then
      update public.recipe_time_entries as entry
      set time_type_id = p_target_id
      where entry.account_id = p_account_id
        and entry.recipe_id = affected_recipe_id
        and entry.time_type_id = any(p_source_ids);
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    end if;
$new$;
begin
  if pg_catalog.strpos(function_definition, old_reference_union) = 0
    or pg_catalog.strpos(function_definition, old_variable) = 0
    or pg_catalog.strpos(function_definition, old_before_capture) = 0
    or pg_catalog.strpos(function_definition, old_time_branch) = 0 then
    raise exception 'Could not extend Time Type reference rewriting.';
  end if;
  function_definition := pg_catalog.replace(
    function_definition, old_reference_union, new_reference_union
  );
  function_definition := pg_catalog.replace(function_definition, old_variable, new_variable);
  function_definition := pg_catalog.replace(
    function_definition, old_before_capture, new_before_capture
  );
  function_definition := pg_catalog.replace(function_definition, old_time_branch, new_time_branch);
  execute function_definition;
end
$$;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.reset_account_content(uuid, text)'::regprocedure
  );
  old_seed_call constant text := $old$  perform public.seed_recipe_picklists_for_account(owner_id);
$old$;
  new_seed_call constant text := $new$  perform public.seed_recipe_picklists_for_account(owner_id);
  perform public.seed_recipe_time_types_for_account(owner_id);
$new$;
begin
  if pg_catalog.strpos(function_definition, old_seed_call) = 0 then
    raise exception 'Could not add Time Type seeding to account content reset.';
  end if;
  execute pg_catalog.replace(function_definition, old_seed_call, new_seed_call);
end
$$;

do $$
declare
  function_definition text := pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid, jsonb, jsonb, jsonb, uuid[], uuid[])'::regprocedure
  );
  old_table_list constant text := $old$    'ingredients', 'recipe_ingredients', 'recipe_ingredient_measurements', 'recipe_steps',
$old$;
  new_table_list constant text := $new$    'ingredients', 'recipe_time_entries', 'recipe_ingredients',
    'recipe_ingredient_measurements', 'recipe_steps',
$new$;
  old_recipe_context constant text := $old$    perform pg_catalog.set_config(
      'app.database_import_recipe_created_at',
      coalesce(record_data->>'created_at', ''),
      true
    );

    select saved.id into saved_id
$old$;
  new_recipe_context constant text := $new$    perform pg_catalog.set_config(
      'app.database_import_recipe_created_at',
      coalesce(record_data->>'created_at', ''),
      true
    );
    perform pg_catalog.set_config(
      'app.recipe_time_entries_before',
      case
        when expected_version is null then '[]'
        else private.recipe_time_entries_history_snapshot(owner_id, recipe_id)::text
      end,
      true
    );
    perform pg_catalog.set_config(
      'app.recipe_time_entries_after',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'time_type_id', time_type.id,
          'time_type', coalesce(time_type.display_value, time_type.value),
          'minutes', (time_entry->>'minutes')::integer,
          'position', (time_entry->>'position')::integer
        ) order by (time_entry->>'position')::integer)::text
        from jsonb_array_elements(p_records->'recipe_time_entries') as item(time_entry)
        join public.recipe_picklist_values as time_type
          on time_type.account_id = owner_id
          and time_type.category = 'time_type'
          and time_type.id = (time_entry->>'time_type_id')::uuid
        where time_entry->>'recipe_id' = recipe_id::text
      ), '[]'),
      true
    );
    delete from public.recipe_time_entries as existing_entry
    where existing_entry.account_id = owner_id
      and existing_entry.recipe_id = recipe_id;

    select saved.id into saved_id
$new$;
  old_saved_check constant text := $old$    set constraints public.recipe_history_after_save immediate;
    set constraints public.recipe_history_after_save deferred;
    imported_recipe_ids := array_append(imported_recipe_ids, recipe_id);
$old$;
  new_saved_check constant text := $new$    insert into public.recipe_time_entries (
      id, account_id, recipe_id, time_type_id, minutes, position
    )
    select
      (time_entry->>'id')::uuid,
      owner_id,
      recipe_id,
      (time_entry->>'time_type_id')::uuid,
      (time_entry->>'minutes')::integer,
      (time_entry->>'position')::integer
    from jsonb_array_elements(p_records->'recipe_time_entries') as item(time_entry)
    where time_entry->>'recipe_id' = recipe_id::text;

    set constraints public.recipe_history_after_save immediate;
    set constraints public.recipe_history_after_save deferred;
    perform pg_catalog.set_config('app.recipe_time_entries_before', '', true);
    perform pg_catalog.set_config('app.recipe_time_entries_after', '', true);
    imported_recipe_ids := array_append(imported_recipe_ids, recipe_id);
$new$;
begin
  if pg_catalog.strpos(function_definition, old_table_list) = 0
    or pg_catalog.strpos(function_definition, old_recipe_context) = 0
    or pg_catalog.strpos(function_definition, old_saved_check) = 0 then
    raise exception 'Could not add recipe time entries to database imports.';
  end if;
  function_definition := pg_catalog.replace(function_definition, old_table_list, new_table_list);
  function_definition := pg_catalog.replace(
    function_definition, old_recipe_context, new_recipe_context
  );
  function_definition := pg_catalog.replace(function_definition, old_saved_check, new_saved_check);
  execute function_definition;
end
$$;
