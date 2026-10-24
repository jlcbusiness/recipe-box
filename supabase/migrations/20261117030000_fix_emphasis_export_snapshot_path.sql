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

notify pgrst, 'reload schema';
