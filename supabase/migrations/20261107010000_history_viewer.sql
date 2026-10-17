create index recipe_history_record_created_idx
  on public.recipe_history (account_id, record_id, created_at desc, id desc);

create index publication_history_record_created_idx
  on public.publication_history (account_id, record_id, created_at desc, id desc);

create function private.recipe_picklist_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'food_type', (
      select value.value
      from public.recipe_picklist_values as value
      where value.account_id = recipe.account_id
        and value.id = recipe.food_type_id
    ),
    'verdict', (
      select value.value
      from public.recipe_picklist_values as value
      where value.account_id = recipe.account_id
        and value.id = recipe.verdict_id
    ),
    'enthusiasm', (
      select value.value
      from public.recipe_picklist_values as value
      where value.account_id = recipe.account_id
        and value.id = recipe.enthusiasm_id
    ),
    'meal_type', coalesce((
      select jsonb_agg(value.value order by value.sort_order, value.id)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id
        and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'meal_type'
    ), '[]'::jsonb),
    'cuisine', coalesce((
      select jsonb_agg(value.value order by value.sort_order, value.id)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id
        and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'cuisine'
    ), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(value.value order by value.sort_order, value.id)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id
        and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'equipment'
    ), '[]'::jsonb)
  )
  from public.recipes as recipe
  where recipe.account_id = p_account_id and recipe.id = p_recipe_id;
$$;

revoke all on function private.recipe_picklist_snapshot(uuid, uuid)
  from public, anon, authenticated;

create function private.capture_recipe_picklists_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_account_id uuid;
  target_recipe_id uuid;
  snapshots jsonb := coalesce(
    nullif(current_setting('app.recipe_picklists_before', true), '')::jsonb,
    '{}'::jsonb
  );
begin
  if tg_table_name = 'recipes' then
    target_account_id := old.account_id;
    target_recipe_id := old.id;
  elsif tg_op = 'DELETE' then
    target_account_id := old.account_id;
    target_recipe_id := old.recipe_id;
  else
    target_account_id := new.account_id;
    target_recipe_id := new.recipe_id;
  end if;

  if not snapshots ? target_recipe_id::text then
    snapshots := snapshots || jsonb_build_object(
      target_recipe_id::text,
      private.recipe_picklist_snapshot(target_account_id, target_recipe_id)
    );
    perform pg_catalog.set_config('app.recipe_picklists_before', snapshots::text, true);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_recipe_picklists_before_change()
  from public, anon, authenticated;

create trigger capture_recipe_picklists_before_recipe_update
  before update on public.recipes
  for each row execute function private.capture_recipe_picklists_before_change();

create trigger capture_recipe_picklists_before_assignment_change
  before insert or update or delete on public.recipe_picklist_assignments
  for each row execute function private.capture_recipe_picklists_before_change();

create function private.add_recipe_picklists_to_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshots jsonb := coalesce(
    nullif(current_setting('app.recipe_picklists_before', true), '')::jsonb,
    '{}'::jsonb
  );
  before_picklists jsonb;
begin
  if new.before_data is not null then
    before_picklists := snapshots -> new.record_id::text;
    if before_picklists is not null then
      new.before_data := new.before_data || jsonb_build_object('picklists', before_picklists);
    end if;
  end if;

  new.after_data := new.after_data || jsonb_build_object(
    'picklists', private.recipe_picklist_snapshot(new.account_id, new.record_id)
  );
  return new;
end;
$$;

revoke all on function private.add_recipe_picklists_to_history()
  from public, anon, authenticated;

create trigger add_recipe_picklists_to_history
  before insert on public.recipe_history
  for each row execute function private.add_recipe_picklists_to_history();