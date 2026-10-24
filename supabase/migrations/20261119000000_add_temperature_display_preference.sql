alter table public.accounts
  add column temperature_system text not null default 'fahrenheit'
    constraint accounts_temperature_system_check
    check (temperature_system in ('fahrenheit', 'celsius'));

drop function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean
);

create function public.update_account_unit_preferences(
  p_volume_system text default null,
  p_weight_system text default null,
  p_ingredient_presentation text default null,
  p_hand_preference text default null,
  p_ingredient_color text default null,
  p_temperature_color text default null,
  p_duration_color text default null,
  p_private_print_uses_colors boolean default null,
  p_temperature_system text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  if p_volume_system is not null
    and p_volume_system not in ('us_customary', 'metric') then
    raise exception 'Unsupported volume measurement system';
  end if;

  if p_weight_system is not null
    and p_weight_system not in ('us_customary', 'metric') then
    raise exception 'Unsupported weight measurement system';
  end if;

  if p_temperature_system is not null
    and p_temperature_system not in ('fahrenheit', 'celsius') then
    raise exception 'Unsupported temperature measurement system';
  end if;

  if p_ingredient_presentation is not null
    and p_ingredient_presentation not in ('standard', 'ingredient_first') then
    raise exception 'Unsupported ingredient presentation';
  end if;

  if p_hand_preference is not null
    and p_hand_preference not in ('left', 'right') then
    raise exception 'Unsupported hand preference';
  end if;

  if p_ingredient_color is not null
    and p_ingredient_color not in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ) then
    raise exception 'Unsupported ingredient color';
  end if;

  if p_temperature_color is not null
    and p_temperature_color not in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ) then
    raise exception 'Unsupported temperature color';
  end if;

  if p_duration_color is not null
    and p_duration_color not in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ) then
    raise exception 'Unsupported duration color';
  end if;

  update public.accounts
  set
    volume_system = coalesce(p_volume_system, volume_system),
    weight_system = coalesce(p_weight_system, weight_system),
    temperature_system = coalesce(p_temperature_system, temperature_system),
    ingredient_presentation = coalesce(p_ingredient_presentation, ingredient_presentation),
    hand_preference = coalesce(p_hand_preference, hand_preference),
    ingredient_color = coalesce(p_ingredient_color, ingredient_color),
    temperature_color = coalesce(p_temperature_color, temperature_color),
    duration_color = coalesce(p_duration_color, duration_color),
    private_print_uses_colors = coalesce(p_private_print_uses_colors, private_print_uses_colors)
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean, text
) from public, anon;
grant execute on function public.update_account_unit_preferences(
  text, text, text, text, text, text, text, boolean, text
) to authenticated;

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
  snapshot := jsonb_set(
    snapshot,
    '{accountPreferences,temperature_system}',
    to_jsonb(preferences.temperature_system),
    true
  );
  return snapshot;
end;
$$;

create or replace function public.commit_database_import_with_preferences(
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
  allowed_colors text[] := array[
    'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
    'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
    'green', 'blue', 'purple', 'pink'
  ];
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
        jsonb_typeof(p_account_preferences->'private_print_uses_colors') <> 'boolean'
      ) or (p_account_preferences ? 'temperature_system' and not coalesce(
        p_account_preferences->>'temperature_system' = any(array['fahrenheit', 'celsius']),
        false
      ))
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
      ),
      temperature_system = coalesce(
        p_account_preferences->>'temperature_system', account.temperature_system
      )
  where account.id = p_account_id;

  return result;
end;
$$;

notify pgrst, 'reload schema';