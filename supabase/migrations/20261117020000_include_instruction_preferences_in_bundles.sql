create or replace function public.read_export_snapshot(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  preferences public.accounts;
begin
  snapshot := public.read_export_snapshot_without_ingredient_sets(p_account_id);
  if snapshot is null then
    return null;
  end if;

  select * into preferences
  from public.accounts as account
  where account.id = p_account_id;
  if not found then
    return null;
  end if;

  snapshot := jsonb_set(
    snapshot,
    '{records,recipe_ingredient_sets}',
    coalesce((
      select jsonb_agg(to_jsonb(record_row))
      from public.recipe_ingredient_sets as record_row
      where record_row.account_id = p_account_id
    ), '[]'::jsonb),
    true
  );
  snapshot := jsonb_set(
    snapshot,
    '{accountPreferences,ingredient_color}',
    to_jsonb(preferences.ingredient_color),
    true
  );
  snapshot := jsonb_set(
    snapshot,
    '{accountPreferences,temperature_color}',
    to_jsonb(preferences.temperature_color),
    true
  );
  snapshot := jsonb_set(
    snapshot,
    '{accountPreferences,duration_color}',
    to_jsonb(preferences.duration_color),
    true
  );
  snapshot := jsonb_set(
    snapshot,
    '{accountPreferences,private_print_uses_colors}',
    to_jsonb(preferences.private_print_uses_colors),
    true
  );
  return snapshot;
end;
$$;

revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;

create function public.commit_database_import_with_preferences(
  p_account_id uuid,
  p_account_preferences jsonb,
  p_records jsonb,
  p_expected_versions jsonb,
  p_replace_recipe_ids uuid[],
  p_replace_publication_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  allowed_colors text[] := array['blue', 'green', 'teal', 'red', 'orange', 'none'];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_account_preferences) is distinct from 'object' then
    raise exception 'Account preferences are invalid.' using errcode = '23514';
  end if;
  if (p_account_preferences ? 'ingredient_color' and not (
        p_account_preferences->>'ingredient_color' = any(allowed_colors)
      )) or (p_account_preferences ? 'temperature_color' and not (
        p_account_preferences->>'temperature_color' = any(allowed_colors)
      )) or (p_account_preferences ? 'duration_color' and not (
        p_account_preferences->>'duration_color' = any(allowed_colors)
      )) or (p_account_preferences ? 'private_print_uses_colors' and
        jsonb_typeof(p_account_preferences->'private_print_uses_colors') <> 'boolean')
  then
    raise exception 'Account emphasis preferences are invalid.' using errcode = '23514';
  end if;

  result := public.commit_database_import(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids
  );

  update public.accounts as account
  set ingredient_color = coalesce(
        p_account_preferences->>'ingredient_color', account.ingredient_color
      ),
      temperature_color = coalesce(
        p_account_preferences->>'temperature_color', account.temperature_color
      ),
      duration_color = coalesce(
        p_account_preferences->>'duration_color', account.duration_color
      ),
      private_print_uses_colors = coalesce(
        (p_account_preferences->>'private_print_uses_colors')::boolean,
        account.private_print_uses_colors
      )
  where account.id = p_account_id;

  return result;
end;
$$;

revoke all on function public.commit_database_import_with_preferences(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) from public, anon, authenticated;
grant execute on function public.commit_database_import_with_preferences(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[]
) to service_role;

notify pgrst, 'reload schema';
