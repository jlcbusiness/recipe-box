alter table public.accounts
  drop constraint accounts_ingredient_color_check,
  drop constraint accounts_temperature_color_check,
  drop constraint accounts_duration_color_check,
  add constraint accounts_ingredient_color_check
    check (ingredient_color in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    )),
  add constraint accounts_temperature_color_check
    check (temperature_color in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    )),
  add constraint accounts_duration_color_check
    check (duration_color in (
      'black', 'navy', 'dark_blue', 'dark_green', 'teal', 'dark_red',
      'dark_orange', 'dark_purple', 'none', 'red', 'orange', 'yellow',
      'green', 'blue', 'purple', 'pink'
    ));

create or replace function public.update_account_unit_preferences(
  p_volume_system text default null,
  p_weight_system text default null,
  p_ingredient_presentation text default null,
  p_hand_preference text default null,
  p_ingredient_color text default null,
  p_temperature_color text default null,
  p_duration_color text default null,
  p_private_print_uses_colors boolean default null
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

notify pgrst, 'reload schema';